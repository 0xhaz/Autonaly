"""IMF PortWatch client (techstacks.md §2: httpx + tenacity).

Supplies the *observed* severity that hackathon.md §4 calls for — "severity from
observed transit delta vs ladder" — rather than an assumed one. The engine still
does the arithmetic; this just measures what the ships actually did.

Every response is snapshot-able to `tests/fixtures/`. That is deliberate: a demo
rehearsal must never depend on someone else's uptime, and PortWatch refreshes
weekly so live calls add nothing during development.

    Data: UN Global Platform; IMF PortWatch (portwatch.imf.org)
"""

from __future__ import annotations

import json
import logging
import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

log = logging.getLogger(__name__)

ARCGIS_ROOT = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services"
DAILY_CHOKEPOINTS = f"{ARCGIS_ROOT}/Daily_Chokepoints_Data/FeatureServer/0/query"
CHOKEPOINT_META = f"{ARCGIS_ROOT}/PortWatch_chokepoints_database/FeatureServer/0/query"

ATTRIBUTION = "Data: UN Global Platform; IMF PortWatch"

# Compared against the 28 days before the event. Long enough to average out
# weekday effects, short enough to stay seasonally comparable.
BASELINE_DAYS = 28

# If the 28-day baseline is itself this far below the long-run level for the same
# chokepoint, the baseline cannot be trusted as a reference — and neither can any
# severity derived from it.
#
# This is not hypothetical. Measured 2026-08-17: Strait of Hormuz daily transits
# ran 83.5 (Jul 2023) and 85.5 (Jul 2025), then 8.4 (Jul 2026) with near-zero
# reported capacity, while Malacca, Panama, Gibraltar and Suez were all normal in
# the same window. A sustained 90% fall at Hormuz is either the largest energy
# supply shock on record or the AIS degradation architecture.md RK2 predicts —
# PortWatch flags GPS jamming there explicitly — and the data alone cannot
# distinguish them.
#
# Publishing "Hormuz transits down 90%" on an artifact would be indefensible if
# it were an artifact. So the pipeline refuses to infer severity here and sends
# the anomaly to the human queue instead. This is the case that makes the
# approval gate load-bearing rather than decorative.
SUSPECT_BASELINE_RATIO = 0.5

# Long-run reference window: the year ending one year before the event, which
# controls for seasonality without overlapping the event itself.
REFERENCE_LOOKBACK_DAYS = 730
REFERENCE_LEAD_DAYS = 365


class PortWatchError(RuntimeError):
    pass


@dataclass(frozen=True)
class TransitDay:
    day: date
    n_total: int
    n_container: int
    n_tanker: int
    n_dry_bulk: int
    capacity: int


@dataclass
class TransitObservation:
    """What the ships did, and the transit reduction implied by it."""

    chokepoint: str
    event_window: tuple[date, date]
    baseline_window: tuple[date, date]
    baseline_mean: float
    event_mean: float
    trough_day: date | None
    trough_count: int | None
    series: list[TransitDay] = field(default_factory=list)
    reference_mean: float | None = None
    """Long-run level for this chokepoint, used to sanity-check the baseline."""

    suspect_reason: str | None = None
    """Set when the observation cannot be trusted to yield a severity."""

    @property
    def is_suspect(self) -> bool:
        return self.suspect_reason is not None

    @property
    def severity_is_derivable(self) -> bool:
        """False means: escalate to a human, do not publish a computed severity."""
        return not self.is_suspect

    @property
    def transit_reduction(self) -> float:
        """Observed fractional drop in daily transits, clamped to [0, 1]."""
        if self.baseline_mean <= 0:
            return 0.0
        drop = (self.baseline_mean - self.event_mean) / self.baseline_mean
        return max(0.0, min(1.0, round(drop, 4)))

    @property
    def trough_reduction(self) -> float:
        """Drop at the worst single day — the headline figure for a briefing."""
        if self.baseline_mean <= 0 or self.trough_count is None:
            return 0.0
        drop = (self.baseline_mean - self.trough_count) / self.baseline_mean
        return max(0.0, min(1.0, round(drop, 4)))

    def summary(self) -> str:
        base = (
            f"{self.chokepoint}: daily transits fell from {self.baseline_mean:.1f} "
            f"(28-day baseline) to {self.event_mean:.1f}, a "
            f"{self.transit_reduction * 100:.0f}% reduction"
            + (
                f"; trough {self.trough_count} on {self.trough_day} "
                f"({self.trough_reduction * 100:.0f}% below baseline)"
                if self.trough_day
                else ""
            )
        )
        return base if not self.is_suspect else f"{base}. SUSPECT: {self.suspect_reason}"


def _iso(d: date) -> str:
    return d.isoformat()


@retry(
    retry=retry_if_exception_type((httpx.HTTPError, PortWatchError)),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(4),
    reraise=True,
)
def _query(url: str, params: dict[str, str], timeout: float = 30.0) -> dict:
    with httpx.Client(timeout=timeout) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
    # ArcGIS reports failures as HTTP 200 with an error body, so status alone is
    # not enough to know the call worked.
    if "error" in payload:
        raise PortWatchError(str(payload["error"].get("message", payload["error"])))
    return payload


def fetch_transits(chokepoint_name: str, start: date, end: date) -> list[TransitDay]:
    """Daily transit counts for one chokepoint over an inclusive date range."""
    payload = _query(
        DAILY_CHOKEPOINTS,
        {
            "where": (
                f"portname='{chokepoint_name}' "
                f"AND date >= timestamp '{_iso(start)} 00:00:00' "
                f"AND date <= timestamp '{_iso(end)} 23:59:59'"
            ),
            "outFields": "date,n_total,n_container,n_tanker,n_dry_bulk,capacity",
            "orderByFields": "date",
            "returnGeometry": "false",
            "resultRecordCount": "2000",
            "f": "json",
        },
    )
    days = [
        TransitDay(
            day=date.fromisoformat(str(a["date"])[:10]),
            n_total=a.get("n_total") or 0,
            n_container=a.get("n_container") or 0,
            n_tanker=a.get("n_tanker") or 0,
            n_dry_bulk=a.get("n_dry_bulk") or 0,
            capacity=a.get("capacity") or 0,
        )
        for a in (f["attributes"] for f in payload.get("features", []))
    ]
    if not days:
        raise PortWatchError(
            f"no transit rows for {chokepoint_name!r} between {start} and {end}"
        )
    return days


def observe(
    chokepoint_name: str,
    event_start: date,
    event_end: date,
    baseline_days: int = BASELINE_DAYS,
    tail_days: int = 0,
) -> TransitObservation:
    """Measure the transit reduction during an event against its prior baseline.

    `tail_days` extends the returned series past the event without affecting any
    statistic. Recovery — the backlog clearing above baseline — is the other half
    of the story a chart needs to tell, so it is worth carrying.
    """
    baseline_start = event_start - timedelta(days=baseline_days)
    baseline_end = event_start - timedelta(days=1)

    series = fetch_transits(
        chokepoint_name, baseline_start, event_end + timedelta(days=tail_days)
    )

    baseline = [d.n_total for d in series if baseline_start <= d.day <= baseline_end]
    event = [d.n_total for d in series if event_start <= d.day <= event_end]

    if not baseline or not event:
        raise PortWatchError(
            f"insufficient coverage for {chokepoint_name!r}: "
            f"{len(baseline)} baseline days, {len(event)} event days"
        )

    trough = min(
        (d for d in series if event_start <= d.day <= event_end),
        key=lambda d: d.n_total,
    )

    baseline_mean = round(statistics.fmean(baseline), 2)
    reference_mean, suspect = _check_baseline(chokepoint_name, event_start, baseline_mean)

    return TransitObservation(
        chokepoint=chokepoint_name,
        event_window=(event_start, event_end),
        baseline_window=(baseline_start, baseline_end),
        baseline_mean=baseline_mean,
        event_mean=round(statistics.fmean(event), 2),
        trough_day=trough.day,
        trough_count=trough.n_total,
        series=series,
        reference_mean=reference_mean,
        suspect_reason=suspect,
    )


def _check_baseline(
    chokepoint_name: str, event_start: date, baseline_mean: float
) -> tuple[float | None, str | None]:
    """Compare the baseline against the long-run level for the same chokepoint.

    Returns (reference_mean, suspect_reason). A missing reference is not treated
    as suspicious — early data simply cannot be checked this way.
    """
    ref_start = event_start - timedelta(days=REFERENCE_LOOKBACK_DAYS)
    ref_end = event_start - timedelta(days=REFERENCE_LEAD_DAYS)

    try:
        reference = fetch_transits(chokepoint_name, ref_start, ref_end)
    except (PortWatchError, httpx.HTTPError) as exc:
        log.info("no long-run reference for %s: %s", chokepoint_name, exc)
        return None, None

    counts = [d.n_total for d in reference]
    if not counts:
        return None, None

    reference_mean = round(statistics.fmean(counts), 2)
    if reference_mean <= 0:
        return reference_mean, None

    ratio = baseline_mean / reference_mean
    if ratio < SUSPECT_BASELINE_RATIO:
        return reference_mean, (
            f"baseline {baseline_mean:.1f}/day is {ratio * 100:.0f}% of the long-run "
            f"level {reference_mean:.1f}/day ({ref_start}..{ref_end}). The reference "
            f"period itself looks disrupted or the AIS feed is degraded (RK2), so a "
            f"transit delta measured against it cannot be published as severity. "
            f"Escalate to human review."
        )
    return reference_mean, None


def fetch_chokepoint_metadata() -> list[dict]:
    """Static chokepoint attributes: location, dominant industries, country shares."""
    payload = _query(
        CHOKEPOINT_META,
        {
            "where": "1=1",
            "outFields": (
                "portid,portname,country,ISO3,fullname,lat,lon,"
                "industry_top1,industry_top2,industry_top3,"
                "share_country_maritime_import,share_country_maritime_export"
            ),
            "returnGeometry": "false",
            "f": "json",
        },
    )
    return [f["attributes"] for f in payload.get("features", [])]


# --------------------------------------------------------------------------
# fixtures — so the build, the tests and a demo rehearsal all work offline
# --------------------------------------------------------------------------


def snapshot(observation: TransitObservation, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "attribution": ATTRIBUTION,
                "chokepoint": observation.chokepoint,
                "event_window": [_iso(d) for d in observation.event_window],
                "baseline_window": [_iso(d) for d in observation.baseline_window],
                "baseline_mean": observation.baseline_mean,
                "event_mean": observation.event_mean,
                "trough_day": _iso(observation.trough_day)
                if observation.trough_day
                else None,
                "trough_count": observation.trough_count,
                "reference_mean": observation.reference_mean,
                "suspect_reason": observation.suspect_reason,
                "series": [
                    {
                        "day": _iso(d.day),
                        "n_total": d.n_total,
                        "n_container": d.n_container,
                        "n_tanker": d.n_tanker,
                        "n_dry_bulk": d.n_dry_bulk,
                        "capacity": d.capacity,
                    }
                    for d in observation.series
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def load_snapshot(path: Path) -> TransitObservation:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return TransitObservation(
        chokepoint=raw["chokepoint"],
        event_window=(
            date.fromisoformat(raw["event_window"][0]),
            date.fromisoformat(raw["event_window"][1]),
        ),
        baseline_window=(
            date.fromisoformat(raw["baseline_window"][0]),
            date.fromisoformat(raw["baseline_window"][1]),
        ),
        baseline_mean=raw["baseline_mean"],
        event_mean=raw["event_mean"],
        trough_day=date.fromisoformat(raw["trough_day"]) if raw["trough_day"] else None,
        trough_count=raw["trough_count"],
        reference_mean=raw.get("reference_mean"),
        suspect_reason=raw.get("suspect_reason"),
        series=[
            TransitDay(
                day=date.fromisoformat(d["day"]),
                n_total=d["n_total"],
                n_container=d["n_container"],
                n_tanker=d["n_tanker"],
                n_dry_bulk=d["n_dry_bulk"],
                capacity=d["capacity"],
            )
            for d in raw["series"]
        ],
    )
