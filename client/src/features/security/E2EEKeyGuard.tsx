import { useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { isMsg91Enabled, sendMsg91Otp, verifyMsg91Otp } from "@/lib/msg91";
import { api } from "@/lib/api";
import { useCryptoStore, useE2EEAccount } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Account-level E2EE gatekeeper (Sprint D / D.1 / D.2). Mounted once inside the authenticated shell.
 *
 * When this account has a server key backup but this device has no matching key (a new device, or
 * cleared storage), the account is LOCKED for old history. Instead of blocking the whole app (D.1),
 * we now show a DISMISSIBLE "Restore old chats?" popup (D.2): the user can restore with their recovery
 * passphrase or a single-use backup code (phone-OTP gated), or dismiss it and keep using the app.
 * They can restore later anytime from Profile → Security. New messages still flow while dismissed.
 *
 * New users are NOT nagged to set up multi-device — that's opt-in from Profile → Security (D.1).
 */

/** Minimum recovery passphrase length. Kept modest but non-trivial; Argon2id does the heavy lifting. */
export const RECOVERY_MIN_LENGTH = 8;

/** Session-scoped key so a dismissed popup stays dismissed for this tab but reappears next visit. */
function dismissKey(userId: string | null): string {
  return `linkr.e2ee.restoreDismissed.${userId ?? "anon"}`;
}

export function E2EEKeyGuard() {
  const { locked } = useE2EEAccount();
  const myUserId = useCryptoStore((s) => s.myUserId);
  // Dismissal is per-tab (sessionStorage): we don't nag repeatedly within a session, but a fresh
  // visit reminds the user their old chats are still locked (they can always restore from Profile).
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(dismissKey(myUserId)) === "1";
    } catch {
      return false;
    }
  });

  if (!locked || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(myUserId), "1");
    } catch {
      /* private mode / storage disabled — fall back to in-memory dismissal */
    }
    setDismissed(true);
  };

  return <RestoreModal onDismiss={dismiss} />;
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

/** Friendly message from a thrown error (MSG91 / network), with a fallback. */
function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Dismissible "Restore old chats?" popup shown on a locked device (D.2). Closing keeps the app usable. */
function RestoreModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <ModalShell onBackdrop={onDismiss}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">Restore your old chats?</h2>
          <p className="text-xs text-text-muted">
            This account has encrypted history from another device. Restore it here with your passphrase or a backup
            code — or keep chatting and do it later from Profile → Security.
          </p>
        </div>
        <button
          type="button"
          aria-label="Not now"
          onClick={onDismiss}
          className="ml-auto -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <UnlockPanel onUnlocked={onDismiss} />

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-text-muted transition-colors hover:text-text"
        >
          Not now — keep using Linkr
        </button>
      </div>
    </ModalShell>
  );
}

/**
 * Reusable unlock UI (Sprint D.1/D.2): recovery passphrase OR a phone-OTP-gated backup code, plus the
 * "start fresh" escape hatch. Used by the dismissible restore popup and Profile → Security so users can
 * decrypt their chats at any time. `onUnlocked` fires after the account key is successfully restored.
 */
export function UnlockPanel({ onUnlocked }: { onUnlocked?: () => void }) {
  const recoveryCodesRemaining = useCryptoStore((s) => s.recoveryCodesRemaining);
  const [mode, setMode] = useState<"passphrase" | "code">("passphrase");
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
    onUnlocked?.();
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    await useCryptoStore.getState().resetKeys();
    setBusy(false);
    onUnlocked?.();
  };

  return (
    <div>
      {mode === "passphrase" ? (
        <div className="space-y-3">
          <PassphraseField
            id="e2ee-unlock"
            label="Recovery passphrase"
            value={passphrase}
            onChange={setPassphrase}
            onEnter={unlock}
          />
          {error ? (
            <p className="text-xs text-rose-500" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="gradient" className="w-full" disabled={busy || !passphrase} onClick={unlock}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore my chats"}
          </Button>
        </div>
      ) : (
        <RecoveryCodePanel onDone={onUnlocked} />
      )}

      {recoveryCodesRemaining > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode(mode === "passphrase" ? "code" : "passphrase");
            }}
            className="text-xs font-medium text-primary transition-colors hover:underline"
          >
            {mode === "passphrase"
              ? "Forgot your passphrase? Use a backup code"
              : "Use your recovery passphrase instead"}
          </button>
        </div>
      ) : null}

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
            Lost everything? Start fresh on this device
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Backup-code unlock (Sprint D.1): verify the account's phone (MSG91 SMS, or the dev OTP), then enter
 * a single-use recovery code. The raw code is opened locally; the server only burns its envelope.
 */
function RecoveryCodePanel({ onDone }: { onDone?: () => void }) {
  const phoneHint = useCryptoStore((s) => s.phoneHint);
  const usingMsg91 = isMsg91Enabled();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    if (sending || !phone.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (usingMsg91) {
        await sendMsg91Otp(phone.trim());
      } else {
        const res = await api.post<{ devCode?: string }>("/auth/otp/send", { phone: phone.trim() });
        setDevCode(res.data?.devCode ?? null);
      }
      setOtpSent(true);
    } catch (err) {
      setError(errorText(err, "Couldn't send a code to that number."));
    } finally {
      setSending(false);
    }
  };

  const restore = async () => {
    if (busy || !otp.trim() || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const proof = usingMsg91
        ? { accessToken: await verifyMsg91Otp(otp.trim()) }
        : { phone: phone.trim(), otp: otp.trim() };
      const ok = await useCryptoStore.getState().unlockWithRecoveryCode(code.trim(), proof);
      if (!ok) {
        setError("That didn't work. Double-check your backup code and the OTP, then try again.");
        return;
      }
      setOtp("");
      setCode("");
      onDone?.();
    } catch (err) {
      setError(errorText(err, "Verification failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="recover-phone" className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Phone number{phoneHint ? ` (${phoneHint})` : ""}
        </span>
        <div className="flex gap-2">
          <input
            id="recover-phone"
            type="tel"
            inputMode="tel"
            placeholder="+14155552671"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
          />
          <Button type="button" variant="outline" size="sm" disabled={sending || !phone.trim()} onClick={sendOtp}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? "Resend" : "Send code"}
          </Button>
        </div>
      </label>

      {otpSent ? (
        <>
          {devCode ? (
            <p className="text-[11px] text-text-muted">
              Dev code: <span className="font-mono font-semibold text-text">{devCode}</span>
            </p>
          ) : null}
          <label htmlFor="recover-otp" className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">SMS code</span>
            <input
              id="recover-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label htmlFor="recover-code" className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Backup code</span>
            <input
              id="recover-code"
              type="text"
              autoComplete="off"
              placeholder="ABCD-EFGH-JKMN-PQRS-TVWX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 font-mono text-sm tracking-wide text-text outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </>
      ) : null}

      {error ? (
        <p className="text-xs text-rose-500" role="alert">
          {error}
        </p>
      ) : null}

      {otpSent ? (
        <Button
          type="button"
          variant="gradient"
          className="w-full"
          disabled={busy || !otp.trim() || !code.trim()}
          onClick={restore}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore my chats"}
        </Button>
      ) : null}
    </div>
  );
}

/** Reusable recovery-passphrase form state, shared by the setup modal and the profile card. */
export function useRecoverySetup() {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Recovery codes minted by the last successful setup — shown to the user exactly once. */
  const [codes, setCodes] = useState<string[] | null>(null);

  const tooShort = passphrase.length > 0 && passphrase.length < RECOVERY_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const valid = passphrase.length >= RECOVERY_MIN_LENGTH && confirm === passphrase;

  const submit = async (): Promise<boolean> => {
    if (busy || !valid) return false;
    setBusy(true);
    setError(null);
    const result = await useCryptoStore.getState().setupBackup(passphrase);
    setBusy(false);
    if (!result.ok || !result.codes) {
      setError(result.error ?? "Couldn't save your recovery passphrase. Please try again.");
      return false;
    }
    setPassphrase("");
    setConfirm("");
    setCodes(result.codes);
    return true;
  };

  return {
    passphrase,
    setPassphrase,
    confirm,
    setConfirm,
    busy,
    error,
    tooShort,
    mismatch,
    valid,
    codes,
    clearCodes: () => setCodes(null),
    submit,
  };
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
