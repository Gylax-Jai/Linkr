/**
 * End-to-end encryption layer (Phase 2, blueprint §9: client/src/lib/crypto).
 *
 * Wraps libsodium: a per-device X25519 keypair (PRIVATE key in IndexedDB, never sent to the server;
 * PUBLIC key published via /api/keys), with text messages sealed to each chat member's public key
 * (`crypto_box_seal`). Isolated in this folder so it can be audited/swapped independently.
 *
 * Public API: bootstrap with `useE2EEInit`, encrypt via `useCryptoStore.getState().encryptText`,
 * and render via `useDecryptedText` / `usePeerHasKey`.
 */
export { useCryptoStore, type Decryptable, type EncryptResult, type E2EEStatus } from "./cryptoStore";
export {
  useE2EEInit,
  useDecryptedText,
  usePeerHasKey,
  type DecryptedText,
  type DecryptedState,
} from "./useE2EE";
