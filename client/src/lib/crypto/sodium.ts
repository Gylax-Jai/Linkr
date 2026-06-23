import _sodium from "libsodium-wrappers-sumo";

/**
 * Lazy libsodium loader (Phase 2, blueprint §9). libsodium initializes its WASM/asm backend
 * asynchronously, so every caller must await `getSodium()` before using the primitives. The module
 * is loaded once and cached; we expose the ready instance so the crypto layer stays synchronous
 * after the first await.
 *
 * We load the "sumo" build because account-level recovery (Sprint D/D.1) needs `crypto_pwhash`
 * (Argon2id) and `crypto_hash_sha256`, which the standard build deliberately omits. Using the
 * standard build silently breaks backup setup: those symbols are `undefined`, so any call throws
 * before the network request fires.
 */
export type Sodium = typeof _sodium;

let ready: Promise<Sodium> | null = null;

export function getSodium(): Promise<Sodium> {
  if (!ready) {
    ready = _sodium.ready.then(() => _sodium);
  }
  return ready;
}
