import { ACCOUNT_DELETION_GRACE_DAYS } from "@linkr/shared";
import { isMongoConnected } from "../../config/db.js";
import { ChatModel } from "../../models/Chat.js";
import { FriendshipModel } from "../../models/Friendship.js";
import { MessageModel } from "../../models/Message.js";
import { NotificationModel } from "../../models/Notification.js";
import { OtpModel } from "../../models/Otp.js";
import { ReportModel } from "../../models/Report.js";
import { SessionModel } from "../../models/Session.js";
import { UserModel } from "../../models/User.js";
import { logger } from "../../utils/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How often the background purge job scans for accounts whose grace period has elapsed. */
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

/**
 * Permanently delete a user and ALL of their data (Phase 4). This is irreversible: chats they're a
 * member of (and every message in them), friendships, notifications they sent or received, reports
 * they filed or that name them, login sessions, and any pending OTP. Mirrors the dev `delete-user`
 * script. Best-effort and idempotent — safe to call from the cron or the immediate-delete endpoint.
 */
export async function purgeUser(userId: string): Promise<void> {
  const user = await UserModel.findById(userId).select("+phoneHash");
  if (!user) return;

  const chats = await ChatModel.find({ members: userId }).select("_id").lean();
  const chatIds = chats.map((c) => c._id);
  if (chatIds.length > 0) {
    await MessageModel.deleteMany({ chatId: { $in: chatIds } });
    await ChatModel.deleteMany({ _id: { $in: chatIds } });
  }

  await FriendshipModel.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] });
  await NotificationModel.deleteMany({ $or: [{ user: userId }, { actor: userId }] });
  await ReportModel.deleteMany({ $or: [{ reporter: userId }, { reportedUser: userId }] });
  await SessionModel.deleteMany({ user: userId });
  if (user.phoneHash) {
    await OtpModel.deleteOne({ phone: user.phoneHash });
  }

  await UserModel.deleteOne({ _id: userId });
}

/**
 * Soft-delete (deactivate) an account (Phase 4). The account is signed out on every device and
 * scheduled for permanent purge after the grace period; logging back in reactivates it. Idempotent.
 */
export async function deactivateAccount(userId: string): Promise<Date> {
  const scheduledPurgeAt = new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        accountStatus: "deactivated",
        deactivatedAt: new Date(),
        scheduledPurgeAt,
        online: false,
      },
    },
  );
  // Sign out everywhere: deleting sessions invalidates outstanding refresh tokens immediately.
  await SessionModel.deleteMany({ user: userId });
  return scheduledPurgeAt;
}

/**
 * Reactivate a deactivated account (called from the Google login flow). Clears the scheduled purge
 * so the account is no longer eligible for deletion. No-op for already-active accounts.
 */
export function applyReactivation(user: {
  accountStatus?: string | null;
  set: (path: string, value: unknown) => void;
}): boolean {
  if (user.accountStatus !== "deactivated") return false;
  user.set("accountStatus", "active");
  user.set("deactivatedAt", undefined);
  user.set("scheduledPurgeAt", undefined);
  return true;
}

/** Permanently purge every deactivated account whose grace period has elapsed. Returns the count. */
export async function purgeDueAccounts(): Promise<number> {
  if (!isMongoConnected()) return 0;
  const due = await UserModel.find({
    accountStatus: "deactivated",
    scheduledPurgeAt: { $lte: new Date() },
  })
    .select("_id")
    .lean();

  for (const u of due) {
    try {
      await purgeUser(String(u._id));
    } catch (err) {
      logger.warn("account purge failed", { userId: String(u._id), err: err instanceof Error ? err.message : String(err) });
    }
  }
  if (due.length > 0) logger.info(`Purged ${due.length} deactivated account(s) past their grace period`);
  return due.length;
}

/**
 * Start the recurring account-purge job. Runs shortly after boot and then on a fixed interval.
 * Returns a stop function for graceful shutdown. The timer is unref'd so it never keeps the process
 * alive on its own.
 */
export function startAccountPurgeJob(): () => void {
  const kick = () => {
    void purgeDueAccounts().catch((err) =>
      logger.warn("account purge job error", { err: err instanceof Error ? err.message : String(err) }),
    );
  };
  // First sweep a minute after boot (gives Mongo time to connect), then every PURGE_INTERVAL_MS.
  const initial = setTimeout(kick, 60_000);
  const interval = setInterval(kick, PURGE_INTERVAL_MS);
  initial.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
