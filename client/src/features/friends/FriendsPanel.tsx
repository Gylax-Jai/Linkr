import type { FriendshipListItem } from "@linkr/shared";
import { Ban } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { MessageFriendButton, UnfriendButton } from "./FriendActions";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useFriends,
  usePendingRequests,
  useRejectFriendRequestMutation,
} from "./useFriends";

function label(user: FriendshipListItem["user"]): string {
  return user.username ? `@${user.username}` : user.displayName;
}

function PendingRow({ item }: { item: FriendshipListItem }) {
  const accept = useAcceptFriendRequestMutation();
  const reject = useRejectFriendRequestMutation();
  const cancel = useCancelFriendRequestMutation();
  const block = useBlockUserMutation();
  const pending =
    accept.isPending || reject.isPending || cancel.isPending || block.isPending;

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/80">
      <Avatar name={item.user.displayName} src={item.user.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{item.user.displayName}</p>
        <p className="truncate font-mono text-[11px] text-text-muted">{label(item.user)}</p>
      </div>
      {item.direction === "incoming" ? (
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => accept.mutate(item.friendshipId)}>
            Accept
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => reject.mutate(item.friendshipId)}>
            Decline
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => cancel.mutate(item.friendshipId)}>
            Cancel
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => block.mutate(item.user._id)}>
            Block
          </Button>
        </div>
      )}
    </div>
  );
}

function FriendRow({ item }: { item: FriendshipListItem }) {
  const block = useBlockUserMutation();

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/80">
      <Avatar name={item.user.displayName} src={item.user.avatar} size="sm" online />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{item.user.displayName}</p>
        <p className="truncate font-mono text-[11px] text-text-muted">{label(item.user)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <MessageFriendButton userId={item.user._id} />
        <UnfriendButton userId={item.user._id} name={item.user.displayName} />
        <Button
          variant="ghost"
          size="icon"
          disabled={block.isPending}
          onClick={() => block.mutate(item.user._id)}
          aria-label={`Block ${item.user.displayName}`}
          title="Block"
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Incoming/outgoing requests and accepted friends list for the details pane. */
export function FriendsPanel() {
  const { data: pending, isLoading: pendingLoading } = usePendingRequests();
  const { data: friends, isLoading: friendsLoading } = useFriends();

  const incoming = pending?.incoming ?? [];
  const outgoing = pending?.outgoing ?? [];
  const accepted = friends?.friends ?? [];

  return (
    <div className="space-y-4">
      {(incoming.length > 0 || outgoing.length > 0) && (
        <section className="rounded-2xl border border-border bg-surface-2/50 p-4 shadow-soft">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Requests</h3>
          {pendingLoading ? (
            <p className="mt-2 text-sm text-text-muted">Loading…</p>
          ) : (
            <div className="mt-2 space-y-3">
              {incoming.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">Incoming</p>
                  {incoming.map((item) => <PendingRow key={item.friendshipId} item={item} />)}
                </div>
              )}
              {outgoing.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">Outgoing</p>
                  {outgoing.map((item) => <PendingRow key={item.friendshipId} item={item} />)}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface-2/50 p-4 shadow-soft">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Friends</h3>
        {friendsLoading ? (
          <p className="mt-2 text-sm text-text-muted">Loading…</p>
        ) : accepted.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Search by @username to send a request. Messaging unlocks once they accept.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {accepted.map((item) => (
              <li key={item.friendshipId}>
                <FriendRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
