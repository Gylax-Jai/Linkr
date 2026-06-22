/** The six selectable themes (blueprint §6). `color` is the swatch shown in the picker. */
export const THEMES = [
  { id: "iris", label: "Iris", color: "#7C5CFC" },
  { id: "emerald", label: "Emerald", color: "#10B981" },
  { id: "ocean", label: "Ocean", color: "#0EA5E9" },
  { id: "sunset", label: "Sunset", color: "#F97316" },
  { id: "rose", label: "Rose", color: "#F43F5E" },
  { id: "midnight", label: "Midnight", color: "#6366F1" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type ThemeMode = "light" | "dark";

export const DEFAULT_THEME: ThemeId = "iris";

export const STORAGE_KEYS = {
  theme: "linkr:theme",
  mode: "linkr:mode",
} as const;

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}
