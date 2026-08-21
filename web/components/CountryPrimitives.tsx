"use client";

import { useEffect, useState } from "react";

import { formatKusd } from "@/lib/types";

/**
 * Shared building blocks for the country profile: the slide-in drawer on the
 * atlas and the standalone /country/[iso3] page render the same data with the
 * same rows, so the primitives and the payload types live here once.
 */

export const SERIES = "#3987e5";
export const DISRUPTED = "#d03b3b";

export interface Row {
  country: string;
  value_kusd: number;
  share: number;
  disrupted?: boolean;
}

export interface BasketRow {
  basket: string;
  value_kusd: number;
  share_of_trade: number;
}

export interface Context {
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

export interface Economy {
  total_exports_kusd: number;
  total_imports_kusd: number;
  exports_pct_gdp?: number;
  imports_pct_gdp?: number;
  top_export_baskets: BasketRow[];
  top_import_baskets: BasketRow[];
}

export interface Port {
  name: string;
  vessels: number;
  industry?: string | null;
}

export interface Transit {
  key: string;
  label: string;
  role: string;
  reroute: string;
  bypass: boolean;
}

export interface CrisisRow {
  key: string;
  title: string;
  year_start: number;
  year_end: number | null;
  category: string;
  summary: string;
  rhyme: string;
}

export interface Profile {
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

export const compact = (n: number) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}tn`
  : n >= 1e9 ? `$${(n / 1e9).toFixed(0)}bn`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}m`
  : `$${n.toFixed(0)}`;

export const people = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${(n / 1e3).toFixed(0)}k`;

export const prettyBasket = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function Fact({ label, value }: { label: string; value: string }) {
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
export function useCountUp(target: number, durationMs = 550): number {
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

export function BarRow({ label, fullName, share, value, flagged, index = 0 }: {
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

export function Group({ title, children, note }: {
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
