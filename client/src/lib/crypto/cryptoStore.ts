import { create } from "zustand";
import type { PublicKeyResponse } from "@linkr/shared";
import { api } from "@/lib/api";
import { getSodium, type Sodium } from "./sodium";
import { loadKeypair, saveKeypair, type StoredKeypair } from "./storage";
import { decryptEnvelope, encryptEnvelope, type Recipient } from "./messageCrypto";

/**
 * E2EE runtime state (Phase 2, blueprint §9). Holds the device keypair (in memory after load from
 * IndexedDB), a cache of peers' public keys, and a cache of decrypted plaintext keyed by message id
 * so the UI can render encrypted bodies. The server never sees any of this.
 *
 * Graceful degradation: if libsodium or IndexedDB is unavailable, status becomes "unsupported" and
 * the app falls back to plaintext (encrypted in transit only) — the same path used for the dev bot
 * and any peer who has not published a key.
 */

export type E2EEStatus = "idle" | "initializing" | "ready" | "unsupported";

export interface EncryptResult {
  content: string;
  encrypted: boolean;
}

/** Anything with a stable id + (maybe) an encrypted content body — MessageDTO or ReplyPreview. */
export interface Decryptable {
  id: string;
  content?: string;
  encrypted?: boolean;
}

interface CryptoState {
  status: E2EEStatus;
  myUserId: string | null;
  keypair: StoredKeypair | null;
  sodium: Sodium | null;
  /** userId -> base64 public key, or null when the peer has no key (e.g. the dev bot). */
  peerKeys: Record<string, string | null>;
  /** messageId -> decrypted plaintext, or null when it cannot be decrypted. */
  plaintext: Record<string, string | null>;

  init: (userId: string) => Promise<void>;
  reset: () => void;
  fetchPeerKey: (userId: string) => Promise<string | null>;
  encryptText: (plaintext: string, recipientIds: string[]) => Promise<EncryptResult>;
  decryptInto: (id: string, content: string) => void;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  status: "idle",
  myUserId: null,
  keypair: null,
  sodium: null,
  peerKeys: {},
  plaintext: {},

  /**
   * Ensure this device has a keypair for `userId` and that the server holds the matching public key.
   * Idempotent and safe to call on every authenticated mount. Generates a fresh keypair when none
   * exists locally (e.g. new device / cleared storage), overwriting the server's key — old messages
   * sealed to a previous key then become unreadable (accepted lost-key tradeoff).
   */
  init: async (userId) => {
    if (get().status === "initializing") return;
    if (get().status === "ready" && get().myUserId === userId) return;
    set({ status: "initializing", myUserId: userId });

    try {
      const sodium = await getSodium();
      let keypair = await loadKeypair(userId);

      if (!keypair) {
        const kp = sodium.crypto_box_keypair();
        keypair = {
          publicKey: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL),
          privateKey: sodium.to_base64(kp.privateKey, sodium.base64_variants.ORIGINAL),
        };
        await saveKeypair(userId, keypair);
      }

      set({ sodium, keypair, status: "ready" });

      // Publish (or rotate to) our current public key so friends can encrypt to us. Best-effort —
      // sending/receiving still works for peers who already have our key.
      try {
        await api.post("/keys", { publicKey: keypair.publicKey });
      } catch {
        /* offline or transient — retried on next init */
      }
    } catch {
      // No libsodium / IndexedDB — fall back to plaintext (encrypted in transit only).
      set({ status: "unsupported" });
    }
  },

  reset: () =>
    set({
      status: "idle",
      myUserId: null,
      keypair: null,
      sodium: null,
      peerKeys: {},
      plaintext: {},
    }),

  /** Fetch + cache a peer's public key. Caches null when the peer has none (bot/legacy). */
  fetchPeerKey: async (userId) => {
    const cached = get().peerKeys[userId];
    if (cached !== undefined) return cached;
    try {
      const res = await api.get<PublicKeyResponse>(`/keys/${userId}`);
      const key = res.data.publicKey ?? null;
      set((s) => ({ peerKeys: { ...s.peerKeys, [userId]: key } }));
      return key;
    } catch {
      // Transient error — don't cache, so a later attempt can retry.
      return null;
    }
  },

  /**
   * Encrypt `plaintext` for the sender + every recipient. Falls back to returning plaintext
   * (encrypted:false) when E2EE is unavailable or ANY recipient lacks a published key — so the dev
   * bot and not-yet-upgraded peers can still read the message.
   */
  encryptText: async (plaintext, recipientIds) => {
    const { status, sodium, keypair, myUserId } = get();
    if (status !== "ready" || !sodium || !keypair || !myUserId) {
      return { content: plaintext, encrypted: false };
    }

    const recipients: Recipient[] = [{ userId: myUserId, publicKey: keypair.publicKey }];
    for (const id of recipientIds) {
      if (id === myUserId) continue;
      const key = await get().fetchPeerKey(id);
      if (!key) return { content: plaintext, encrypted: false };
      recipients.push({ userId: id, publicKey: key });
    }

    try {
      const content = encryptEnvelope(sodium, plaintext, recipients);
      return { content, encrypted: true };
    } catch {
      return { content: plaintext, encrypted: false };
    }
  },

  /** Decrypt an encrypted body once and cache the result (or null on failure) by message id. */
  decryptInto: (id, content) => {
    const { sodium, keypair, myUserId, plaintext } = get();
    if (id in plaintext) return;
    if (!sodium || !keypair || !myUserId) return;
    const text = decryptEnvelope(sodium, content, myUserId, keypair);
    set((s) => ({ plaintext: { ...s.plaintext, [id]: text } }));
  },
}));
