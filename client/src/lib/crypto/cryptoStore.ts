import { create } from "zustand";
import type {
  KeyBackup,
  KeyBackupResponse,
  PublicKeyResponse,
  RecoverResponse,
} from "@linkr/shared";
import { api } from "@/lib/api";
import { getSodium, type Sodium } from "./sodium";
import { loadKeypair, saveKeypair, type StoredKeypair } from "./storage";
import {
  generateRecoveryCodes,
  recoveryCodeIdHash,
  unwrapKeypair,
  wrapKeypair,
  wrapKeypairForCodes,
} from "./keyBackup";
import { decryptEnvelope, encryptEnvelope, type Recipient } from "./messageCrypto";

/**
 * E2EE runtime state (Phase 2 + Sprint D). Holds the account keypair (in memory after load from
 * IndexedDB), a cache of peers' public keys, and a cache of decrypted plaintext keyed by message id
 * so the UI can render encrypted bodies. The server never sees any private key or the passphrase.
 *
 * Sprint D — account-level keys: the keypair can be backed up to the server ENCRYPTED with a key
 * derived from the user's recovery passphrase (`keyBackup.ts`). A new device with no local key but a
 * server backup enters the "locked" state until the passphrase is provided, after which it restores
 * the same account keypair and can read all history. `needsBackup` flags a ready device whose
 * account has no backup yet (prompt the user to set a recovery passphrase to enable multi-device).
 *
 * Graceful degradation: if libsodium or IndexedDB is unavailable, status becomes "unsupported" and
 * the app falls back to plaintext (encrypted in transit only) — the same path used for the dev bot
 * and any peer who has not published a key.
 */

export type E2EEStatus = "idle" | "initializing" | "ready" | "locked" | "unsupported";

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

/** Result of setting up recovery: the freshly minted backup codes to show the user exactly once. */
export interface SetupBackupResult {
  ok: boolean;
  /** The plaintext recovery codes (present only on success) — display once, never stored. */
  codes?: string[];
}

/** Proof of phone ownership for redeeming a recovery code (MSG91 token, or dev phone + OTP). */
export type RecoveryProof = { accessToken: string } | { phone: string; otp: string };

interface CryptoState {
  status: E2EEStatus;
  myUserId: string | null;
  keypair: StoredKeypair | null;
  sodium: Sodium | null;
  /** True when this device is "ready" but the account has no server key backup yet (prompt setup). */
  needsBackup: boolean;
  /** The server backup awaiting a passphrase while `status === "locked"`. */
  pendingBackup: KeyBackup | null;
  /** Unused single-use recovery codes left on the account (drives the "use a backup code" option). */
  recoveryCodesRemaining: number;
  /** Masked verified phone (e.g. "•••• 3210") for the recovery-code unlock flow; null if unknown. */
  phoneHint: string | null;
  /** userId -> base64 public key, or null when the peer has no key (e.g. the dev bot). */
  peerKeys: Record<string, string | null>;
  /** messageId -> decrypted plaintext, or null when it cannot be decrypted. */
  plaintext: Record<string, string | null>;

  init: (userId: string) => Promise<void>;
  reset: () => void;
  fetchPeerKey: (userId: string) => Promise<string | null>;
  encryptText: (plaintext: string, recipientIds: string[]) => Promise<EncryptResult>;
  decryptInto: (id: string, content: string) => void;
  /** Restore the account keypair from the pending server backup using the recovery passphrase. */
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  /** Restore the account keypair on a new device by redeeming a single-use recovery code. */
  unlockWithRecoveryCode: (code: string, proof: RecoveryProof) => Promise<boolean>;
  /**
   * Encrypt the current device keypair under `passphrase`, mint single-use recovery codes, and upload
   * the backup + code envelopes as the account backup. Returns the plaintext codes to show once.
   */
  setupBackup: (passphrase: string) => Promise<SetupBackupResult>;
  /** Abandon a forgotten passphrase: mint a fresh keypair (old history becomes unreadable). */
  resetKeys: () => Promise<void>;
}

/** Best-effort: publish our public key so friends can encrypt to us. Safe to call repeatedly. */
async function publishPublicKey(publicKey: string): Promise<void> {
  try {
    await api.post("/keys", { publicKey });
  } catch {
    /* offline or transient — retried on next init */
  }
}

function freshKeypair(sodium: Sodium): StoredKeypair {
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(kp.privateKey, sodium.base64_variants.ORIGINAL),
  };
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  status: "idle",
  myUserId: null,
  keypair: null,
  sodium: null,
  needsBackup: false,
  pendingBackup: null,
  recoveryCodesRemaining: 0,
  phoneHint: null,
  peerKeys: {},
  plaintext: {},

  /**
   * Bootstrap E2EE for `userId`. Idempotent and safe on every authenticated mount. Decides between:
   *  - ready:  this device has a local keypair (publish it; flag `needsBackup` if the account has no
   *            server backup yet so we can prompt the user to enable multi-device).
   *  - locked: the account has a server backup but this device has no matching local key (new device
   *            or a stale local key) — wait for the recovery passphrase to restore the account key.
   *  - ready (fresh): brand-new account with no backup anywhere — mint a keypair and prompt setup.
   */
  init: async (userId) => {
    const cur = get();
    if (cur.status === "initializing") return;
    if ((cur.status === "ready" || cur.status === "locked") && cur.myUserId === userId) return;
    set({ status: "initializing", myUserId: userId });

    try {
      const sodium = await getSodium();
      const localKp = await loadKeypair(userId);

      // Does this account already have an encrypted key backup on the server? (Sprint D)
      let server: KeyBackupResponse = {
        hasBackup: false,
        backup: null,
        publicKey: null,
        recoveryCodesRemaining: 0,
        phoneHint: null,
      };
      try {
        const res = await api.get<KeyBackupResponse>("/keys/backup");
        server = res.data;
      } catch {
        /* offline/transient — treat as "no backup info"; a local key still works locally */
      }

      // Carried into every resolution so the unlock/recovery UI knows what's available.
      const meta = {
        recoveryCodesRemaining: server.recoveryCodesRemaining ?? 0,
        phoneHint: server.phoneHint ?? null,
      };

      if (localKp) {
        // A server backup for a DIFFERENT key means this local key is stale (created before the
        // account backup existed). The backup is the source of truth → lock to adopt the real key.
        if (server.hasBackup && server.backup && server.publicKey && server.publicKey !== localKp.publicKey) {
          set({ sodium, keypair: null, pendingBackup: server.backup, status: "locked", needsBackup: false, ...meta });
          return;
        }
        set({ sodium, keypair: localKp, status: "ready", needsBackup: !server.hasBackup, pendingBackup: null, ...meta });
        await publishPublicKey(localKp.publicKey);
        return;
      }

      // No local key on this device.
      if (server.hasBackup && server.backup) {
        // New device for an account that has a backup — need the passphrase (or a recovery code).
        set({ sodium, keypair: null, pendingBackup: server.backup, status: "locked", needsBackup: false, ...meta });
        return;
      }

      // Brand-new account with no backup anywhere — mint a keypair and publish it. `needsBackup` is
      // factual (no backup yet) but we DON'T nag: setup is opt-in from Profile → Security (D.1).
      const keypair = freshKeypair(sodium);
      await saveKeypair(userId, keypair);
      set({ sodium, keypair, status: "ready", needsBackup: true, pendingBackup: null, ...meta });
      await publishPublicKey(keypair.publicKey);
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
      needsBackup: false,
      pendingBackup: null,
      recoveryCodesRemaining: 0,
      phoneHint: null,
      peerKeys: {},
      plaintext: {},
    }),

  unlockWithPassphrase: async (passphrase) => {
    const { sodium, pendingBackup, myUserId } = get();
    if (!sodium || !pendingBackup || !myUserId) return false;

    const keypair = unwrapKeypair(sodium, pendingBackup, passphrase);
    if (!keypair) return false;

    await saveKeypair(myUserId, keypair);
    // Drop any cached "can't decrypt" results so bubbles re-attempt with the restored key.
    set({ keypair, status: "ready", needsBackup: false, pendingBackup: null, plaintext: {} });
    await publishPublicKey(keypair.publicKey);
    return true;
  },

  unlockWithRecoveryCode: async (code, proof) => {
    const { sodium, myUserId } = get();
    if (!sodium || !myUserId) return false;

    // Send only the code's SHA-256 id to the server (gated by the phone-OTP proof); it returns the
    // sealed envelope, which we then open locally with the RAW code — the server never sees it.
    let envelope: RecoverResponse["envelope"];
    try {
      const res = await api.post<RecoverResponse>("/keys/recover", {
        codeHash: recoveryCodeIdHash(sodium, code),
        ...proof,
      });
      envelope = res.data.envelope;
    } catch {
      return false;
    }

    const keypair = unwrapKeypair(sodium, envelope, code.replace(/[^0-9a-zA-Z]/g, "").toUpperCase());
    if (!keypair) return false;

    await saveKeypair(myUserId, keypair);
    set((s) => ({
      keypair,
      status: "ready",
      needsBackup: false,
      pendingBackup: null,
      plaintext: {},
      recoveryCodesRemaining: Math.max(0, s.recoveryCodesRemaining - 1),
    }));
    await publishPublicKey(keypair.publicKey);
    return true;
  },

  setupBackup: async (passphrase) => {
    const { sodium, keypair, status } = get();
    if (status !== "ready" || !sodium || !keypair) return { ok: false };

    try {
      const backup = wrapKeypair(sodium, keypair, passphrase);
      const codes = generateRecoveryCodes(sodium);
      const recoveryCodes = wrapKeypairForCodes(sodium, keypair, codes);
      await api.put("/keys/backup", { publicKey: keypair.publicKey, backup, recoveryCodes });
      set({ needsBackup: false, recoveryCodesRemaining: codes.length });
      return { ok: true, codes };
    } catch {
      return { ok: false };
    }
  },

  resetKeys: async () => {
    const { sodium, myUserId } = get();
    if (!sodium || !myUserId) return;

    const keypair = freshKeypair(sodium);
    await saveKeypair(myUserId, keypair);
    // Publishing a NEW key clears the stale server backup + recovery codes, so we need fresh ones.
    set({
      keypair,
      status: "ready",
      needsBackup: true,
      pendingBackup: null,
      plaintext: {},
      recoveryCodesRemaining: 0,
    });
    await publishPublicKey(keypair.publicKey);
  },

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
