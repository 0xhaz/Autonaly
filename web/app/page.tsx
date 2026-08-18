import GlobalDashboard from "@/components/GlobalDashboard";
import type { MapEvent } from "@/components/GlobalMap";
import { listBriefings } from "@/lib/firestore";

export const dynamic = "force-dynamic";

const ENGINE = process.env.AUTONALY_ENGINE_URL ?? "http://localhost:8080";

interface ChokepointRow {
  key: string;
  label: string;
  lat: number;
  lon: number;
}

/** Chokepoint coordinates, so an event can be drawn where it happens. */
async function chokepointCoords(): Promise<Record<string, ChokepointRow>> {
  try {
    const response = await fetch(`${ENGINE}/chokepoints`, { cache: "no-store" });
    if (!response.ok) return {};
    const data = (await response.json()) as { chokepoints: ChokepointRow[] };
    return Object.fromEntries(data.chokepoints.map((c) => [c.key, c]));
  } catch {
    // The map degrades to country shading without markers rather than failing.
    return {};
  }
}

export default async function HomePage() {
  const [briefings, coords] = await Promise.all([listBriefings(), chokepointCoords()]);

  // Match a briefing to a chokepoint by looking for its key in the event key or
  // title — the agent names events itself, so there is no stored foreign key.
  const events: MapEvent[] = briefings.map((b) => {
    const haystack = `${b.event_key} ${b.title}`.toLowerCase();
    const match = Object.values(coords).find(
      (c) => haystack.includes(c.key) || haystack.includes(c.label.toLowerCase()),
    );
    return {
      id: b.id,
      title: b.title,
      status: b.status,
      scoring: b.scoring,
      lat: match?.lat ?? 0,
      lon: match?.lon ?? 0,
      unscored: b.scoring === "curated",
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Global exposure</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Click any country to inspect · toggle layers to add the maritime network
        </p>
      </div>
      <GlobalDashboard briefings={briefings} events={events} />
    </div>
  );
}
