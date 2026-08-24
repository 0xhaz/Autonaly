"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme state + Clerk, together because Clerk's appearance must follow the
 * theme. The <html data-theme> attribute is set pre-paint by an inline script
 * in the layout head; this provider adopts that value and owns changes.
 */

type Theme = "dark" | "light";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const CLERK_APPEARANCE: Record<Theme, object> = {
  dark: {
    variables: {
      colorPrimary: "#3987e5",
      colorBackground: "#121821",
      colorForeground: "#e6edf6",
      colorMutedForeground: "#8b9bb4",
      colorInput: "#172030",
      colorInputForeground: "#e6edf6",
      colorNeutral: "#e6edf6",
      borderRadius: "8px",
    },
    elements: {
      socialButtonsBlockButton: {
        background: "#172030",
        border: "1px solid #223047",
        color: "#e6edf6",
      },
      socialButtonsBlockButtonText: { color: "#e6edf6" },
    },
  },
  light: {
    variables: {
      colorPrimary: "#2277cc",
      colorBackground: "#ffffff",
      colorForeground: "#16212e",
      colorMutedForeground: "#61718a",
      colorInput: "#eef2f7",
      colorInputForeground: "#16212e",
      colorNeutral: "#16212e",
      borderRadius: "8px",
    },
  },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  // The server already rendered <html data-theme>, so the initial state just
  // adopts it — identical on both sides of hydration.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark",
  );

  // All side effects live here, outside render and outside the updater: sync
  // the attribute, persist the cookie the server reads on the next request,
  // and tell the maps (which cannot read CSS variables) to rebuild — but only
  // when the DOM actually changes.
  useEffect(() => {
    const el = document.documentElement;
    const current: Theme = el.getAttribute("data-theme") === "light" ? "light" : "dark";
    el.setAttribute("data-theme", theme);
    // A year, path-wide, lax: this is a display preference, not a credential.
    document.cookie = `autonaly-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    if (current !== theme) window.dispatchEvent(new Event("autonaly-theme"));
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <ClerkProvider appearance={CLERK_APPEARANCE[theme]}>{children}</ClerkProvider>
    </ThemeContext.Provider>
  );
}
