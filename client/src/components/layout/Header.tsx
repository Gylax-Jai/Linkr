import { PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/features/notifications";
import { ThemePanel } from "@/features/settings/ThemePanel";
import { useUIStore } from "@/lib/store";
import { UserMenu } from "./UserMenu";

/** Top app bar: brand left; notifications, panel toggle, user menu right. */
export function Header() {
  const toggleDetails = useUIStore((s) => s.toggleDetails);

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 shadow-soft backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary font-mono text-xl font-bold text-primary-foreground shadow-glow">
          L
        </span>
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-tight">
            Link<span className="text-gradient-primary">r</span>
          </p>
          <p className="hidden text-xs text-text-muted sm:block">Connect privately. Talk freely.</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <NotificationCenter />
        <ThemePanel />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDetails}
          aria-label="Toggle details pane"
          className="hidden lg:inline-flex"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
