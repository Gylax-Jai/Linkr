import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useCryptoStore, useE2EEAccount } from "@/lib/crypto";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Account-level E2EE gatekeeper (Sprint D). Mounted once inside the authenticated shell. It surfaces
 * two flows on top of the app:
 *  - LOCKED (blocking): this account has an encrypted key backup but this device has no matching key
 *    (a new device, or cleared storage). The user must enter their recovery passphrase to restore
 *    the account keypair — or deliberately start fresh with a new key (losing old history). Blocking
 *    avoids silently downgrading new messages to in-transit-only while we have no usable key.
 *  - NEEDS BACKUP (dismissible): the device is ready but the account has no backup yet. We invite the
 *    user to set a recovery passphrase so they can read their chats on other devices. Dismissals are
 *    remembered per-user so we don't nag; they can always enable it later from Profile → Security.
 */

/** Minimum recovery passphrase length. Kept modest but non-trivial; Argon2id does the heavy lifting. */
export const RECOVERY_MIN_LENGTH = 8;

function dismissKey(userId: string): string {
  return `linkr.e2ee.backupPrompt.dismissed.${userId}`;
}

export function E2EEKeyGuard() {
  const { status, needsBackup, locked } = useE2EEAccount();
  const userId = useAuthStore((s) => s.user?._id);
  const [dismissed, setDismissed] = useState(true);

  // Load the per-user "don't ask again" flag whenever the account changes.
  useEffect(() => {
    if (!userId) {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(localStorage.getItem(dismissKey(userId)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  if (locked) return <UnlockModal />;
  if (status === "ready" && needsBackup && !dismissed && userId) {
    return (
      <SetupModal
        onClose={(remember) => {
          if (remember && userId) {
            try {
              localStorage.setItem(dismissKey(userId), "1");
            } catch {
              /* storage unavailable — just close for this session */
            }
          }
          setDismissed(true);
        }}
      />
    );
  }
  return null;
}

/** Shared overlay shell matching the app's modal styling (see FriendSearchModal). */
function ModalShell({
  children,
  onBackdrop,
}: {
  children: React.ReactNode;
  onBackdrop?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={onBackdrop ? 0 : -1}
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
        onClick={onBackdrop}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-border bg-surface p-6 shadow-elevated animate-fade-in-up sm:rounded-3xl">
        {children}
      </div>
    </div>
  );
}

function PassphraseField({
  id,
  label,
  value,
  onChange,
  autoFocus,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <input
        id={id}
        type="password"
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
      />
    </label>
  );
}

/** Blocking modal shown on a new device while the account is locked. */
function UnlockModal() {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const unlock = async () => {
    if (busy || !passphrase) return;
    setBusy(true);
    setError(null);
    const ok = await useCryptoStore.getState().unlockWithPassphrase(passphrase);
    setBusy(false);
    if (!ok) {
      setError("That passphrase didn't work. Please try again.");
      return;
    }
    setPassphrase("");
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    await useCryptoStore.getState().resetKeys();
    setBusy(false);
  };

  return (
    <ModalShell>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text">Unlock your messages</h2>
          <p className="text-xs text-text-muted">Enter your recovery passphrase to read your chats on this device.</p>
        </div>
      </div>

      <div className="space-y-3">
        <PassphraseField
          id="e2ee-unlock"
          label="Recovery passphrase"
          value={passphrase}
          onChange={setPassphrase}
          autoFocus
          onEnter={unlock}
        />
        {error ? (
          <p className="text-xs text-rose-500" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" variant="gradient" className="w-full" disabled={busy || !passphrase} onClick={unlock}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
        </Button>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {confirmingReset ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Starting fresh creates a new key on this device. You'll be able to send and receive new messages, but
              <span className="font-medium text-text"> older encrypted messages will stay unreadable</span>. This
              can't be undone.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" className="flex-1" disabled={busy} onClick={reset}>
                Start fresh
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="text-xs font-medium text-text-muted transition-colors hover:text-text"
          >
            Forgot your passphrase? Start fresh on this device
          </button>
        )}
      </div>
    </ModalShell>
  );
}

/** Dismissible modal inviting the user to enable multi-device by setting a recovery passphrase. */
function SetupModal({ onClose }: { onClose: (remember: boolean) => void }) {
  const result = useRecoverySetup();

  return (
    <ModalShell onBackdrop={() => onClose(false)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text">Read your chats on any device</h2>
          <p className="text-xs text-text-muted">
            Set a recovery passphrase to securely back up your encryption key. You'll use it to unlock your history when
            you log in somewhere new.
          </p>
        </div>
      </div>

      <RecoverySetupFields {...result} />

      <div className="mt-5 flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={() => onClose(true)} disabled={result.busy}>
          Maybe later
        </Button>
        <Button
          type="button"
          variant="gradient"
          className="flex-1"
          disabled={result.busy || !result.valid}
          onClick={async () => {
            const ok = await result.submit();
            if (ok) onClose(false);
          }}
        >
          {result.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
        </Button>
      </div>
    </ModalShell>
  );
}

/** Reusable recovery-passphrase form state, shared by the setup modal and the profile card. */
export function useRecoverySetup() {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = passphrase.length > 0 && passphrase.length < RECOVERY_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const valid = passphrase.length >= RECOVERY_MIN_LENGTH && confirm === passphrase;

  const submit = async (): Promise<boolean> => {
    if (busy || !valid) return false;
    setBusy(true);
    setError(null);
    const ok = await useCryptoStore.getState().setupBackup(passphrase);
    setBusy(false);
    if (!ok) {
      setError("Couldn't save your recovery passphrase. Please try again.");
      return false;
    }
    setPassphrase("");
    setConfirm("");
    return true;
  };

  return { passphrase, setPassphrase, confirm, setConfirm, busy, error, tooShort, mismatch, valid, submit };
}

/** Render the two passphrase fields + validation hints for `useRecoverySetup`. */
export function RecoverySetupFields({
  passphrase,
  setPassphrase,
  confirm,
  setConfirm,
  error,
  tooShort,
  mismatch,
}: ReturnType<typeof useRecoverySetup>) {
  return (
    <div className="space-y-3">
      <PassphraseField id="e2ee-pass" label="Recovery passphrase" value={passphrase} onChange={setPassphrase} />
      <PassphraseField id="e2ee-confirm" label="Confirm passphrase" value={confirm} onChange={setConfirm} />
      <p className={cn("text-[11px]", tooShort ? "text-rose-500" : "text-text-muted")}>
        At least {RECOVERY_MIN_LENGTH} characters. We can't reset this for you — if you forget it, you lose access to
        old messages on new devices.
      </p>
      {mismatch ? (
        <p className="text-xs text-rose-500" role="alert">
          Passphrases don't match.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
