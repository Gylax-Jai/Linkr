import { z } from "zod";

/** Reasons a user can pick when reporting someone (Phase 4). `other` requires free-text details. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "inappropriate_content",
  "impersonation",
  "underage",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Human labels for each reason (shared by the client UI). */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  inappropriate_content: "Inappropriate content",
  impersonation: "Pretending to be someone",
  underage: "Underage user",
  other: "Something else",
};

export const REPORT_DETAILS_MAX = 1000;

/** Lifecycle states for a report (server-managed; clients only ever create reports). */
export const REPORT_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** POST /api/users/:userId/report — body. `details` is required when reason is "other". */
export const reportUserSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
  })
  .refine((data) => data.reason !== "other" || Boolean(data.details?.trim()), {
    message: "Please add a few details",
    path: ["details"],
  });

export type ReportUserInput = z.infer<typeof reportUserSchema>;
