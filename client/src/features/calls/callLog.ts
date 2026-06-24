/** Lightweight client-side call diagnostics (visible in mobile remote debug). Phase 3.1.11 */
export function callLog(step: string, meta?: Record<string, unknown>): void {
  if (meta) console.info(`[linkr:call] ${step}`, meta);
  else console.info(`[linkr:call] ${step}`);
}
