import { z } from "zod";

/** Route param for marking a single notification read (PATCH /api/notifications/:id/read). */
export const notificationIdParamSchema = z.object({
  id: z.string().min(1),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
