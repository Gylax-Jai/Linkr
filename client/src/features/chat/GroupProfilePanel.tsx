import { useRef, useState, type ReactNode } from "react";
import {
  Camera,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { ChatListItem } from "@linkr/shared";
import { AVATAR_ACCEPT } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { showOnlineDot } from "@/lib/utils/privacy";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { AddGroupMemberModal } from "./AddGroupMemberModal";
import {
  useDemoteGroupAdminMutation,
  usePromoteGroupAdminMutation,
  useRemoveGroupMemberMutation,
  useUpdateGroupNameMutation,
  useUploadGroupAvatarMutation,
} from "./useGroupAdmin";

function MemberActions({
  chatId,
  chat,
  memberId,
  memberName,
  isAdmin,
  canManage,
  isSelf,
}: {
  chatId: string;
  chat: ChatListItem;
  memberId: string;
  memberName: string;
  isAdmin: boolean;
  canManage: boolean;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const promote = usePromoteGroupAdminMutation(chatId);
  const demote = useDemoteGroupAdminMutation(chatId);
  const remove = useRemoveGroupMemberMutation(chatId);
  const pending = promote.isPending || demote.isPending || remove.isPending;
  const adminCount = chat.group?.admins.length ?? 0;

  if (!canManage || isSelf) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${memberName}`}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-surface py-1 shadow-elevated">
            {!isAdmin ? (
              <MenuBtn
                icon={<Shield className="h-4 w-4" />}
                label="Make admin"
                disabled={pending}
                onClick={() => {
                  promote.mutate(memberId);
                  setOpen(false);
                }}
              />
            ) : adminCount > 1 ? (
              <MenuBtn
                icon={<ShieldOff className="h-4 w-4" />}
                label="Remove admin"
                disabled={pending}
                onClick={() => {
                  demote.mutate(memberId);
                  setOpen(false);
                }}
              />
            ) : null}
            <MenuBtn
              icon={<UserMinus className="h-4 w-4" />}
              label="Remove"
              danger
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Remove ${memberName} from the group?`)) {
                  remove.mutate(memberId);
                }
                setOpen(false);
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50",
        danger ? "text-red-500" : "text-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Group-specific profile tab: rename, avatar, members, admin actions, leave. */
export function GroupProfilePanel({
  chat,
  avatarSrc,
  displayName,
  onlineOverrides,
}: {
  chat: ChatListItem;
  avatarSrc?: string;
  displayName: string;
  onlineOverrides: Record<string, boolean>;
}) {
  const userId = useAuthStore((s) => s.user?._id);
  const isAdmin = Boolean(chat.group?.isAdmin);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rename = useUpdateGroupNameMutation(chat._id);
  const uploadAvatar = useUploadGroupAvatarMutation(chat._id);

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === displayName) {
      setEditingName(false);
      setNameDraft(displayName);
      return;
    }
    await rename.mutateAsync(next);
    setEditingName(false);
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file || !isAdmin) return;
    await uploadAvatar.mutateAsync(file);
  };

  return (
    <>
      <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-6 text-center">
        <div className="relative">
          <Avatar name={displayName} src={avatarSrc} size="xl" ring icon={<Users className="h-7 w-7" />} />
          {isAdmin ? (
            <>
              <button
                type="button"
                aria-label="Change group photo"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-text shadow-soft hover:bg-surface-2"
              >
                {uploadAvatar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void onPickAvatar(f);
                  e.target.value = "";
                }}
              />
            </>
          ) : null}
        </div>
        {editingName && isAdmin ? (
          <div className="flex w-full max-w-xs items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={50}
              className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
              autoFocus
            />
            <button type="button" onClick={() => void saveName()} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              {rename.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setNameDraft(displayName);
              }}
              className="grid h-9 w-9 place-items-center rounded-full text-text-muted hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold">{displayName}</p>
            {isAdmin ? (
              <button
                type="button"
                aria-label="Rename group"
                onClick={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
        <p className="font-mono text-xs text-text-muted">{chat.group?.memberCount ?? 0} members</p>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Members</p>
          {isAdmin ? (
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Add
            </Button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {(chat.group?.members ?? []).map((m) => {
            const memberIsAdmin = chat.group?.admins.includes(m._id) ?? false;
            return (
              <li key={m._id} className="flex items-center gap-2">
                <Avatar name={m.displayName} src={m.avatar} size="sm" online={showOnlineDot(m, onlineOverrides[m._id] ?? m.online)} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.displayName}</span>
                {memberIsAdmin ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    Admin
                  </span>
                ) : null}
                <MemberActions
                  chatId={chat._id}
                  chat={chat}
                  memberId={m._id}
                  memberName={m.displayName}
                  isAdmin={memberIsAdmin}
                  canManage={isAdmin}
                  isSelf={m._id === userId}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <AddGroupMemberModal chat={chat} open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
