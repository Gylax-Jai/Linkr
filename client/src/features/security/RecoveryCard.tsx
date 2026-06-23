import { useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useE2EEAccount } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { RecoverySetupFields, useRecoverySetup } from "./E2EEKeyGuard";

/**
 * Profile → Security card (Sprint D). Canonical place to turn on multi-device (set a recovery
 * passphrase) or change it later, even after dismissing the one-time prompt. The passphrase encrypts
 * the account keypair client-side before it's backed up; the server never sees it.
 */
export function RecoveryCard() {
  const { status, needsBackup, locked } = useE2EEAccount();
  const setup = useRecoverySetup();
  const [changing, setChanging] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  if (status === "unsupported") {
    return (
      <Card icon={<ShieldAlert className="h-5 w-5" />} tone="muted" title="Encryption unavailable">
        <p className="text-xs text-text-muted">
          This browser can't run end-to-end encryption, so multi-device backup isn't available here.
        </p>
      </Card>
    );
  }

  if (locked) {
    return (
      <Card icon={<ShieldQuestion className="h-5 w-5" />} tone="muted" title="Locked on this device">
        <p className="text-xs text-text-muted">
          Enter your recovery passphrase in the unlock prompt to read your chats on this device.
        </p>
      </Card>
    );
  }

  const onSubmit = async () => {
    const ok = await setup.submit();
    if (ok) {
      setChanging(false);
      setSavedAt(true);
    }
  };

  // Backup already set and not currently changing it.
  if (!needsBackup && !changing) {
    return (
      <Card icon={<ShieldCheck className="h-5 w-5" />} tone="on" title="Multi-device is on">
        <p className="text-xs text-text-muted">
          Your encryption key is backed up with a recovery passphrase, so you can read your chats after logging in on a
          new device.
        </p>
        {savedAt ? <p className="text-xs text-online">Recovery passphrase updated.</p> : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setChanging(true)}>
          Change passphrase
        </Button>
      </Card>
    );
  }

  // Either no backup yet (needsBackup) or the user chose to change it.
  return (
    <Card
      icon={<ShieldCheck className="h-5 w-5" />}
      tone={needsBackup ? "warn" : "on"}
      title={needsBackup ? "Turn on multi-device" : "Change recovery passphrase"}
    >
      <p className="text-xs text-text-muted">
        Set a recovery passphrase to securely back up your encryption key. You'll use it to unlock your message history
        when you log in on another device.
      </p>
      <RecoverySetupFields {...setup} />
      <div className="flex gap-2">
        {changing ? (
          <Button type="button" variant="ghost" size="sm" className="flex-1" disabled={setup.busy} onClick={() => setChanging(false)}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          variant="gradient"
          size="sm"
          className="flex-1"
          disabled={setup.busy || !setup.valid}
          onClick={onSubmit}
        >
          {setup.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : needsBackup ? "Enable" : "Save passphrase"}
        </Button>
      </div>
    </Card>
  );
}

function Card({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "on" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "on"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-primary/10 text-primary"
        : "bg-surface-2 text-text-muted";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-full ${toneClass}`}>{icon}</span>
        <h2 className="text-sm font-semibold text-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}
