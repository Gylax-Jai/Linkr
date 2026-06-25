import type { ID } from "./common.js";

/** A single choice on a group poll message. */
export interface PollOption {
  id: string;
  text: string;
}

/** One member's vote on a poll (single choice per user in v1). */
export interface PollVote {
  user: ID;
  optionId: string;
}

/** Poll payload stored on `type: "poll"` messages (group chats, plaintext). */
export interface PollMeta {
  question: string;
  options: PollOption[];
  votes: PollVote[];
}
