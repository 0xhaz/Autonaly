"""HTTP surface for the agent side (Cloud Run service #2's second port).

The web app cannot call Gemini itself — the LLM lives on the agent side of the
architecture — so personalization is served here and proxied by Next. Locally it
runs on :8090; on Cloud Run it rides in the agent container.

    make agent-api
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .personal import personalize
from .scenario import scenario_brief

log = logging.getLogger(__name__)

app = FastAPI(title="Autonaly agent API", version="1.0.0")


class Profile(BaseModel):
    analyst_name: str = "Your analyst"
    baskets: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    chokepoints: list[str] = Field(default_factory=list)


class PersonalizeRequest(BaseModel):
    profile: Profile
    briefing: dict


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class ScenarioRequest(BaseModel):
    scenario: dict
    rankings: dict


@app.post("/scenario-brief")
def scenario_endpoint(request: ScenarioRequest) -> dict:
    try:
        return scenario_brief(request.scenario, request.rankings)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/personalize")
def personalize_endpoint(request: PersonalizeRequest) -> dict:
    try:
        return personalize(request.profile.model_dump(), request.briefing)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
