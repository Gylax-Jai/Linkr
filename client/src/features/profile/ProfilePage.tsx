import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { ArrowLeft, Camera, ChevronRight, Loader2, ShieldCheck, X } from "lucide-react";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, STATUS_MAX } from "@linkr/shared";

/** Status auto-clear choices (Sprint C.1). `null` = keep until manually changed. */
const STATUS_DURATION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Don't clear" },
  { value: 1, label: "1 hour" },
  { value: 4, label: "4 hours" },
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 168, label: "1 week" },
];
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { PATHS } from "@/routes/paths";
import { useUpdateAvatarMutation, useUpdateProfileMutation } from "./useProfile";

/** Turn an avatar upload failure into a specific message (prefer the server's `{ error }`). */
function avatarErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (!err.response) return "Network error — check your connection and try again.";
  }
  return "Couldn't update your photo. Please try again.";
}

/** Edit profile form — photo, displayName, bio, status (username is read-only). */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const update = useUpdateProfileMutation();
  const updateAvatar = useUpdateAvatarMutation();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [status, setStatus] = useState(user?.status ?? "");
  // Default to 1 day (the user's requested default) for new/edited statuses.
  const [statusDuration, setStatusDuration] = useState<number | null>(24);
  const [saved, setSaved] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Stage-then-save: a picked photo is held locally (with a preview object URL) and only uploaded
  // when the user clicks "Save changes". Navigating away without saving never changes the avatar.
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Revoke the preview object URL whenever it changes or the page unmounts, so there are no leaks.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!user) return null;

  const saving = update.isPending || updateAvatar.isPending;

  const clearStagedAvatar = () => {
    setStagedFile(null);
    setPreviewUrl(null); // the cleanup effect revokes the old object URL
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setAvatarError(null);

    // Upload the staged avatar first (if any). `PATCH /users/me` echoes the full session user
    // (avatar included), so patching the profile *after* the avatar leaves the auth store correct:
    // the final `setUser` carries the new displayName/bio/status *and* the freshly-uploaded avatar.
    if (stagedFile) {
      try {
        await updateAvatar.mutateAsync(stagedFile);
      } catch (error) {
        setAvatarError(avatarErrorMessage(error));
        return; // don't save the profile text if the photo upload failed
      }
    }

    const trimmedStatus = status.trim();
    update.mutate(
      {
        displayName: displayName.trim(),
        bio: bio.trim(),
        status: trimmedStatus,
        // Only meaningful when a status is set; the server ignores it for an empty status.
        ...(trimmedStatus ? { statusDurationHours: statusDuration } : {}),
      },
      {
        onSuccess: () => {
          clearStagedAvatar();
          setSaved(true);
        },
      },
    );
  };

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

    // Stage + preview only — the actual upload happens on "Save changes". Setting a new preview URL
    // makes the previous one's cleanup effect run, revoking it.
    setSaved(false);
    setStagedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 shadow-soft backdrop-blur-sm">
        <Link to={PATHS.home}>
          <Button variant="ghost" size="icon" aria-label="Back to chats">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Edit profile</h1>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-lg space-y-6 p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar name={user.displayName} src={previewUrl ?? user.avatar} size="xl" ring />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={saving}
              aria-label="Change profile photo"
              title="Change profile photo"
              className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-elevated transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {updateAvatar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
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
              disabled={saving}
              className="text-sm font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-60"
            >
              Change photo
            </button>
            {stagedFile ? (
              <button
                type="button"
                onClick={clearStagedAvatar}
                disabled={saving}
                aria-label="Discard selected photo"
                title="Discard selected photo"
                className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Discard
              </button>
            ) : null}
          </div>
          {stagedFile ? (
            <p className="text-xs text-text-muted">New photo selected — Save changes to apply.</p>
          ) : null}
          {avatarError ? (
            <p className="text-xs text-rose-500" role="alert">
              {avatarError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={user.username ? `@${user.username}` : ""}
            disabled
            className="mt-1.5 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-muted"
          />
          <p className="mt-1 text-xs text-text-muted">Usernames cannot be changed.</p>
        </div>

        <div>
          <label htmlFor="displayName" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={64}
            className="mt-1.5 w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text shadow-soft focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <div>
          <label htmlFor="bio" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={280}
            className="mt-1.5 w-full resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text shadow-soft focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <div>
          <label htmlFor="status" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Status
          </label>
          <input
            id="status"
            type="text"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            maxLength={STATUS_MAX}
            placeholder="What's on your mind?"
            className="mt-1.5 w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text shadow-soft focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <p className="mt-1 text-right text-[11px] tabular-nums text-text-muted">
            {status.length}/{STATUS_MAX}
          </p>
          {status.trim() ? (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="statusDuration" className="text-xs text-text-muted">
                Clear after
              </label>
              <select
                id="statusDuration"
                value={statusDuration === null ? "never" : String(statusDuration)}
                onChange={(e) =>
                  setStatusDuration(e.target.value === "never" ? null : Number(e.target.value))
                }
                className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-text shadow-soft focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                {STATUS_DURATION_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value === null ? "never" : String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {update.isError ? (
          <p className="text-sm text-rose-500">Could not save profile. Please try again.</p>
        ) : null}
        {saved ? <p className="text-sm text-online">Profile saved.</p> : null}

        <Button type="submit" variant="gradient" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="mx-auto w-full max-w-lg px-6 pb-10">
        <Link
          to={PATHS.settings}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-surface-2"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text-muted">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Security &amp; devices</p>
            <p className="truncate text-xs text-text-muted">
              Multi-device encryption, backup codes, and signed-in devices
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
        </Link>
      </div>
    </div>
  );
}
