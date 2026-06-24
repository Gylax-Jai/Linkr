import { SOCKET_EVENTS } from "@linkr/shared";
import { ChatModel } from "../../models/Chat.js";
import { FriendshipModel } from "../../models/Friendship.js";
import { getSocketServer } from "../../sockets/io.js";

async function getProfileChangeRecipients(changedUserId: string): Promise<string[]> {
  const friendships = await FriendshipModel.find({
    status: "accepted",
    $or: [{ requester: changedUserId }, { recipient: changedUserId }],
  }).select("requester recipient");

  const recipients = new Set<string>();
  for (const f of friendships) {
    const requesterId = f.requester.toString();
    recipients.add(requesterId === changedUserId ? f.recipient.toString() : requesterId);
  }

  const chats = await ChatModel.find({
    type: "1:1",
    members: changedUserId,
  }).select("members");

  for (const chat of chats) {
    for (const member of chat.members) {
      const id = member.toString();
      if (id !== changedUserId) recipients.add(id);
    }
  }

  return [...recipients];
}

/** Tell friends and chat partners to refresh their cached view of this user (Phase 4.3). */
export async function notifyProfileChanged(changedUserId: string): Promise<void> {
  const io = getSocketServer();
  if (!io) return;

  const recipients = await getProfileChangeRecipients(changedUserId);
  const payload = { userId: changedUserId };
  for (const recipientId of recipients) {
    io.to(`user:${recipientId}`).emit(SOCKET_EVENTS.USER_PROFILE_CHANGED, payload);
  }
}
