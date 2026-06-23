import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared, theme-aware text input used across the onboarding steps. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // Onboarding/login always render on the dark branded gradient, but theme color tokens can
        // resolve to a light palette on some devices (mobile showed a white box with faint grey
        // text). Hardcode a dark-grey field with white text so the typed value is always legible.
        "w-full rounded-2xl border border-white/10 bg-[#1c1d22] px-4 py-2.5 text-sm font-medium text-white caret-white outline-none transition-colors",
        "placeholder:font-normal placeholder:text-neutral-500 focus:border-primary/60 focus:ring-2 focus:ring-ring/40",
        className,
      )}
      {...props}
    />
  ),
);
TextInput.displayName = "TextInput";

/** A labelled form field with an optional hint/error line. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs">{hint}</span>}
    </label>
  );
}

/** Progress dots + step labels shown atop the wizard. */
export function StepHeader({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {steps.map((label, index) => {
        const value = index + 1;
        const active = value === step;
        const done = value < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                active && "bg-gradient-primary text-primary-foreground shadow-glow",
                done && "bg-primary/15 text-primary",
                !active && !done && "bg-surface-2 text-text-muted",
              )}
            >
              {value}
            </span>
            <span className={cn("hidden text-xs sm:inline", active ? "text-text" : "text-text-muted")}>
              {label}
            </span>
            {value < steps.length && <span className="h-px w-5 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
