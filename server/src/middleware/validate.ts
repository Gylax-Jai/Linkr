import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

type Source = "body" | "query" | "params";

/**
 * Validates a request segment against a Zod schema and replaces it with the parsed value.
 * Validation lives at the edges (blueprint §16); errors bubble to the global error handler.
 */
export function validate(schema: ZodTypeAny, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Reassign the sanitized/validated data so downstream layers consume trusted input only.
    req[source] = result.data;
    next();
  };
}
