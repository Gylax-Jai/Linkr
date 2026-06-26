import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Check,
  Loader2,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  OTP_CODE_LENGTH,
  USERNAME_MAX,
  USERNAME_MIN,
  phoneSchema,
  usernameSchema,
} from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth";
import { useAuthStore } from "@/lib/store";
import { PATHS } from "@/routes/paths";
import { MSG91_CAPTCHA_CONTAINER_ID } from "@/lib/msg91";
import { useUpdateAvatarMutation } from "@/features/profile/useProfile";
import { Field, StepHeader, TextInput } from "./components";
import {
  useCompleteOnboardingMutation,
  usePhoneVerification,
  useUsernameAvailability,
} from "./useOnboarding";

const STEPS = ["Username", "Phone", "Profile"];

/** Multi-step onboarding: pick a @username, verify a phone via OTP, then finish the profile. */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("+91");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState("");
  const [statusText, setStatusText] = useState("");

  const complete = useCompleteOnboardingMutation();
  const logout = useLogoutMutation();

  // `avatarOverride` carries the freshly-uploaded photo URL (if the user picked one in step 3) so we
  // persist it instead of the default Google avatar.
  function finish(avatarOverride?: string) {
    complete.mutate(
      {
        username,
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        status: statusText.trim() || undefined,
        avatar: avatarOverride ?? user?.avatar,
      },
      { onSuccess: () => navigate(PATHS.home, { replace: true }) },
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto overflow-x-hidden bg-bg px-4 py-12 text-text">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-primary opacity-20 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="rounded-3xl border border-border bg-surface/80 p-8 shadow-elevated backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Set up your profile</h1>
            <p className="mt-1 text-sm text-text-muted">A few quick steps to get you on Linkr.</p>
          </div>

          <StepHeader step={step} steps={STEPS} />

          {step === 1 && (
            <UsernameStep
              username={username}
              onChange={setUsername}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <PhoneStep
              phone={phone}
              verified={phoneVerified}
              onPhoneChange={(value) => {
                setPhone(value);
                setPhoneVerified(false);
              }}
              onVerified={() => setPhoneVerified(true)}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <ProfileStep
              displayName={displayName}
              bio={bio}
              statusText={statusText}
              avatarName={displayName || user?.displayName || "L"}
              onDisplayName={setDisplayName}
              onBio={setBio}
              onStatus={setStatusText}
              onBack={() => setStep(2)}
              onFinish={finish}
              submitting={complete.isPending}
              error={complete.isError ? "Couldn't finish setup. That username may be taken — try another." : null}
            />
          )}
        </div>

        {/* Step 1 has no Back button, so offer an escape hatch here: wrong Google account, or someone
            else's session left signed in. Available on every step for convenience. */}
        <div className="mt-4 text-center text-xs text-text-muted">
          <span className="truncate">Signed in as {user?.email ?? "your account"}</span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="ml-1 font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Step 1: Username ------------------------------- */

function UsernameStep({
  username,
  onChange,
  onNext,
}: {
  username: string;
  onChange: (value: string) => void;
  onNext: () => void;
}) {
  const [debounced, setDebounced] = useState(username);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(username), 350);
    return () => clearTimeout(id);
  }, [username]);

  const formatValid = useMemo(() => usernameSchema.safeParse(username).success, [username]);
  const query = useUsernameAvailability(debounced);
  const checking = formatValid && debounced === username && query.isFetching;
  const available = formatValid && query.data?.available === true && debounced === username;
  const taken = formatValid && query.data?.available === false && debounced === username;

  return (
    <div className="space-y-5">
      <Field
        label="Username"
        hint={
          username.length === 0 ? (
            <span className="text-text-muted">{USERNAME_MIN}–{USERNAME_MAX} characters · letters, numbers and _</span>
          ) : !formatValid ? (
            <span className="text-text-muted">{USERNAME_MIN}–{USERNAME_MAX} characters · letters, numbers and _ only</span>
          ) : checking ? (
            <span className="inline-flex items-center gap-1 text-text-muted"><Loader2 className="h-3 w-3 animate-spin" /> Checking availability…</span>
          ) : available ? (
            <span className="inline-flex items-center gap-1 text-primary"><Check className="h-3 w-3" /> @{username} is available</span>
          ) : taken ? (
            <span className="inline-flex items-center gap-1 text-[color:var(--color-primary)]"><X className="h-3 w-3" /> @{username} is taken</span>
          ) : null
        }
      >
        <div className="relative">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <TextInput
            value={username}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="yourname"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="pl-9 font-mono"
          />
        </div>
      </Field>

      <Button variant="gradient" className="w-full" disabled={!available} onClick={onNext}>
        Continue <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------- Step 2: Phone --------------------------------- */

function PhoneStep({
  phone,
  verified,
  onPhoneChange,
  onVerified,
  onBack,
  onNext,
}: {
  phone: string;
  verified: boolean;
  onPhoneChange: (value: string) => void;
  onVerified: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [code, setCode] = useState("");
  const otp = usePhoneVerification();

  const phoneValid = phoneSchema.safeParse(phone).success;
  const sent = otp.sent;
  const devCode = otp.devCode;

  function handleSend() {
    setCode("");
    otp.resetVerify();
    otp.send(phone);
  }

  function handleVerify() {
    otp.verify({ phone, code }, { onSuccess: onVerified });
  }

  return (
    <div className="space-y-5">
      <Field
        label="Phone number"
        hint={<span className="text-text-muted">India code is filled in. Enter your mobile number after +91.</span>}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <TextInput
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value.trim())}
              placeholder="+919876543210"
              inputMode="tel"
              disabled={verified}
              className="pl-9 font-mono"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleSend}
            disabled={!phoneValid || otp.sending || verified}
          >
            {otp.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? "Resend" : "Send code"}
          </Button>
        </div>
      </Field>

      {otp.sendError && (
        <p className="text-xs text-[color:var(--color-primary)]">
          {otp.sendErrorMessage
            ? `Couldn't send a code: ${otp.sendErrorMessage}`
            : "Couldn't send a code. The number may already be in use, or you're sending too fast."}
        </p>
      )}

      {/* MSG91 renders its captcha here when the widget requires it (see lib/msg91). */}
      {otp.usingMsg91 && <div id={MSG91_CAPTCHA_CONTAINER_ID} className="flex justify-center empty:hidden" />}

      {sent && !verified && (
        <Field
          label="Verification code"
          hint={
            devCode ? (
              <span className="text-text-muted">
                Dev mode — your code is <span className="font-mono text-text">{devCode}</span>
              </span>
            ) : otp.verifyError ? (
              <span className="text-[color:var(--color-primary)]">
                {otp.verifyErrorMessage ?? "Incorrect or expired code."}
              </span>
            ) : (
              <span className="text-text-muted">Enter the {OTP_CODE_LENGTH}-digit code we sent.</span>
            )
          }
        >
          <div className="flex gap-2">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH))}
              placeholder="000000"
              inputMode="numeric"
              className="font-mono tracking-[0.4em]"
            />
            <Button
              variant="gradient"
              onClick={handleVerify}
              disabled={code.length !== OTP_CODE_LENGTH || otp.verifying}
            >
              {otp.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
        </Field>
      )}

      {verified && (
        <p className="inline-flex items-center gap-1.5 text-sm text-primary">
          <ShieldCheck className="h-4 w-4" /> Phone verified
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="gradient" className="flex-1" disabled={!verified} onClick={onNext}>
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- Step 3: Profile -------------------------------- */

/** Turn an avatar upload failure into a specific message (prefer the server's `{ error }`). */
function avatarErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (!err.response) return "Network error — check your connection and try again.";
  }
  return "Couldn't upload your photo. Please try again.";
}

function ProfileStep({
  displayName,
  bio,
  statusText,
  avatarName,
  onDisplayName,
  onBio,
  onStatus,
  onBack,
  onFinish,
  submitting,
  error,
}: {
  displayName: string;
  bio: string;
  statusText: string;
  avatarName: string;
  onDisplayName: (value: string) => void;
  onBio: (value: string) => void;
  onStatus: (value: string) => void;
  onBack: () => void;
  onFinish: (avatarUrl?: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useUpdateAvatarMutation();

  // Stage-then-upload: a picked photo is held locally with a preview object URL and only uploaded
  // when the user clicks "Finish", at which point its URL is threaded into the onboarding payload.
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const uploading = updateAvatar.isPending;
  const busy = submitting || uploading;
  const canFinish = displayName.trim().length > 0 && !busy;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;

    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image (PNG, JPG, GIF, or WEBP).");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(`Image is too large (max ${Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }

    setStagedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearStagedAvatar = () => {
    setStagedFile(null);
    setPreviewUrl(null); // the cleanup effect revokes the old object URL
  };

  const handleFinish = async () => {
    setAvatarError(null);
    if (stagedFile) {
      try {
        const updated = await updateAvatar.mutateAsync(stagedFile);
        onFinish(updated.avatar);
        return;
      } catch (uploadError) {
        setAvatarError(avatarErrorMessage(uploadError));
        return; // don't complete onboarding if the photo upload failed
      }
    }
    onFinish();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <Avatar name={avatarName} src={previewUrl ?? user?.avatar} size="xl" ring />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={busy}
            aria-label="Add profile photo"
            title="Add profile photo"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-elevated transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={handleAvatarChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={busy}
            className="text-sm font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-60"
          >
            {stagedFile ? "Change photo" : "Add a photo"}
          </button>
          {stagedFile ? (
            <button
              type="button"
              onClick={clearStagedAvatar}
              disabled={busy}
              aria-label="Discard selected photo"
              title="Discard selected photo"
              className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Discard
            </button>
          ) : null}
        </div>
        <span className="text-xs text-text-muted">
          {stagedFile ? "New photo selected" : "Defaults to your Google photo"}
        </span>
        {avatarError ? (
          <p className="text-xs text-rose-500" role="alert">
            {avatarError}
          </p>
        ) : null}
      </div>

      <Field label="Display name">
        <TextInput value={displayName} onChange={(e) => onDisplayName(e.target.value)} placeholder="Your name" />
      </Field>

      <Field label="Bio" hint={<span className="text-text-muted">Optional</span>}>
        <TextInput value={bio} onChange={(e) => onBio(e.target.value)} placeholder="A short line about you" />
      </Field>

      <Field label="Status" hint={<span className="text-text-muted">Optional</span>}>
        <TextInput value={statusText} onChange={(e) => onStatus(e.target.value)} placeholder="Available" />
      </Field>

      {error && <p className="text-xs text-[color:var(--color-primary)]">{error}</p>}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="gradient" className="flex-1" disabled={!canFinish} onClick={handleFinish}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
        </Button>
      </div>
    </div>
  );
}
