import { Link } from "react-router-dom";
import { Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecoveryCard } from "@/features/security";
import { PATHS } from "@/routes/paths";
import { PrivacyCard } from "./PrivacyCard";
import { SessionsCard } from "./SessionsCard";
import { DangerZoneCard } from "./DangerZoneCard";

/**
 * Settings hub (Sprint E/G). The canonical home for account security only: multi-device encryption
 * setup / restore (Security) and the signed-in devices list (Devices). Editing the profile lives on
 * its own page (reached from the user menu); the two are intentionally kept separate (Sprint G).
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
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <Lock className="h-4 w-4" />
            Privacy
          </h2>
          <PrivacyCard />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <ShieldCheck className="h-4 w-4" />
            Security
          </h2>
          <RecoveryCard />
        </section>

        <SessionsCard />

        <DangerZoneCard />
      </div>
    </div>
  );
}
