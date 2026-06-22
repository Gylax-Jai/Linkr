import type { UserSearchResult } from "@linkr/shared";
import { Ban, Check, Clock, MessageCircle, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useCreateChatMutation } from "@/features/chat";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useRejectFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "./useFriends";

function handleLabel(user: UserSearchResult): string {
  return user.username ? `@${user.username}` : user.displayName;
}

/** Contextual friend actions for a search result or list row. */
export function FriendActions({ user }: { user: UserSearchResult }) {
  const send = useSendFriendRequestMutation();
  const accept = useAcceptFriendRequestMutation();
  const reject = useRejectFriendRequestMutation();
  const cancel = useCancelFriendRequestMutation();
  const block = useBlockUserMutation();
  const unblock = useUnblockUserMutation();

  const friendship = user.friendship;
  const pending =
    send.isPending ||
    accept.isPending ||
    reject.isPending ||
    cancel.isPending ||
    block.isPending ||
    unblock.isPending;

  if (!friendship) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => send.mutate(user._id)}
        className="shrink-0"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add
      </Button>
    );
  }

  if (friendship.status === "accepted") {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <MessageFriendButton userId={user._id} />
        <UnfriendButton userId={user._id} name={user.displayName} />
      </div>
    );
  }

  if (friendship.status === "pending" && friendship.direction === "outgoing") {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <Clock className="h-3.5 w-3.5" />
          Pending
        </span>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => cancel.mutate(friendship.id)}>
          Cancel
        </Button>
      </div>
    );
  }

  if (friendship.status === "pending" && friendship.direction === "incoming") {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => accept.mutate(friendship.id)}>
          <Check className="h-3.5 w-3.5" />
          Accept
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => reject.mutate(friendship.id)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (friendship.status === "blocked") {
    // Only the blocker can lift their own block; a block placed by the other user is opaque.
    if (friendship.blockedByMe) {
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => unblock.mutate(user._id)}
          className="shrink-0"
        >
          <ShieldOff className="h-3.5 w-3.5" />
          Unblock
        </Button>
      );
    }
    return <span className="shrink-0 text-xs text-text-muted">Blocked</span>;
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => send.mutate(user._id)}>
        <UserPlus className="h-3.5 w-3.5" />
        Add
      </Button>
      <Button variant="ghost" size="icon" disabled={pending} onClick={() => block.mutate(user._id)} aria-label="Block user">
        <Ban className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MessageFriendButton({ userId, onStarted }: { userId: string; onStarted?: () => void }) {
  const createChat = useCreateChatMutation();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={createChat.isPending}
      onClick={() =>
        createChat.mutate(userId, {
          onSuccess: () => onStarted?.(),
        })
      }
      className="shrink-0"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Message
    </Button>
  );
}

function UnfriendButton({ userId, name }: { userId: string; name: string }) {
  const remove = useRemoveFriendMutation();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(`Remove ${name} from your friends? You won't be able to message until you're friends again.`)) {
          remove.mutate(userId);
        }
      }}
      aria-label={`Unfriend ${name}`}
      title="Unfriend"
      className="shrink-0"
    >
      <UserMinus className="h-3.5 w-3.5" />
    </Button>
  );
}

export function UserSearchRow({ user, onChatStarted }: { user: UserSearchResult; onChatStarted?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2">
      <Avatar name={user.displayName} src={user.avatar} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
        <p className="truncate font-mono text-xs text-text-muted">{handleLabel(user)}</p>
      </div>
      {user.friendship?.status === "accepted" ? (
        <MessageFriendButton userId={user._id} onStarted={onChatStarted} />
      ) : (
        <FriendActions user={user} />
      )}
    </div>
  );
}
