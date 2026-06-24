import { Eye, Loader2, UserCheck } from "lucide-react";
import type { PrivacyUpdateInput } from "@linkr/shared";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useUpdatePrivacyMutation } from "./usePrivacy";

type SegmentValue = string;

interface SegmentOption {
  value: SegmentValue;
  label: string;
}

/** A compact segmented control used for each privacy choice (works well on desktop + mobile). */
function Segmented({
  value,
  options,
  disabled,
  onChange,
}: {
  value: SegmentValue;
  options: SegmentOption[];
  disabled?: boolean;
  onChange: (value: SegmentValue) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => !active && onChange(opt.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors disabled:opacity-60 sm:flex-none",
              active ? "bg-surface text-text shadow-soft" : "text-text-muted hover:text-text",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** One labelled setting row: icon + title + helper text on the left, control on the right. */
function PrivacyRow({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-text-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{hint}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-2">{children}</div>
    </div>
  );
}

/**
 * Privacy settings (Phase 4) wired to the existing `PATCH /api/users/me/privacy` endpoint. Lets the
 * user control who can see their last-seen/online state, their profile details, and who is allowed
 * to send them a friend request. Each change is saved immediately and reflected in the auth store.
 */
export function PrivacyCard() {
  const user = useAuthStore((s) => s.user);
  const update = useUpdatePrivacyMutation();
  const privacy = user?.privacy;

  if (!privacy) return null;

  const save = (patch: PrivacyUpdateInput) => update.mutate(patch);
  const saving = update.isPending;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Privacy</h2>
          <p className="mt-1 text-xs text-text-muted">
            Control what other people can see and who can reach you. Changes save automatically.
          </p>
        </div>
        {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" /> : null}
      </div>

      <div className="space-y-2">
        <PrivacyRow
          icon={<Eye className="h-4 w-4" />}
          title="Last seen & online"
          hint="Who can see when you were last active and whether you're online."
        >
          <Segmented
            value={privacy.lastSeen}
            disabled={saving}
            onChange={(v) => save({ lastSeen: v as PrivacyUpdateInput["lastSeen"] })}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "friends", label: "Friends" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
        </PrivacyRow>

        <PrivacyRow
          icon={<Eye className="h-4 w-4" />}
          title="Profile details"
          hint="Who can see your photo, bio and status. Everyone = anyone can view; Friends = only friends; Nobody = hidden."
        >
          <Segmented
            value={privacy.profile}
            disabled={saving}
            onChange={(v) => save({ profile: v as PrivacyUpdateInput["profile"] })}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "friends", label: "Friends" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
        </PrivacyRow>

        <PrivacyRow
          icon={<UserCheck className="h-4 w-4" />}
          title="Friend requests"
          hint="Choose whether anyone can send you a friend request, or no one at all."
        >
          <Segmented
            value={privacy.whoCanRequest}
            disabled={saving}
            onChange={(v) => save({ whoCanRequest: v as PrivacyUpdateInput["whoCanRequest"] })}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
        </PrivacyRow>
      </div>
    </section>
  );
}
