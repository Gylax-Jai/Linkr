/**
 * Dev-only utility: list or fully delete a user (+ related chats, messages, friendships,
 * notifications). Usage:
 *   pnpm --filter @linkr/server delete-user -- --list
 *   pnpm --filter @linkr/server delete-user -- --email you@gmail.com
 *
 * Never run in production without understanding the impact.
 */

import mongoose, { Types } from "mongoose";
import { env } from "../src/config/env.js";
import { ChatModel } from "../src/models/Chat.js";
import { FriendshipModel } from "../src/models/Friendship.js";
import { MessageModel } from "../src/models/Message.js";
import { NotificationModel } from "../src/models/Notification.js";
import { OtpModel } from "../src/models/Otp.js";
import { UserModel } from "../src/models/User.js";

async function connect(): Promise<void> {
  if (!env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }
  await mongoose.connect(env.MONGODB_URI);
}

async function listUsers(): Promise<void> {
  const users = await UserModel.find()
    .select("email displayName username onboarded phoneVerified createdAt")
    .sort({ createdAt: -1 })
    .lean();
  if (users.length === 0) {
    console.log("No users found.");
    return;
  }
  console.log("\nUsers in database:\n");
  for (const u of users) {
    console.log(
      `  ${u._id}  ${u.email}  @${u.username ?? "—"}  onboarded=${u.onboarded}  phoneVerified=${u.phoneVerified}`,
    );
  }
  console.log("\nDelete with: pnpm --filter @linkr/server delete-user -- --email <address>\n");
}

async function deleteUserByEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalized }).select("+phoneHash");
  if (!user) {
    console.error(`No user found with email: ${normalized}`);
    process.exit(1);
  }

  const userId = user._id as Types.ObjectId;
  console.log(`Deleting user ${user.email} (${userId})…`);

  const chats = await ChatModel.find({ members: userId }).select("_id").lean();
  const chatIds = chats.map((c) => c._id);

  if (chatIds.length > 0) {
    const msg = await MessageModel.deleteMany({ chatId: { $in: chatIds } });
    console.log(`  Removed ${msg.deletedCount} message(s) from ${chatIds.length} chat(s)`);
    const ch = await ChatModel.deleteMany({ _id: { $in: chatIds } });
    console.log(`  Removed ${ch.deletedCount} chat(s)`);
  }

  const fr = await FriendshipModel.deleteMany({
    $or: [{ requester: userId }, { recipient: userId }],
  });
  console.log(`  Removed ${fr.deletedCount} friendship(s)`);

  const notif = await NotificationModel.deleteMany({
    $or: [{ user: userId }, { actor: userId }],
  });
  console.log(`  Removed ${notif.deletedCount} notification(s)`);

  if (user.phoneHash) {
    const otp = await OtpModel.deleteOne({ phone: user.phoneHash });
    if (otp.deletedCount) console.log("  Removed pending OTP record");
  }

  await UserModel.deleteOne({ _id: userId });
  console.log(`\nDone. ${user.email} was deleted. Sign in with Google again to create a fresh account.\n`);
  console.log("Tip: in the browser, clear site data (or IndexedDB 'linkr-e2ee') if E2EE keys act stale.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const emailIdx = args.indexOf("--email");
  const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;

  await connect();

  try {
    if (list || !email) {
      await listUsers();
      if (!email && !list) {
        console.error("Pass --email <address> to delete, or --list to show users only.");
        process.exit(1);
      }
    } else {
      await deleteUserByEmail(email);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
