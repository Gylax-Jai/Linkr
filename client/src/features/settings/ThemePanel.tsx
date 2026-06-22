import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { THEMES, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Dedicated theme button + popover for the header. One click opens a panel where the user can
 * pick any of the 6 accent themes and toggle light/dark — no digging through the profile menu.
 */
export function ThemePanel() {
  const { theme, setTheme, mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Change theme"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
          open && "bg-surface-2 text-text",
        )}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Theme settings"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-3 shadow-elevated"
        >
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Accent</p>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const selected = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors",
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-surface-2",
                  )}
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-white shadow-soft"
                    style={{ backgroundImage: `linear-gradient(135deg, ${t.color} 0%, ${t.color}cc 100%)` }}
                  >
                    {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                  </span>
                  <span className="text-[11px] font-medium text-text">{t.label}</span>
                </button>
              );
            })}
          </div>

          <p className="px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Appearance</p>
          <div className="flex gap-2">
            <ModeButton active={mode === "light"} onClick={() => setMode("light")} icon={<Sun className="h-4 w-4" />}>
              Light
            </ModeButton>
            <ModeButton active={mode === "dark"} onClick={() => setMode("dark")} icon={<Moon className="h-4 w-4" />}>
              Dark
            </ModeButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-text" : "border-border text-text-muted hover:bg-surface-2",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
