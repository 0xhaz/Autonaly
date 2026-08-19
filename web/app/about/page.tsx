import Link from "next/link";

import { SignUpButton } from "@clerk/nextjs";

/**
 * The explainer. The header used to carry the thesis as a strapline; it lives
 * here now, with the room to actually explain itself.
 */

const STEPS: { title: string; body: string }[] = [
  {
    title: "A signal arrives",
    body:
      "A wire headline lands on the event stream — a canal blocked, a strait threatened, an export ban announced. Nobody pushes a button.",
  },
  {
    title: "The desk routes it",
    body:
      "A coordinator classifies the event and hands it to one of three specialist agents — energy, food security, or technology supply — each carrying its own domain knowledge. Financial crises are refused: trade data cannot see them.",
  },
  {
    title: "Severity is measured, not assumed",
    body:
      "For a chokepoint event, the specialist reads real vessel transits from IMF PortWatch. When a headline says “halted” but the ships say 17%, the ships win. When the feed itself looks degraded, the agent refuses to score at all and escalates.",
  },
  {
    title: "A deterministic engine computes",
    body:
      "Exposure scores, dependency ratios and dollars at risk come from an engine with no AI in it — the same maths you can drive by hand in the simulator. The model never generates a number; a guard rejects any narrative containing a figure the engine did not produce.",
  },
  {
    title: "A human approves",
    body:
      "Nothing publishes without a person clicking approve. Briefings the agent could not score honestly arrive unscored, with the reason quoted verbatim.",
  },
];

const SURFACES: { title: string; href: string; body: string }[] = [
  {
    title: "World trade atlas",
    href: "/",
    body:
      "Public. Click any country for its economy, ports, chokepoint dependencies and bilateral trade. Toggle the maritime network — shipping lanes, 300 ports, 28 straits.",
  },
  {
    title: "Scenario simulator",
    href: "/simulate",
    body:
      "Public. Stress-test a strait before the news does. Deterministic and instant — then ask the desk for its read of your hypothetical, clearly labelled as one.",
  },
  {
    title: "Your analyst",
    href: "/dashboard",
    body:
      "Sign in and configure a personal analyst — the commodities, countries and chokepoints it watches. When an event touches your watchlist, its note is waiting before you ask.",
  },
  {
    title: "Review queue",
    href: "/review",
    body:
      "The human gate. Every briefing the desk files waits here for approval — including the ones it refused to score, which is the honesty that makes the rest credible.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12 py-6">
      <header className="space-y-4">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--muted)" }}
        >
          About Autonaly
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          What happens to the world when physical supply breaks?
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "#cdd9e8" }}>
          When a canal is blocked or an export ban lands, someone has to answer who
          gets hurt, and how badly. That answer usually takes an analyst hours of
          assembling trade data by hand — and most published answers are qualitative
          guesses. Autonaly computes it: the countries exposed, their dependency
          ratios, and the dollars at risk, traceable to public customs data and a
          published formula.
        </p>
        <div
          className="panel p-4 text-center text-sm font-medium"
          style={{ borderLeft: "3px solid var(--accent)" }}
        >
          Gemini reasons and routes. A deterministic engine computes. A human approves.
          <span className="mt-1 block text-xs font-normal" style={{ color: "var(--muted)" }}>
            The model never generates a number.
          </span>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">How a briefing happens</h2>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="panel flex gap-4 p-4">
              <span
                className="mono mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--panel-2)", color: "var(--accent)" }}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Four surfaces</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SURFACES.map((surface) => (
            <Link key={surface.href} href={surface.href} className="block">
              <article className="panel h-full p-4 transition-colors hover:border-[color:var(--accent)]">
                <h3 className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                  {surface.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {surface.body}
                </p>
              </article>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">The data, and its limits</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          11.25 million bilateral trade rows from CEPII BACI, 22 curated commodity
          baskets, live vessel transits for 28 chokepoints from IMF PortWatch, and
          country context from the World Bank. Every exposure figure uses latest-year
          trade weights and models first-order effects only — no inventories, no
          substitution, no probabilities. Those limits are stated on every page that
          shows a number, because a reference product that hides its assumptions is
          not one.
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Data: BACI/CEPII (Etalab 2.0) · UN Global Platform; IMF PortWatch · World
          Bank WDI (CC BY 4.0) · Methodology 1.0.0
        </p>
      </section>

      <section
        className="panel flex flex-wrap items-center justify-between gap-4 p-5"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
      >
        <div>
          <h2 className="text-base font-semibold">Hire your own analyst</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Tell it what to watch. It reads every event so you don&apos;t have to.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/simulate"
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            Try the simulator
          </Link>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#04121f" }}
            >
              Build your analyst
            </button>
          </SignUpButton>
        </div>
      </section>
    </div>
  );
}
