# Methodology

Every figure Autonaly publishes comes from this document plus a row of source data. The
formula is deterministic, the inputs are public, and the simplifications are listed below
rather than buried.

Source code carries references like `(D13.1)` or `RK2`. Those point at internal design
records; the ones that affect a published number are all restated here.

---

## 1. What is being measured

A crisis is defined as: **supply of commodity basket Z from source S disrupted at severity
level L for duration T.**

For each importing country X, the engine computes:

### 1.1 Direct dependency ratio

```
ddr = X's imports of Z from S  /  X's total imports of Z
```

Computed from CEPII BACI bilateral flows at HS6, aggregated to the commodity basket.

### 1.2 Supplier concentration

```
hhi = Σ (share of each supplier in X's imports of Z)²
```

A Herfindahl index on the 0–1 scale. High concentration means few alternatives, so an
equal lost share hurts more. It enters the score through:

```
concentration_factor = 0.5 + 0.5 × hhi
```

The floor of 0.5 is deliberate: a country with perfectly diversified suppliers still
suffers when one stops — it simply has somewhere to turn. Concentration modulates the
score; it never zeroes it.

### 1.3 Essentiality

Each basket carries a criticality weight: staples and energy 1.0, fertiliser 0.9, critical
minerals 0.8, industrial inputs 0.6. Where a request spans several baskets the engine takes
the **maximum**, not the mean — a bulk industrial basket must not dilute a food emergency.

### 1.4 Severity

```
severity = transit_reduction × max(0.35, min(1, duration_months / 6))
```

Duration saturates at six months because buyers re-contract; a twelve-month disruption is
not twice as bad as a six-month one. The 0.35 floor exists because a disruption lasting
days still has immediate impact.

### 1.5 The score

```
score = 100 × ddr × concentration_factor × essentiality × severity
```

**The underlying ratios are always published alongside the score.** A score without its
`ddr`, `hhi`, and absolute value at risk is not interpretable, and the API never returns
one without them.

---

## 2. Intensity and magnitude are different questions

This is the most important thing to understand about reading a ranking.

The exposure score measures **intensity** of dependency. It does not measure how much trade
is at stake. These genuinely disagree, and the disagreement is informative:

> In a Black Sea wheat disruption, **Egypt ranks eighth by score** — 77% dependent, but
> with relatively diversified suppliers — while carrying **$4.0bn at risk, roughly ten
> times the country ranked above it.**
>
> In a Strait of Hormuz closure, **China carries the largest absolute exposure** while
> barely registering on intensity, because its energy sourcing is well diversified.

Neither ordering is wrong; a briefing that reports only one is misleading. So the engine
computes `largest_absolute_exposure` itself and returns `value_at_risk_kusd` on every row,
rather than leaving a narrative writer to infer magnitude from the top of an
intensity-sorted list.

### Materiality floor

A country importing a trivial amount of a basket at 100% dependency is not a global-supply
story. Without a floor, a Black Sea wheat ranking is topped by Armenia at $60m while Egypt
at $5.2bn falls off the page.

The floor is the greater of $100m and **5 basis points of the basket's world trade**. A
flat threshold cannot serve baskets spanning three orders of magnitude: $100m is trivial
against $1.5tn of crude oil and enormous against $5bn of rare-earth magnets.

---

## 3. Commodity baskets

Exposure is computed over curated baskets of HS6 codes, not single codes. This is not
cosmetic — asked at the wrong granularity the same data gives the wrong answer:

| Question asked | Answer | Reality |
|---|---|---|
| Wheat, HS 100199 only | Russia absent from top 3 | Russia is the **largest** wheat exporter, 15.8% across HS 1001xx |
| Rare earths, HS 280530 (raw metal) | China 21% | China holds **62%** of permanent magnets, HS 850511 — where control actually binds |

Neither wrong answer raises an error. It produces a confident, well-formatted, wrong
briefing. So basket definitions are declared once, validated against the product table on
every pipeline run, and shared by every scenario. A basket referencing a non-existent HS6
code fails the build rather than silently contributing zero.

23 baskets are defined across staples, energy, fertiliser, critical minerals and industrial
inputs. Sanity-checked against known economics: Morocco 42% of phosphates, DR Congo 60% of
cobalt, Australia 55% of iron ore, Taiwan 24% of semiconductors.

---

## 4. Chokepoints

Maritime routing is not reinvented. IMF PortWatch supplies observed vessel transits; a
curated routing table supplies the trade geography. Two properties matter.

### 4.1 A route you can sail around is a delay, not a cutoff

Conflating the two is the fastest way to an indefensible number.

| Chokepoint | Bypass | Attenuation |
|---|---|---|
| Strait of Hormuz | none — Gulf seaborne exports have one exit | 1.0 |
| Suez Canal | Cape of Good Hope, ~10 extra days | 0.35 |

The same 71% observed transit collapse therefore scores **2.6 at Suez** and **23.9 at
Hormuz**. The attenuation factor is a stated assumption, not a calibrated elasticity, and
v1 does not pretend otherwise.

A consequence worth stating plainly: **the 2021 Ever Given grounding scores low.** Suez
transits fell from 56.9/day to a trough of 2 — a 96% collapse — but cargo could divert.
The trade data says this was a costly delay rather than a supply shortage. That cuts
against much contemporary commentary, and it is what the numbers support.

### 4.2 Only the route actually served is scored

Asian exports to the United States cross the Pacific and never approach Suez. Scoring them
against a Suez closure would overstate exposure, so the Suez route restricts to European
and Mediterranean importers. Hormuz is deliberately unrestricted — everyone buying Gulf
energy is exposed.

### 4.3 Severity is measured, and refused when unmeasurable

Severity comes from observed transits against a 28-day baseline, not from an assumed
ladder rung.

That feed can fail. **Measured 2026-08-17: Strait of Hormuz reported 8.4 transits/day
against 83.5 in 2023 and 85.5 in 2025, with near-zero capacity, while Malacca, Panama,
Gibraltar and Suez were all normal.** That is either the largest energy supply shock on
record or degraded AIS — PortWatch flags GPS jamming around Hormuz explicitly — and the
data alone cannot distinguish them.

So any observation whose baseline has fallen below half its long-run level is flagged
`suspect` and **will not yield a severity**. It escalates to human review instead.

Note which way the naive error runs: measured against its own degraded baseline the drop
looks like a routine 25%. Measured against the long-run level it is ~90%. Neither is
publishable, and the mild-looking figure is the more dangerous of the two.

---

## 5. Simplifications

These are the honest limits of v1. They apply to every published figure.

- **Latest-year trade weights.** Exposure uses the most recent BACI year (2024, released
  January 2026). A historical event is scored against current trade structure, not the
  structure of its own time.
- **First-order effects only.** Direct import dependency. Second-order chains — the kind
  where neon shortages reach fabs and then cars — are not computed.
- **No inventories, no domestic production, no price elasticity.** A country with six
  months of grain reserves and one with none score identically.
- **No substitution modelling.** The winners column ranks exporters by world share and
  headroom; it does not estimate whether they *would* redirect, or at what premium.
- **Value, not volume.** Ratios are computed on trade value. A commodity whose price moved
  sharply within the year carries that distortion.
- **Attenuation factors are assumptions.** The reroute penalty is a stated constant, not an
  estimated freight-cost elasticity.
- **AIS has gaps.** Vessel transits degrade under GPS jamming and in conflict zones. §4.3
  describes the guard; the guard detects degradation, it does not repair it.

## 6. Winners

Every scenario names beneficiaries — substitute exporters with volume to redirect. A
supplier is ranked by world export share weighted by headroom, since an exporter already
supplying most of an importer's demand cannot win much more.

Countries sourcing more than 50% of their own supply from the disrupted origins are
excluded. They are seeking volume, not offering it — without this filter Germany appears
as both a top-five casualty and a winner of the same rare-earth restriction.

This is a rendering of existing trade data, not a forecast of who *will* gain.

## 7. Regression testing

Known history is encoded as assertions, so a data refresh or formula change cannot quietly
break something already established:

- Egypt is 77% dependent on Russia and Ukraine for wheat, 91% across the full Black Sea
  basket, and carries the largest absolute exposure.
- Turkey, Pakistan and Kenya all exceed 60% Black Sea wheat dependency — the countries the
  2022 grain crisis actually hit.
- China holds >55% of permanent magnet exports and <40% of raw rare-earth metal.
- Taiwan appears as a top-three semiconductor exporter, which depends on correctly
  resolving BACI's "Other Asia, nes" code — $526bn of exports that would otherwise vanish.

## Attribution

Data: BACI/CEPII (Etalab 2.0, attribution required) · UN Global Platform; IMF PortWatch ·
USGS Mineral Commodity Summaries (public domain).

Academic anchors: Braun (2023), *The World Economy* [10.1111/twec.13417] on
product-network exposure; Zhang et al. (2023), *Scientific Reports*
[10.1038/s41598-023-43883-4] on vulnerability weighting.
