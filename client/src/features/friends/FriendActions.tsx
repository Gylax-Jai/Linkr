import { useState } from "react";
import type { UserSearchResult } from "@linkr/shared";
import { Ban, Check, Clock, MessageCircle, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateChatMutation } from "@/features/chat";
import { getApiErrorCode } from "@/lib/utils/apiError";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useRejectFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "./useFriends";
import { FriendRequestDisabledModal } from "./FriendRequestDisabledModal";

/** Contextual friend actions for a search result or list row. */
export function FriendActions({
  user,
  onRequestBlocked,
}: {
  user: UserSearchResult;
  /** Called after showing the "requests disabled" dialog (e.g. to close a parent contact card). */
  onRequestBlocked?: () => void;
}) {
  const send = useSendFriendRequestMutation();
  const accept = useAcceptFriendRequestMutation();
  const reject = useRejectFriendRequestMutation();
  const cancel = useCancelFriendRequestMutation();
  const block = useBlockUserMutation();
  const unblock = useUnblockUserMutation();
  const [requestsDisabledOpen, setRequestsDisabledOpen] = useState(false);

  const friendship = user.friendship;
  const pending =
    send.isPending ||
    accept.isPending ||
    reject.isPending ||
    cancel.isPending ||
    block.isPending ||
    unblock.isPending;

  const sendRequest = () => {
    send.mutate(user._id, {
      onError: (err) => {
        if (getApiErrorCode(err) === "REQUESTS_DISABLED") {
          setRequestsDisabledOpen(true);
        }
      },
    });
  };

  const actions = (
    <>
      {!friendship ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={sendRequest} className="shrink-0">
          <UserPlus className="h-3.5 w-3.5" />
          Add
        </Button>
      ) : friendship.status === "accepted" ? (
        <div className="flex shrink-0 items-center gap-1">
          <MessageFriendButton userId={user._id} />
          <UnfriendButton userId={user._id} name={user.displayName} />
        </div>
      ) : friendship.status === "pending" && friendship.direction === "outgoing" ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5" />
            Pending
          </span>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => cancel.mutate(friendship.id)}>
            Cancel
          </Button>
        </div>
      ) : friendship.status === "pending" && friendship.direction === "incoming" ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => accept.mutate(friendship.id)}>
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => reject.mutate(friendship.id)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : friendship.status === "blocked" ? (
        friendship.blockedByMe ? (
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
        ) : (
          <span className="shrink-0 text-xs text-text-muted">Blocked</span>
        )
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" disabled={pending} onClick={sendRequest}>
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            onClick={() => block.mutate(user._id)}
            aria-label="Block user"
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </>
  );

  return (
    <>
      {actions}
      <FriendRequestDisabledModal
        name={user.displayName}
        open={requestsDisabledOpen}
        onClose={() => {
          setRequestsDisabledOpen(false);
          onRequestBlocked?.();
        }}
      />
    </>
  );
}

export function MessageFriendButton({ userId, onStarted }: { userId: string; onStarted?: () => void }) {
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

export function UnfriendButton({ userId, name }: { userId: string; name: string }) {
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
