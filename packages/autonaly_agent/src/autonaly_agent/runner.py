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
    agents: list[str] = field(default_factory=list)
    """Every agent that produced events, in order — the routing audit trail."""

    filed_id: str | None = None
    """The briefing record id, captured from submit_for_review's response — the
    hook downstream fan-out (proactive analyst notes) keys on."""

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

    @property
    def specialist(self) -> str | None:
        """The specialist the coordinator handed the event to, if any."""
        for name in self.agents:
            if name != "crisis_desk":
                return name
        return None

    def summary(self) -> str:
        return (
            f"signal={self.signal_key} "
            f"specialist={self.specialist or 'none (handled by coordinator)'} "
            f"route={self.route or 'none (out of scope)'} "
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
        author = getattr(event, "author", None)
        if author and (not result.agents or result.agents[-1] != author):
            result.agents.append(author)
        for part in (event.content.parts if event.content else []) or []:
            if getattr(part, "function_call", None):
                result.tool_calls.append(part.function_call.name)
            elif getattr(part, "function_response", None):
                fr = part.function_response
                if fr.name == "submit_for_review":
                    response = fr.response or {}
                    if not isinstance(response, dict):
                        response = {}
                    result.filed_id = (
                        response.get("record_id")
                        or (response.get("result") or {}).get("record_id")
                        or result.filed_id
                    )
            elif getattr(part, "text", None):
                result.final_text = part.text

    _attach_trail(result)
    log.info("agent run complete: %s", result.summary())
    return result


def _attach_trail(result: AgentRun) -> None:
    """Write the routing decision onto the filed briefing.

    It cannot be part of submit_for_review: the specialist and route are only
    known once the run has finished, and the tool is called mid-run. Best
    effort — a briefing is still valid without its trail, so a failure here
    must not fail the run.
    """
    if not result.filed_id:
        return
    try:
        from autonaly_core import build_review_queue, get_settings

        build_review_queue().attach_trail(
            result.filed_id,
            {
                "coordinator": "crisis_desk",
                "specialist": result.specialist,
                "route": result.route,
                "tools_used": list(dict.fromkeys(result.tool_calls)),
                "model": get_settings().gemini_model,
            },
        )
    except Exception:  # noqa: BLE001 - provenance is additive, never fatal
        log.warning("could not attach agent trail to %s", result.filed_id, exc_info=True)
