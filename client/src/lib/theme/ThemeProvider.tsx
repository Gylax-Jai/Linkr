import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type ThemeContextValue } from "./theme-context";
import { DEFAULT_THEME, STORAGE_KEYS, THEMES, isThemeId, type ThemeId, type ThemeMode } from "./themes";

function readStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEYS.mode);
  if (stored === "light" || stored === "dark") return stored;
  // Fall back to the OS preference on first visit.
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies the active theme + mode to <html> and persists the choice to localStorage.
 * Switching theme/mode swaps the CSS variable set only (blueprint §6) — no component changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", mode === "dark");
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    localStorage.setItem(STORAGE_KEYS.mode, mode);
  }, [theme, mode]);

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), []);
  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );
  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const index = THEMES.findIndex((t) => t.id === prev);
      return THEMES[(index + 1) % THEMES.length]!.id;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setTheme, setMode, toggleMode, cycleTheme }),
    [theme, mode, setTheme, setMode, toggleMode, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
