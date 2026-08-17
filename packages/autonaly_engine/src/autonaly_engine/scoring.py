"""Deterministic exposure scoring (architecture.md D12–D16).

This module is the half of the architecture thesis that is *not* an LLM:
"Gemini reasons and routes; a deterministic engine computes; a human approves."
Nothing here is stochastic, nothing calls a model, and every output number is a
pure function of BACI rows and the constants below.

The formula (D13), per importing country X, commodity basket Z, disrupted
sources S:

    ddr          = imports of Z from S / total imports of Z by X       (D13.1)
    criticality  = essentiality(Z) x concentration(hhi)                (D13.2)
    severity     = transit_reduction x duration_factor                 (D15)

    score        = 100 x ddr x criticality x severity

Deliberate simplifications, published on the methodology page (D14): static
latest-year weights; no inventories, domestic production or price elasticity;
first-order effects only.
"""

from __future__ import annotations

from dataclasses import dataclass

# Concentration floor. A country whose suppliers are perfectly diversified
# (hhi -> 0) still suffers when a supplier stops; it just has somewhere to turn.
# So concentration scales the score between HALF and full, never to zero.
CONCENTRATION_FLOOR = 0.5

# Duration damping. A twelve-month disruption is not twelve times worse than a
# one-month one — buyers re-contract. Saturating curve, capped at 1.0.
DURATION_SATURATION_MONTHS = 6.0


@dataclass(frozen=True)
class Severity:
    """One rung of an escalation ladder (D15)."""

    label: str
    transit_reduction: float
    duration_months: int

    def multiplier(self) -> float:
        duration = min(1.0, self.duration_months / DURATION_SATURATION_MONTHS)
        # A zero-month event still has immediate impact; floor the duration term.
        return self.transit_reduction * max(0.35, duration)


def concentration_factor(hhi: float) -> float:
    """Map supplier concentration onto [CONCENTRATION_FLOOR, 1].

    High HHI means few alternative suppliers, so the same lost share hurts more.
    """
    return CONCENTRATION_FLOOR + (1.0 - CONCENTRATION_FLOOR) * max(0.0, min(1.0, hhi))


def exposure_score(
    ddr: float,
    hhi: float,
    essentiality_weight: float,
    severity: Severity,
) -> float:
    """0-100 exposure score (D14). Underlying ratios travel with it, always."""
    raw = ddr * concentration_factor(hhi) * essentiality_weight * severity.multiplier()
    return round(100.0 * max(0.0, min(1.0, raw)), 1)


def substitution_capacity(
    supplier_global_share: float, is_disrupted: bool, existing_share: float
) -> float:
    """Rank beneficiaries (D16).

    A winner needs volume to redirect *and* headroom — an exporter already
    supplying most of this importer's demand cannot win much more. This is a
    rendering of existing data, not new modelling.
    """
    if is_disrupted:
        return 0.0
    headroom = max(0.0, 1.0 - existing_share)
    return round(supplier_global_share * headroom, 4)
