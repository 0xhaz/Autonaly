"""Country-code reconciliation (techstacks.md §2).

BACI ships its own `country_codes_V*.csv` carrying ISO2/ISO3, so that table is
the authority rather than a general-purpose library — it is the mapping the
trade data was actually built against. We read it and override only where it
declines to take a position.

Verified against V202601 (2024): exactly three codes lack a standard ISO3.

    490  "Other Asia, nes"                 -> TWN   ($526bn exports — Taiwan)
    697  "Europe EFTA, nes"                -> drop  (empty aggregate)
    711  "Southern African Customs Union"  -> drop  (empty pre-1999 aggregate)

The 490 mapping is load-bearing, not cosmetic. Left unmapped, Taiwan vanishes
from every ranking — and with it semiconductors, which is precisely the
sub-national concentration case architecture.md D19 calls out as moat material.
"""

from __future__ import annotations

import csv
import functools
import re
from pathlib import Path

ISO3_RE = re.compile(r"^[A-Z]{3}$")

# BACI placeholders that look like ISO3 but are not (S19, R20, ZA1 ...).
NON_STANDARD_ISO3 = re.compile(r"^[A-Z]{1,2}\d")

OVERRIDES: dict[int, str] = {
    490: "TWN",  # "Other Asia, nes" — Taiwan in all but name
}

DROP: frozenset[int] = frozenset(
    {
        697,  # Europe EFTA, nes — aggregate, zero flows in 2024
        711,  # Southern African Customs Union (...1999) — historical aggregate
    }
)


@functools.cache
def load_lookup(codes_csv: Path) -> tuple[dict[int, str], tuple[int, ...]]:
    """Read BACI's code table. Returns (m49 -> ISO3, unresolved codes).

    Unresolved codes are returned rather than silently dropped: a new one means
    BACI changed and this module needs a line, which is a decision for a human.
    """
    resolved: dict[int, str] = {}
    unresolved: list[int] = []

    with Path(codes_csv).open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            code = int(row["country_code"])
            if code in DROP:
                continue
            if code in OVERRIDES:
                resolved[code] = OVERRIDES[code]
                continue

            iso3 = (row.get("country_iso3") or "").strip().upper()
            if ISO3_RE.match(iso3) and not NON_STANDARD_ISO3.match(iso3):
                resolved[code] = iso3
            else:
                unresolved.append(code)

    return resolved, tuple(sorted(unresolved))
