import _sodium from "libsodium-wrappers";

/**
 * Lazy libsodium loader (Phase 2, blueprint §9). libsodium initializes its WASM/asm backend
 * asynchronously, so every caller must await `getSodium()` before using the primitives. The module
 * is loaded once and cached; we expose the ready instance so the crypto layer stays synchronous
 * after the first await.
 */
export type Sodium = typeof _sodium;

let ready: Promise<Sodium> | null = null;

export function getSodium(): Promise<Sodium> {
  if (!ready) {
    ready = _sodium.ready.then(() => _sodium);
  }
  return ready;
}
