import type { RequestHandler } from "express";
import multer, { MulterError } from "multer";
import { ApiError } from "../utils/ApiError.js";

/**
 * Build a single-file in-memory upload middleware (Sprint 5 / 5.5). A hard byte cap is enforced
 * here as a first line of DoS defense; per-kind caps + allowlist + magic-byte checks happen in the
 * media service. Multer errors are mapped to clean ApiErrors (e.g. a 413 for an oversized file).
 */
export function singleFileUpload(field: string, maxBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  });

  return (req, res, next) => {
    upload.single(field)(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          next(new ApiError(413, "PAYLOAD_TOO_LARGE", "This file is too large to upload."));
          return;
        }
        next(ApiError.badRequest("We couldn't read that upload. Please try again."));
        return;
      }
      next(err);
    });
  };
}
