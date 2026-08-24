"use client";

import { Show, SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  BarRow,
  Fact,
  Group,
  compact,
  people,
  prettyBasket,
  type Port,
  type Profile,
} from "@/components/CountryPrimitives";

/**
 * The standalone country profile (architecture D31): everything the atlas
 * drawer knows, with the room of a full page. Watched countries on the
 * dashboard open here — a watch is a working reference to live data, not a
 * bookmark of a snapshot.
 */

const years = (a: number, b: number | null) =>
  b === null ? `${a} –` : b !== a ? `${a}–${b}` : `${a}`;

export default function CountryPage() {
  const { iso3: raw } = useParams<{ iso3: string }>();
  const iso3 = raw?.toUpperCase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ports, setPorts] = useState<Port[]>([]);
  const [customEligible, setCustomEligible] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [watchBusy, setWatchBusy] = useState(false);
  // See CountryDrawer: the profile fetch is session-guarded.
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!iso3) return;
    fetch(`/api/country/${iso3}?baskets=wheat&top_n=10`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => setError("No profile for this country."));
    fetch("/country-names.json")
      .then((r) => r.json())
      .then(setNames)
      .catch(() => {});
    fetch("/layers/ports-by-country.json")
      .then((r) => r.json())
      .then((d) => setPorts((d[iso3] ?? []).slice(0, 8)))
      .catch(() => {});
    fetch("/api/meta")
      .then((r) => r.json())
      .then((meta) =>
        setCustomEligible(
          (meta.customConflictCountries ?? []).some(
            (c: { iso3: string }) => c.iso3 === iso3,
          ),
        ),
      )
      .catch(() => {});
    if (!isSignedIn) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.profile?.countries) setWatchlist(new Set(body.profile.countries));
      })
      .catch(() => {});
  }, [iso3, isSignedIn]);

  const toggleWatch = async () => {
    if (!iso3 || watchBusy) return;
    setWatchBusy(true);
    const response = await fetch("/api/profile/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: iso3 }),
    });
    setWatchBusy(false);
    if (!response.ok) return;
    const body = await response.json();
    setWatchlist(new Set(body.countries));
  };

  if (error) return <p className="py-10 text-sm" style={{ color: "var(--muted)" }}>{error}</p>;
  if (!profile || !iso3)
    return <p className="py-10 text-sm" style={{ color: "var(--muted)" }}>loading…</p>;

  const ctx = profile.context;
  const eco = profile.economy;
  const name = names[iso3] ?? ctx?.name ?? iso3;
  const watching = watchlist.has(iso3);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
            Country profile
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{name}</h1>
          <p className="mono mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {iso3}
            {ctx?.region ? ` · ${ctx.region}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Show when="signed-in">
            <button
              type="button"
              onClick={toggleWatch}
              disabled={watchBusy}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={
                watching
                  ? {
                      border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
                      background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                      color: "var(--text)",
                    }
                  : { border: "1px solid var(--line)", color: "var(--muted)" }
              }
            >
              {watching ? "★ Watching" : "☆ Watch"}
            </button>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
              >
                ☆ Watch
              </button>
            </SignInButton>
          </Show>
          <Link
            href={`/?country=${iso3}`}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            Open in atlas
          </Link>
          {customEligible && (
            <Link
              href={`/simulate?custom=${iso3}`}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
            >
              Simulate a crisis here
            </Link>
          )}
        </div>
      </header>

      {ctx?.context_note && (
        <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: "var(--warn)" }}>
          {ctx.context_note}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <section className="panel grid grid-cols-2 gap-3 p-4">
            {ctx?.population != null && <Fact label="Population" value={people(ctx.population)} />}
            {ctx?.capital && <Fact label="Capital" value={ctx.capital} />}
            {ctx?.gdp_usd != null && <Fact label="GDP" value={compact(ctx.gdp_usd)} />}
            {ctx?.currency && <Fact label="Currency" value={ctx.currency} />}
            {ctx?.gdp_per_capita_usd != null && (
              <Fact label="GDP per capita" value={compact(ctx.gdp_per_capita_usd)} />
            )}
            {ctx?.gdp_growth_pct != null && (
              <Fact label="GDP growth" value={`${ctx.gdp_growth_pct}%`} />
            )}
            <Fact label="Total exports" value={compact(eco.total_exports_kusd * 1000)} />
            <Fact label="Total imports" value={compact(eco.total_imports_kusd * 1000)} />
            {ctx?.income_group && <Fact label="Income group" value={ctx.income_group} />}
            {ctx?.trade_pct_gdp != null && (
              <Fact label="Trade / GDP" value={`${Math.round(ctx.trade_pct_gdp)}%`} />
            )}
          </section>

          {ports.length > 0 && (
            <section className="panel p-4">
              <Group title="Ports" note="Vessel calls per year · IMF PortWatch">
                {ports.map((p) => (
                  <div key={p.name} className="flex items-baseline justify-between py-[3px] text-xs">
                    <span>{p.name}</span>
                    <span className="mono" style={{ color: "var(--muted)" }}>
                      {p.vessels.toLocaleString()}
                    </span>
                  </div>
                ))}
              </Group>
            </section>
          )}

          {profile.chokepoints.length > 0 && (
            <section className="panel p-4">
              <Group
                title="Chokepoints on its routes"
                note="Whether cargo can divert decides if a closure is a delay or a cutoff."
              >
                {profile.chokepoints.map((t) => (
                  <div key={t.key} className="flex items-baseline justify-between py-[3px] text-xs">
                    <span>
                      {t.label}
                      <span className="ml-2" style={{ color: "var(--muted)" }}>
                        {t.role}
                      </span>
                    </span>
                    <span
                      className="mono text-[10px] uppercase"
                      style={{ color: t.bypass ? "var(--muted)" : "var(--warn)" }}
                    >
                      {t.bypass ? "bypass exists" : "no bypass"}
                    </span>
                  </div>
                ))}
              </Group>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {eco.top_export_baskets.length > 0 && (
            <section className="panel p-4">
              <Group title="What it sells" note="Share of the country's total goods exports.">
                {eco.top_export_baskets.map((b, i) => (
                  <BarRow key={b.basket} label={prettyBasket(b.basket)} share={b.share_of_trade} value={b.value_kusd} index={i} />
                ))}
              </Group>
            </section>
          )}
          {eco.top_import_baskets.length > 0 && (
            <section className="panel p-4">
              <Group title="What it buys" note="Share of the country's total goods imports.">
                {eco.top_import_baskets.map((b, i) => (
                  <BarRow key={b.basket} label={prettyBasket(b.basket)} share={b.share_of_trade} value={b.value_kusd} index={i} />
                ))}
              </Group>
            </section>
          )}
          <section className="panel p-4">
            <Group
              title="Wheat trade lens"
              note="Sources and destinations for one staple basket — open the atlas drawer to switch lenses."
            >
              <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Imports from
              </div>
              {profile.import_sources.map((r, i) => (
                <BarRow key={r.country} label={r.country} fullName={names[r.country]} share={r.share} value={r.value_kusd} index={i} />
              ))}
              <div className="mb-1 mt-3 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Exports to
              </div>
              {profile.export_destinations.map((r, i) => (
                <BarRow key={r.country} label={r.country} fullName={names[r.country]} share={r.share} value={r.value_kusd} index={i} />
              ))}
            </Group>
          </section>
        </div>
      </div>

      {(profile.crisis_history ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Crisis history — the last century</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(profile.crisis_history ?? []).map((e) => (
              <Link key={e.key} href={`/crisis/${e.key}`} className="block">
                <article className="panel h-full p-4 transition-colors hover:border-[color:var(--accent)]">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold">{e.title}</h3>
                    <span className="mono shrink-0 text-[11px]" style={{ color: "var(--accent)" }}>
                      {years(e.year_start, e.year_end)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
                    {e.summary}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    <span style={{ color: "var(--warn)" }}>Rhyme:</span> {e.rhyme}
                  </p>
                </article>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Context: World Bank WDI 2024 · Trade: BACI/CEPII 2024 · Ports and
        chokepoints: IMF PortWatch · live data, recomputed on every visit
      </p>
    </div>
  );
}
