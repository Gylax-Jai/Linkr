import { z } from "zod";

export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 2000;

/** POST /api/support/contact — user support query stored in MongoDB for manual review. */
export const supportContactSchema = z.object({
  message: z
    .string()
    .trim()
    .min(SUPPORT_MESSAGE_MIN, `Please write at least ${SUPPORT_MESSAGE_MIN} characters`)
    .max(SUPPORT_MESSAGE_MAX),
});

export type SupportContactInput = z.infer<typeof supportContactSchema>;
