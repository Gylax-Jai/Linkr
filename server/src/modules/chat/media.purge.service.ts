import { MEDIA_RETENTION_DAYS } from "@linkr/shared";
import { isMongoConnected } from "../../config/db.js";
import { MessageModel } from "../../models/Message.js";
import { logger } from "../../utils/logger.js";
import { deleteStoredMedia, extractCloudinaryPublicId } from "./chat.media.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How often the background job scans for expired chat attachments. */
const PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12h

/**
 * Remove attachments older than {@link MEDIA_RETENTION_DAYS} from Cloudinary / local disk and
 * clear media fields on the message row (the message text / metadata row is kept).
 */
export async function purgeExpiredMedia(): Promise<number> {
  if (!isMongoConnected()) return 0;

  const cutoff = new Date(Date.now() - MEDIA_RETENTION_DAYS * DAY_MS);
  const messages = await MessageModel.find({
    mediaUrl: { $exists: true, $nin: [null, ""] },
    createdAt: { $lte: cutoff },
  })
    .select("_id mediaUrl mediaCloudId")
    .lean();

  let purged = 0;
  for (const msg of messages) {
    const mediaUrl = typeof msg.mediaUrl === "string" ? msg.mediaUrl : "";
    if (!mediaUrl) continue;
    try {
      const cloudId =
        typeof msg.mediaCloudId === "string" && msg.mediaCloudId
          ? msg.mediaCloudId
          : extractCloudinaryPublicId(mediaUrl);
      await deleteStoredMedia(mediaUrl, cloudId);
      await MessageModel.updateOne(
        { _id: msg._id },
        { $unset: { mediaUrl: 1, mediaCloudId: 1, mediaName: 1, mediaSize: 1, mediaMime: 1 } },
      );
      purged += 1;
    } catch (err) {
      logger.warn("media purge failed", {
        messageId: String(msg._id),
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (purged > 0) logger.info(`Purged ${purged} expired chat attachment(s)`);
  return purged;
}

/** Start the recurring media-retention job. Returns a stop function for graceful shutdown. */
export function startMediaPurgeJob(): () => void {
  const kick = () => {
    void purgeExpiredMedia().catch((err) =>
      logger.warn("media purge job error", { err: err instanceof Error ? err.message : String(err) }),
    );
  };
  const initial = setTimeout(kick, 90_000);
  const interval = setInterval(kick, PURGE_INTERVAL_MS);
  initial.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
