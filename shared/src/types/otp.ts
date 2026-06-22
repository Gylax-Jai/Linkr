import type { ID, Timestamp } from "./common.js";

/** Phone-verification one-time-password record (blueprint §12). Only the hash is stored. */
export interface Otp {
  _id: ID;
  phone: string;
  codeHash: string;
  expiresAt: Timestamp;
  attempts: number;
}
