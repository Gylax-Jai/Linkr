import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecoveryCard } from "@/features/security";
import { PATHS } from "@/routes/paths";
import { SessionsCard } from "./SessionsCard";

/**
 * Settings hub (Sprint E). The canonical home for account security: multi-device encryption setup /
 * restore (Security) and the signed-in devices list (Devices). Editing the profile itself stays on
 * its own page, linked from here.
 */
export function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 shadow-soft backdrop-blur-sm">
        <Link to={PATHS.home}>
          <Button variant="ghost" size="icon" aria-label="Back to chats">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-8 p-6">
        <Link
          to={PATHS.profile}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-surface-2"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text-muted">
            <UserCog className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Edit profile</p>
            <p className="truncate text-xs text-text-muted">Photo, name, bio, and status</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
        </Link>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <ShieldCheck className="h-4 w-4" />
            Security
          </h2>
          <RecoveryCard />
        </section>

        <SessionsCard />
      </div>
    </div>
  );
}
