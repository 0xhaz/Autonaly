"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

import { formatKusd, formatPercent, type AffectedCountry } from "@/lib/types";

/**
 * Slide-in country encyclopedia.
 *
 * Two audiences share one surface. Someone who clicked a country because they
 * were curious wants to know what the country *is* — people, economy, currency,
 * what it trades. Someone doing resilience work wants the structure underneath:
 * which commodity groups carry the trade, who the counterparties are, and how
 * much of it sits with a disrupted origin. So the drawer opens on Overview and
 * keeps the analysis one click away, rather than making either audience wade
 * through the other's view.
 *
 * It overlays the map instead of sitting below it, because the map is the
 * primary surface and scrolling away from it breaks the sense of exploring.
 */

const SERIES = "#3987e5";
const DISRUPTED = "#d03b3b";

interface Row {
  country: string;
  value_kusd: number;
  share: number;
  disrupted?: boolean;
}

interface BasketRow {
  basket: string;
  value_kusd: number;
  share_of_trade: number;
}

interface Context {
  name?: string;
  capital?: string | null;
  region?: string | null;
  income_group?: string | null;
  currency?: string | null;
  population?: number;
  gdp_usd?: number;
  gdp_per_capita_usd?: number;
  gdp_growth_pct?: number;
  trade_pct_gdp?: number;
  context_note?: string;
}

interface Economy {
  total_exports_kusd: number;
  total_imports_kusd: number;
  exports_pct_gdp?: number;
  imports_pct_gdp?: number;
  top_export_baskets: BasketRow[];
  top_import_baskets: BasketRow[];
}

interface Port {
  name: string;
  vessels: number;
  industry?: string | null;
}

interface Transit {
  key: string;
  label: string;
  role: string;
  reroute: string;
  bypass: boolean;
}

interface CrisisRow {
  key: string;
  title: string;
  year_start: number;
  year_end: number | null;
  category: string;
  summary: string;
  rhyme: string;
}

interface Profile {
  country: string;
  chokepoints: Transit[];
  crisis_history?: CrisisRow[];
  context: Context | null;
  economy: Economy;
  basket_labels: string[];
  total_imports_kusd: number;
  total_exports_kusd: number;
  world_export_share: number;
  import_sources: Row[];
  export_destinations: Row[];
}

const compact = (n: number) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}tn`
  : n >= 1e9 ? `$${(n / 1e9).toFixed(0)}bn`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}m`
  : `$${n.toFixed(0)}`;

const people = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${(n / 1e3).toFixed(0)}k`;

const prettyBasket = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mono mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

/** Animate a number from zero on mount; reduced-motion lands immediately. */
function useCountUp(target: number, durationMs = 550): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (reduced) {
        setValue(target);
        return;
      }
      const t = Math.min((now - start) / durationMs, 1);
      // Same ease as the bar so digits and bar arrive together.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function BarRow({ label, fullName, share, value, flagged, index = 0 }: {
  label: string;
  fullName?: string;
  share: number;
  value: number;
  flagged?: boolean;
  index?: number;
}) {
  const animatedShare = useCountUp(share);
  const animatedValue = useCountUp(value);
  const delay = `${index * 35}ms`;
  return (
    <div className="group flex items-center gap-2 py-[3px]">
      <span className="mono w-[7.5rem] shrink-0 truncate text-xs" title={fullName ?? label}>
        {fullName && fullName !== label ? (
          <>
            <span className="group-hover:hidden">{label}</span>
            <span className="hidden group-hover:inline" style={{ fontFamily: "inherit" }}>
              {fullName}
            </span>
          </>
        ) : (
          label
        )}
      </span>
      <div className="h-[13px] flex-1">
        <div
          className="bar-grow h-full rounded-[3px]"
          style={{
            width: `${Math.max(share * 100, 1.5)}%`,
            background: flagged ? DISRUPTED : SERIES,
            animationDelay: delay,
          }}
        />
      </div>
      <span className="mono w-11 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        {(animatedShare * 100).toFixed(1)}%
      </span>
      <span className="mono w-14 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        {formatKusd(animatedValue)}
      </span>
    </div>
  );
}

function Group({ title, children, note }: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {title}
      </h4>
      {children}
      {note && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{note}</p>}
    </section>
  );
}

export default function CountryDrawer({
  country,
  baskets,
  sources,
  exposure,
  onClose,
}: {
  country: string | null;
  baskets: string[];
  sources: string[];
  exposure?: AffectedCountry;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portsByCountry, setPortsByCountry] = useState<Record<string, Port[]> | null>(null);
  const [tab, setTab] = useState<"overview" | "analysis" | "history">("overview");
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/country-names.json")
      .then((r) => r.json())
      .then(setCountryNames)
      .catch(() => {});
  }, []);

  const loading = country !== null && profile?.country !== country && error === null;

  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    const query = new URLSearchParams({
      baskets: baskets.join(","),
      sources: sources.join(","),
      top_n: "8",
    });
    fetch(`/api/country/${country}?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setError(null);
        setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError("No profile available for this country.");
      });
    return () => {
      cancelled = true;
    };
  }, [country, baskets, sources]);

  useEffect(() => {
    // Fetched once and reused for every country the reader opens.
    let cancelled = false;
    fetch("/layers/ports-by-country.json")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPortsByCountry(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = country !== null;
  const ctx = profile?.context;
  const eco = profile?.economy;
  const ports = (country && portsByCountry?.[country]) || [];
  const transits = profile?.chokepoints ?? [];

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          // Light enough that the map stays legible behind the drawer — the
          // reader is still exploring a map, not filling in a modal form.
          background: "rgba(4,8,12,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 220ms ease",
          zIndex: 40,
        }}
      />
      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: "min(430px, 92vw)",
          background: "var(--panel)",
          borderLeft: "1px solid var(--line)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 260ms cubic-bezier(0.22,0.61,0.36,1)",
          zIndex: 41,
          overflowY: "auto",
          padding: "1.1rem 1.2rem 3rem",
        }}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight">
              {ctx?.name ?? country}
            </h2>
            <p className="mono text-[11px]" style={{ color: "var(--muted)" }}>
              {country}
              {ctx?.region ? ` · ${ctx.region}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            ✕
          </button>
        </header>

        <div className="mt-3 flex gap-1 rounded-md p-0.5" style={{ background: "var(--panel-2)" }}>
          {(["overview", "analysis", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium capitalize"
              style={{
                background: tab === t ? "var(--panel)" : "transparent",
                color: tab === t ? "var(--text)" : "var(--muted)",
                border: tab === t ? "1px solid var(--line)" : "1px solid transparent",
              }}
            >
              {t === "overview" ? "Overview" : t === "analysis" ? "Trade analysis" : "Crisis history"}
            </button>
          ))}
        </div>

        {loading && <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>loading…</p>}
        {error && <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>{error}</p>}

        {profile && !loading && tab === "overview" && (
          <div className="mt-4 space-y-4">
            {ctx?.context_note && (
              <p className="rounded-md p-2 text-[11px]" style={{ background: "var(--panel-2)", color: "var(--warn)" }}>
                {ctx.context_note}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {ctx?.population != null && <Fact label="Population" value={people(ctx.population)} />}
              {ctx?.capital && <Fact label="Capital" value={ctx.capital} />}
              {ctx?.gdp_usd != null && <Fact label="GDP" value={compact(ctx.gdp_usd)} />}
              {ctx?.currency && <Fact label="Currency" value={ctx.currency} />}
              {ctx?.gdp_per_capita_usd != null && (
                <Fact label="GDP per capita" value={`$${Math.round(ctx.gdp_per_capita_usd).toLocaleString()}`} />
              )}
              {ctx?.gdp_growth_pct != null && <Fact label="GDP growth" value={`${ctx.gdp_growth_pct.toFixed(1)}%`} />}
              {eco && <Fact label="Total exports" value={compact(eco.total_exports_kusd * 1000)} />}
              {eco && <Fact label="Total imports" value={compact(eco.total_imports_kusd * 1000)} />}
              {ctx?.income_group && <Fact label="Income group" value={ctx.income_group} />}
              {ctx?.trade_pct_gdp != null && <Fact label="Trade / GDP" value={`${ctx.trade_pct_gdp.toFixed(0)}%`} />}
            </div>

            {eco && eco.top_export_baskets.length > 0 && (
              <Group title="What it sells" note="Share of the country's total goods exports.">
                {eco.top_export_baskets.slice(0, 5).map((b) => (
                  <BarRow key={b.basket} label={prettyBasket(b.basket)} share={b.share_of_trade} value={b.value_kusd} />
                ))}
              </Group>
            )}

            {ports.length > 0 && (
              <Group
                title="Ports"
                note={`${ports.length} in the PortWatch database · vessel calls per year`}
              >
                {ports.slice(0, 6).map((port) => (
                  <div key={port.name} className="flex items-baseline justify-between gap-2 py-[3px]">
                    <span className="truncate text-xs" title={port.name}>
                      {port.name}
                    </span>
                    <span className="mono shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                      {port.vessels.toLocaleString()}
                    </span>
                  </div>
                ))}
              </Group>
            )}

            {transits.length === 0 && ports.length > 0 && (
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                No modelled chokepoint sits on this country&apos;s routes. Eight are
                modelled so far; all 28 are on the map under Chokepoints.
              </p>
            )}

            {transits.length > 0 && (
              <Group
                title="Chokepoints on its routes"
                note="Whether cargo can divert decides if a closure is a delay or a cutoff."
              >
                {transits.map((t) => (
                  <div key={t.key} className="py-[3px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">{t.label}</span>
                      <span
                        className="mono shrink-0 text-[10px] uppercase tracking-wider"
                        style={{ color: t.bypass ? "var(--muted)" : "#e8a33d" }}
                      >
                        {t.bypass ? "bypass exists" : "no bypass"}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {t.role}
                    </div>
                  </div>
                ))}
              </Group>
            )}

            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              Context: World Bank WDI 2024 · Trade: BACI/CEPII 2024 · Ports and
              chokepoints: IMF PortWatch
            </p>
          </div>
        )}

        {profile && !loading && tab === "analysis" && (
          <div className="mt-4 space-y-4">
            {exposure && (
              <div className="grid grid-cols-2 gap-3 rounded-md p-3" style={{ background: "var(--panel-2)" }}>
                <Fact label="Exposure score" value={`${exposure.score?.toFixed(1) ?? "—"}/100`} />
                <Fact label="At risk" value={formatKusd(exposure.value_at_risk_kusd)} />
                <Fact label="Dependency" value={formatPercent(exposure.ddr)} />
                <Fact label="Concentration" value={exposure.hhi?.toFixed(3) ?? "—"} />
              </div>
            )}

            {eco && (
              <div className="grid grid-cols-2 gap-3">
                <Fact
                  label="Exports / GDP"
                  value={eco.exports_pct_gdp != null ? `${eco.exports_pct_gdp}%` : "—"}
                />
                <Fact
                  label="World share, this basket"
                  value={formatPercent(profile.world_export_share)}
                />
              </div>
            )}

            <Group
              title={`Imports from · ${profile.basket_labels.length} basket${profile.basket_labels.length === 1 ? "" : "s"}`}
              note={sources.length ? "Red marks a disrupted origin." : undefined}
            >
              {profile.import_sources.map((r, i) => (
                <BarRow key={r.country} label={r.country} fullName={countryNames[r.country]} share={r.share} value={r.value_kusd} flagged={r.disrupted} index={i} />
              ))}
            </Group>

            <Group title="Exports to">
              {profile.export_destinations.map((r, i) => (
                <BarRow key={r.country} label={r.country} fullName={countryNames[r.country]} share={r.share} value={r.value_kusd} index={i} />
              ))}
            </Group>

            {eco && eco.top_import_baskets.length > 0 && (
              <Group title="What it buys" note="Share of the country's total goods imports.">
                {eco.top_import_baskets.slice(0, 5).map((b, i) => (
                  <BarRow key={b.basket} label={prettyBasket(b.basket)} share={b.share_of_trade} value={b.value_kusd} index={i} />
                ))}
              </Group>
            )}
          </div>
        )}

        {profile && !loading && tab === "history" && (
          <div className="mt-4 space-y-3">
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              A century of supply crises involving this country — curated from
              the historical record, not generated. History doesn&apos;t repeat,
              but it rhymes: these are the reference class for the next one.
            </p>
            {(profile.crisis_history ?? []).length === 0 && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                No curated crisis events for this country yet.
              </p>
            )}
            {(profile.crisis_history ?? []).map((e) => (
              <Link key={e.key} href={`/crisis/${e.key}`} className="block rounded-md p-3 transition-colors hover:border-[color:var(--accent)]" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold">{e.title}</span>
                  <span className="mono shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>
                    {e.year_start}
                    {e.year_end === null ? "–" : e.year_end !== e.year_start ? `–${e.year_end}` : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {e.category.replace("_", " ")}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#cdd9e8" }}>
                  {e.summary}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  <span style={{ color: "var(--warn)" }}>Rhyme:</span> {e.rhyme}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                  Open the full record →
                </p>
              </Link>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
