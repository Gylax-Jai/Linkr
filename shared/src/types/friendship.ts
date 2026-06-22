import type { ID, Timestamp } from "./common.js";
import type { PublicUser } from "./user.js";

export type FriendshipStatus = "pending" | "accepted" | "rejected" | "blocked";

/** One document per relationship; unique index on (requester, recipient) (blueprint §12). */
export interface Friendship {
  _id: ID;
  requester: ID;
  recipient: ID;
  status: FriendshipStatus;
  /** The user who performed the most recent state transition. */
  actionBy: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Direction of a pending request relative to the viewing user. */
export type FriendshipDirection = "incoming" | "outgoing";

/** Friendship row returned in list endpoints with the other party's public profile. */
export interface FriendshipListItem {
  friendshipId: ID;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  user: PublicUser;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A user in search results with optional friendship context for the searcher. */
export interface UserSearchResult extends PublicUser {
  friendship?: {
    id: ID;
    status: FriendshipStatus;
    direction: FriendshipDirection;
    /** True when the SEARCHER is the one who placed an active block (can therefore unblock). */
    blockedByMe?: boolean;
  };
}

export interface FriendsListResponse {
  friends: FriendshipListItem[];
}

export interface PendingRequestsResponse {
  incoming: FriendshipListItem[];
  outgoing: FriendshipListItem[];
}

export interface FriendRequestResponse {
  friendship: Friendship;
}
