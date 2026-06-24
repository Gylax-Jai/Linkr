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
  /** Live presence of the other party (best-effort snapshot at fetch time; socket events update it). */
  online?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A user in search results with optional friendship context for the searcher. */
export interface UserSearchResult extends PublicUser {
  /** Bio — present only when profile details are visible to the viewer. */
  bio?: string;
  /** Custom status chip — present only when profile details are visible. */
  status?: string;
  /** Live online flag — present only when last-seen/online is visible to the viewer. */
  online?: boolean;
  lastSeen?: Timestamp;
  presenceVisible?: boolean;
  profileDetailsVisible?: boolean;
  /** Thumbnail avatar visible (Friends/Everyone); false when profile privacy is Nobody. */
  contactCardVisible?: boolean;
  /** Full-screen avatar zoom allowed for the viewer (friends-only when profile is Friends). */
  avatarZoomable?: boolean;
  friendship?: {
    id: ID;
    status: FriendshipStatus;
    direction: FriendshipDirection;
    /** True when the SEARCHER is the one who placed an active block (can therefore unblock). */
    blockedByMe?: boolean;
  };
}

/** Privacy-gated profile view (search row + contact card). */
export type UserProfileView = UserSearchResult;

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
