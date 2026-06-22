import { Check, Moon, Sun } from "lucide-react";
import { THEMES, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Inline theme swatches for dropdown menus. */
export function ThemeSwatches({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Theme color">
      {THEMES.map((t) => {
        const selected = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-label={`${t.label} theme`}
            aria-pressed={selected}
            title={t.label}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-primary-foreground transition-transform duration-200 ease-out hover:scale-110",
              "ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "ring-2 ring-ring scale-105",
            )}
            style={{ backgroundImage: `linear-gradient(135deg, ${t.color} 0%, ${t.color}cc 100%)` }}
          >
            {selected && <Check className="h-3 w-3 drop-shadow" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/** Light/dark mode toggle button. */
export function ThemeModeToggle({ className }: { className?: string }) {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text transition-colors hover:bg-surface-2",
        className,
      )}
    >
      {mode === "dark" ? <Sun className="h-4 w-4 text-text-muted" /> : <Moon className="h-4 w-4 text-text-muted" />}
      {mode === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

/**
 * Compact header theme controls (legacy export — theme picker now lives in UserMenu).
 */
export function ThemeSwitcher() {
  const { mode, toggleMode } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <ThemeSwatches className="hidden sm:flex" />
      <button
        type="button"
        onClick={toggleMode}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-text-muted shadow-soft transition-colors duration-200",
          "hover:border-primary/40 hover:text-text",
        )}
      >
        {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
