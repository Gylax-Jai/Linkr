import type { ID, Timestamp } from "./common.js";

export type ChatType = "1:1" | "group" | "self";

/** A conversation between two users (1:1) or many (group, Phase 2) (blueprint §12). */
export interface Chat {
  _id: ID;
  type: ChatType;
  members: ID[];
  admins: ID[];
  name?: string;
  avatar?: string;
  pinnedBy: ID[];
  lastMessage?: ID;
  createdAt: Timestamp;
}
