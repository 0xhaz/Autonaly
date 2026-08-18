"""Drive the agent over one signal and print its reasoning trace.

    uv run python scripts/run_agent.py suez
    uv run python scripts/run_agent.py rare-earth
    uv run python scripts/run_agent.py financial     # out-of-scope guard
    uv run python scripts/run_agent.py hormuz        # degraded-data escalation

Requires the engine on :8080 and the emulators up (`make up && make engine-local`).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env.local")

SIGNALS = {
    "suez": (
        "Container ship Ever Given runs aground in Suez Canal, blocking all traffic",
        "The 20,000-TEU vessel wedged across the waterway on 23 March 2021, halting "
        "transits in both directions. Salvage crews expect several days. Event ran "
        "2021-03-23 to 2021-03-29.",
    ),
    "rare-earth": (
        "China announces export licensing regime for rare-earth magnets",
        "Beijing will require export licences for neodymium-iron-boron permanent "
        "magnets and related processed rare-earth products, effective immediately.",
    ),
    "black-sea": (
        "Bosporus transit halted as Black Sea tensions escalate",
        "Commercial transits through the Bosporus Strait have been suspended amid "
        "escalating naval tensions, cutting off Black Sea grain and fertilizer "
        "exports. Ukrainian and Russian wheat shipments are held at anchor. "
        "Window began 2026-08-10 and is ongoing.",
    ),
    "financial": (
        "Regional bank collapse triggers credit crunch across eurozone",
        "Two mid-sized lenders failed after a run on deposits; interbank lending "
        "rates spiked and equity markets fell sharply.",
    ),
    "hormuz": (
        "Naval tensions escalate in the Strait of Hormuz",
        "Shipping advisories warn of interference with commercial traffic through "
        "the strait. Window 2026-07-01 to 2026-07-31.",
    ),
}


async def main() -> int:
    which = sys.argv[1] if len(sys.argv) > 1 else "suez"
    if which not in SIGNALS:
        print(f"unknown signal {which!r}; choose from {sorted(SIGNALS)}")
        return 2

    headline, body = SIGNALS[which]

    from autonaly_agent.agent import root_agent
    from google.adk import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        app_name="autonaly",
        session_service=session_service,
        auto_create_session=True,
    )

    print(f"\n  SIGNAL: {headline}\n")

    message = types.Content(
        role="user",
        parts=[types.Part(text=f"Headline: {headline}\n\nBody: {body}")],
    )

    final_text = ""
    async for event in runner.run_async(
        user_id="demo", session_id=f"{which}-run", new_message=message
    ):
        for part in (event.content.parts if event.content else []) or []:
            if getattr(part, "function_call", None):
                call = part.function_call
                args = {
                    k: (str(v)[:70] + "..." if len(str(v)) > 70 else v)
                    for k, v in (call.args or {}).items()
                }
                print(f"  -> {call.name}({args})")
            elif getattr(part, "function_response", None):
                name = part.function_response.name
                print(f"  <- {name} returned")
            elif getattr(part, "text", None):
                final_text = part.text

    print("\n  --- BRIEFING ---\n")
    print("\n".join(f"  {line}" for line in final_text.splitlines()))
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
