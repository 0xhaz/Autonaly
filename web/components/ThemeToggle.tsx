"use client";

import { useTheme } from "@/components/Providers";

/**
 * Both icons are always in the DOM; CSS keyed on html[data-theme] shows one.
 * That keeps server and client markup identical regardless of stored theme.
 */
export default function ThemeToggle() {
  const { toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-md"
      style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
    >
      <svg className="theme-icon-dark" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
      </svg>
      <svg className="theme-icon-light" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
      </svg>
    </button>
  );
}
