"""One way to run the agent over a signal, shared by the CLI and the subscriber.

Keeping this in one place means the demo script and the Pub/Sub worker exercise
an identical path — what you rehearse is what runs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from autonaly_core.schema import Signal

log = logging.getLogger(__name__)


@dataclass
class AgentRun:
    signal_key: str
    tool_calls: list[str] = field(default_factory=list)
    final_text: str = ""

    @property
    def filed(self) -> bool:
        return "submit_for_review" in self.tool_calls

    @property
    def route(self) -> str | None:
        """The route actually taken, inferred from which data tool was called."""
        for call, route in (
            ("fetch_chokepoint_status", "chokepoint"),
            ("fetch_concentration", "export_restriction"),
            ("resolve_region_exports", "natural_disaster"),
        ):
            if call in self.tool_calls:
                return route
        return None

    def summary(self) -> str:
        return (
            f"signal={self.signal_key} route={self.route or 'none (out of scope)'} "
            f"tools={len(self.tool_calls)} filed={self.filed}"
        )


async def run_on_signal(signal: Signal, session_id: str | None = None) -> AgentRun:
    """Drive the agent over one signal, returning what it did."""
    from google.adk import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    from .agent import root_agent

    key = signal.key()
    result = AgentRun(signal_key=key)

    runner = Runner(
        agent=root_agent,
        app_name="autonaly",
        session_service=InMemorySessionService(),
        auto_create_session=True,
    )

    message = types.Content(
        role="user",
        parts=[
            types.Part(
                text=(
                    f"Headline: {signal.headline}\n\n"
                    f"Body: {signal.body}\n\n"
                    f"Observed at: {signal.observed_at.isoformat()}\n"
                    f"Source: {signal.source}"
                )
            )
        ],
    )

    async for event in runner.run_async(
        user_id="ingest",
        session_id=session_id or f"signal-{key}",
        new_message=message,
    ):
        for part in (event.content.parts if event.content else []) or []:
            if getattr(part, "function_call", None):
                result.tool_calls.append(part.function_call.name)
            elif getattr(part, "text", None):
                result.final_text = part.text

    log.info("agent run complete: %s", result.summary())
    return result
