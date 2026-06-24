import { isAxiosError } from "axios";

/** Read the stable API error code from an axios failure (`{ code, error }` body). */
export function getApiErrorCode(err: unknown): string | undefined {
  if (!isAxiosError(err)) return undefined;
  const data = err.response?.data as { code?: string } | undefined;
  return typeof data?.code === "string" ? data.code : undefined;
}

/** Human-readable message from an API error body, with a fallback. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
  }
  return fallback;
}
