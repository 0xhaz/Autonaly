"""Architectural invariants, enforced rather than asserted in prose.

The central claim — "Gemini reasons, a deterministic engine computes" — is only
credible if the engine *cannot* call a model. That is a property of the
dependency graph, so it is checked here.

This test was written after the container audit found the claim was false: the
engine image did contain google-genai, pulled in transitively because
autonaly-core declared it for a script's convenience and nothing in core used it.
"""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGES = REPO_ROOT / "packages"

LLM_PACKAGES = {"google-genai", "google-adk"}


def _declared_dependencies(package: str) -> set[str]:
    data = tomllib.loads((PACKAGES / package / "pyproject.toml").read_text())
    return {
        dep.split(">=")[0].split("==")[0].split("[")[0].strip().lower()
        for dep in data["project"].get("dependencies", [])
    }


class TestDeterministicBoundary:
    """The engine and the shared core must have no path to a model."""

    @pytest.mark.parametrize("package", ["autonaly_engine", "autonaly_core"])
    def test_no_llm_dependency(self, package):
        overlap = _declared_dependencies(package) & LLM_PACKAGES
        assert not overlap, (
            f"{package} declares {overlap}. The deterministic boundary is enforced "
            f"by the dependency graph; adding an LLM library here makes the "
            f"architecture claim false even if no code calls it."
        )

    @pytest.mark.parametrize("package", ["autonaly_engine", "autonaly_core"])
    def test_source_never_imports_a_model_client(self, package):
        # Parse imports rather than grepping text — the engine's own docstring
        # mentions genai precisely to explain why it is absent, and a substring
        # match flagged that as a violation.
        offenders: list[str] = []
        for path in (PACKAGES / package).rglob("*.py"):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                else:
                    continue
                if any(n.startswith(("google.genai", "google.adk")) for n in names):
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")
        assert not offenders, f"{package} imports a model client at {offenders}"


class TestAgentIsWhereTheModelLives:
    """The inverse: the agent package is expected to depend on a model."""

    def test_agent_declares_its_llm_dependencies(self):
        deps = _declared_dependencies("autonaly_agent")
        assert LLM_PACKAGES & deps


class TestPortDiscipline:
    """Three ports, thin adapters, no plugin framework."""

    def test_the_port_surface_stays_small(self):
        # Count protocols *defined* in the module, not names imported into it —
        # BriefingRecord and Callable are neither ports nor scope creep.
        source = (PACKAGES / "autonaly_core/src/autonaly_core/ports.py").read_text()
        defined = [
            node.name
            for node in ast.parse(source).body
            if isinstance(node, ast.ClassDef)
        ]
        assert set(defined) == {"ArtifactStore", "EventBus", "ReviewQueue"}, (
            f"port surface changed to {defined} — three ports, thin adapters, "
            f"no plugin framework"
        )

    def test_application_code_uses_factories_not_adapters(self):
        # Importing an adapter directly would bypass the local|gcp seam.
        offenders = []
        for package in ("autonaly_engine", "autonaly_ingest", "autonaly_agent"):
            for path in (PACKAGES / package).rglob("*.py"):
                if "autonaly_core.adapters" in path.read_text():
                    offenders.append(path.relative_to(REPO_ROOT))
        assert not offenders, f"adapters imported directly: {offenders}"
