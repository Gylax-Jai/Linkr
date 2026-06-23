import { useState } from "react";
import { Check, Copy, Download, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useE2EEAccount } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { RecoverySetupFields, useRecoverySetup } from "./E2EEKeyGuard";

/**
 * Profile → Security card (Sprint D / D.1). The canonical, opt-in place to turn on multi-device:
 * set a recovery passphrase (which also mints single-use backup codes) or change it later. The
 * passphrase + codes encrypt the account keypair client-side before backup; the server never sees
 * them. New users are not nagged elsewhere — this card is where they choose to enable it.
 */
export function RecoveryCard() {
  const { status, needsBackup, recoveryCodesRemaining, phoneHint } = useE2EEAccount();
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

  if (status === "locked") {
    return (
      <Card icon={<ShieldQuestion className="h-5 w-5" />} tone="muted" title="Locked on this device">
        <p className="text-xs text-text-muted">
          Enter your recovery passphrase — or use a backup code — in the unlock prompt to read your chats on this
          device.
        </p>
      </Card>
    );
  }

  // Just finished a setup/change: show the freshly minted codes exactly once.
  if (setup.codes) {
    return (
      <Card icon={<ShieldCheck className="h-5 w-5" />} tone="on" title="Save your backup codes">
        <RecoveryCodesView
          codes={setup.codes}
          phoneHint={phoneHint}
          onDone={() => {
            setup.clearCodes();
            setChanging(false);
            setSavedAt(true);
          }}
        />
      </Card>
    );
  }

  const onSubmit = async () => {
    await setup.submit();
  };

  // Backup already set and not currently changing it.
  if (!needsBackup && !changing) {
    return (
      <Card icon={<ShieldCheck className="h-5 w-5" />} tone="on" title="Multi-device is on">
        <p className="text-xs text-text-muted">
          Your encryption key is backed up, so you can read your chats after logging in on a new device — with your
          recovery passphrase, or a backup code if you forget it.
        </p>
        <p className="text-xs text-text-muted">
          Backup codes left: <span className="font-semibold text-text">{recoveryCodesRemaining}</span>
        </p>
        {savedAt ? <p className="text-xs text-online">Recovery updated.</p> : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setChanging(true)}>
          Change passphrase & regenerate codes
        </Button>
      </Card>
    );
  }

  // Either no backup yet (needsBackup) or the user chose to change it.
  return (
    <Card
      icon={<ShieldCheck className="h-5 w-5" />}
      tone={needsBackup ? "warn" : "on"}
      title={needsBackup ? "Use Linkr on another device" : "Change recovery passphrase"}
    >
      <p className="text-xs text-text-muted">
        Set a recovery passphrase to securely back up your encryption key. You'll also get one-time backup codes to
        restore your chats if you ever forget the passphrase. We can't reset either for you.
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
          {setup.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : needsBackup ? "Enable" : "Save & regenerate"}
        </Button>
      </div>
    </Card>
  );
}

/** One-time display of the generated backup codes with copy/download + a "saved them" confirmation. */
function RecoveryCodesView({
  codes,
  phoneHint,
  onDone,
}: {
  codes: string[];
  phoneHint: string | null;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const asText = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the codes are still visible to copy manually */
    }
  };

  const download = () => {
    const header = `Linkr backup codes${phoneHint ? ` for ${phoneHint}` : ""}\nEach code works once. Keep them somewhere safe.\n\n`;
    const blob = new Blob([header + asText + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkr-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Save these {codes.length} codes somewhere safe{phoneHint ? <> for <span className="font-medium text-text">{phoneHint}</span></> : null}. Each works
        once on a new device. <span className="font-medium text-text">We can't show them again.</span>
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface-2 p-3">
        {codes.map((c) => (
          <li key={c} className="font-mono text-xs tracking-wide text-text">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={download}>
          <Download className="h-4 w-4" />
          <span className="ml-1.5">Download</span>
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        I've saved my backup codes
      </label>
      <Button type="button" variant="gradient" size="sm" className="w-full" disabled={!acknowledged} onClick={onDone}>
        Done
      </Button>
    </div>
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
