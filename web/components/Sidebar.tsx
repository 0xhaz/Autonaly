"use client";

import { Show } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * The app's navigation, out of the header's way: a collapsible icon rail so
 * the atlas gets the whole viewport. Public surfaces are always listed; the
 * signed-in surfaces (analyst, review) appear with the session.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, React.ReactNode> = {
  atlas: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" />
    </svg>
  ),
  simulator: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="8" cy="16" r="2.2" />
    </svg>
  ),
  analyst: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
    </svg>
  ),
  review: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 13l3 0 2 3h6l2-3h3" />
      <path d="M6 5h12l2 8v6H4v-6l2-8z" />
    </svg>
  ),
  about: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  ),
  methodology: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4z" />
      <path d="M19 20a3 3 0 0 0-3-3H5" />
    </svg>
  ),
};

const PUBLIC_ITEMS = [
  { href: "/", label: "Atlas", icon: "atlas" },
  { href: "/simulate", label: "Simulator", icon: "simulator" },
];
const SIGNED_IN_ITEMS = [
  { href: "/dashboard", label: "My analyst", icon: "analyst" },
  { href: "/review", label: "Review queue", icon: "review" },
];
const FOOTER_ITEMS = [
  { href: "/about", label: "About", icon: "about" },
  { href: "/methodology", label: "Methodology", icon: "methodology" },
];

function Item({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className="flex items-center gap-3 rounded-md px-2.5 py-2 text-xs font-medium"
      style={{
        color: active ? "var(--text)" : "var(--muted)",
        background: active ? "var(--panel-2)" : "transparent",
        border: `1px solid ${active ? "var(--line)" : "transparent"}`,
      }}
    >
      <span className="shrink-0" style={{ color: active ? "var(--accent)" : undefined }}>
        {ICONS[icon]}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className="sticky top-0 flex h-screen shrink-0 flex-col gap-1 border-r p-2 transition-[width] duration-200"
      style={{
        width: collapsed ? "3.5rem" : "12rem",
        borderColor: "var(--line)",
        background: "var(--panel)",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="mb-2 flex items-center gap-3 rounded-md px-2.5 py-2"
        style={{ color: "var(--muted)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} className="shrink-0">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {!collapsed && <span className="text-xs font-medium">Collapse</span>}
      </button>

      {PUBLIC_ITEMS.map((item) => (
        <Item key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
      ))}
      <Show when="signed-in">
        {SIGNED_IN_ITEMS.map((item) => (
          <Item key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </Show>

      <div className="mt-auto flex flex-col gap-1">
        {FOOTER_ITEMS.map((item) => (
          <Item key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>
    </aside>
  );
}
