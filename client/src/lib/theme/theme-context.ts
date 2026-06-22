import { createContext } from "react";
import type { ThemeId, ThemeMode } from "./themes";

export interface ThemeContextValue {
  theme: ThemeId;
  mode: ThemeMode;
  setTheme: (theme: ThemeId) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  /** Advance to the next theme in the list (used by the header switcher). */
  cycleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
