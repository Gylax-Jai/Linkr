import { useState } from "react";
import type { UserSearchResult } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { FriendActions, MessageFriendButton } from "./FriendActions";
import { UserContactCardModal } from "./UserContactCardModal";

function handleLabel(user: UserSearchResult): string {
  return user.username ? `@${user.username}` : user.displayName;
}

export function UserSearchRow({ user, onChatStarted }: { user: UserSearchResult; onChatStarted?: () => void }) {
  const [cardOpen, setCardOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2">
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`View ${user.displayName}'s profile`}
        >
          <Avatar name={user.displayName} src={user.avatar} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
            <p className="truncate font-mono text-xs text-text-muted">{handleLabel(user)}</p>
          </div>
        </button>
        {user.friendship?.status === "accepted" ? (
          <MessageFriendButton userId={user._id} onStarted={onChatStarted} />
        ) : (
          <FriendActions user={user} />
        )}
      </div>
      {cardOpen ? <UserContactCardModal user={user} onClose={() => setCardOpen(false)} /> : null}
    </>
  );
}
