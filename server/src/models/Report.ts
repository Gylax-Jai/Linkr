import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { REPORT_REASONS, REPORT_STATUSES } from "@linkr/shared";

/**
 * User report (Phase 4). One document per report submission. Reports are write-only from the
 * client's perspective — users create them; review/triage happens out-of-band by an admin. We store
 * the reporter, the reported user, a structured reason, and optional free-text details (capped, and
 * never message content). `status` lets an operator track triage state.
 */
const reportSchema = new Schema(
  {
    reporter: { type: Types.ObjectId, ref: "User", required: true, index: true },
    reportedUser: { type: Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Triage access pattern: newest-first list of reports against a given user.
reportSchema.index({ reportedUser: 1, createdAt: -1 });

export type ReportDoc = InferSchemaType<typeof reportSchema>;
export const ReportModel = model("Report", reportSchema);
