import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { isMsg91Enabled, sendMsg91Otp, verifyMsg91Otp } from "@/lib/msg91";
import { api } from "@/lib/api";
import { useCryptoStore, useE2EEAccount } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Account-level E2EE gatekeeper (Sprint D / D.1). Mounted once inside the authenticated shell.
 *
 * It only blocks when this account has a server key backup but this device has no matching key (a new
 * device, or cleared storage) — the LOCKED state. The user restores by entering their recovery
 * passphrase, redeeming a single-use backup code (phone-OTP gated), or deliberately starting fresh
 * with a new key (losing old history). Blocking avoids silently downgrading new messages to
 * in-transit-only while we have no usable key.
 *
 * New users are NOT nagged to set up multi-device — that's opt-in from Profile → Security (D.1).
 */

/** Minimum recovery passphrase length. Kept modest but non-trivial; Argon2id does the heavy lifting. */
export const RECOVERY_MIN_LENGTH = 8;

export function E2EEKeyGuard() {
  const { locked } = useE2EEAccount();
  if (locked) return <UnlockModal />;
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

/** Friendly message from a thrown error (MSG91 / network), with a fallback. */
function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Blocking modal shown on a new device while the account is locked. */
function UnlockModal() {
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
          <p className="text-xs text-text-muted">
            {mode === "passphrase"
              ? "Enter your recovery passphrase to read your chats on this device."
              : "Verify your phone and enter a backup code to restore your chats."}
          </p>
        </div>
      </div>

      {mode === "passphrase" ? (
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
      ) : (
        <RecoveryCodePanel />
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
    </ModalShell>
  );
}

/**
 * Backup-code unlock (Sprint D.1): verify the account's phone (MSG91 SMS, or the dev OTP), then enter
 * a single-use recovery code. The raw code is opened locally; the server only burns its envelope.
 */
function RecoveryCodePanel() {
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
      setError("Couldn't save your recovery passphrase. Please try again.");
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
