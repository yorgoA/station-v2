"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "station_v2_theme";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

/** Manual light/dark override, layered on top of the OS-driven default (see globals.css). */
export function ThemeToggle({ fixed = false }: { fixed?: boolean }) {
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial: ThemeMode = saved === "light" || saved === "dark" ? saved : systemPrefersDark() ? "dark" : "light";
    setMode(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    setMode((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }

  if (mode === null) {
    // Avoid rendering the wrong icon for a frame before we've read localStorage.
    return <div className={fixed ? "theme-toggle-row theme-toggle-fixed" : "theme-toggle-row"} style={{ height: 33 }} />;
  }

  return (
    <div className={fixed ? "theme-toggle-row theme-toggle-fixed" : "theme-toggle-row"}>
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={toggle}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {mode === "dark" ? <SunIcon /> : <MoonIcon />}
        <span className="nav-label">{mode === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
    </div>
  );
}
