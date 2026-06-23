import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { useCryptoStore, type Decryptable } from "./cryptoStore";

/**
 * React bindings for the E2EE layer (Phase 2). `useE2EEInit` bootstraps the device keypair when the
 * user is authenticated; `useDecryptedText` resolves an encrypted body to plaintext for display;
 * `usePeerHasKey` tells the UI whether a peer is E2EE-capable (drives the encryption badge).
 */

/** Bootstrap/teardown E2EE alongside the auth session. Mount once inside the authenticated shell. */
export function useE2EEInit(): void {
  const userId = useAuthStore((s) => s.user?._id);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "authed" && userId) {
      void useCryptoStore.getState().init(userId);
    } else if (status === "guest") {
      useCryptoStore.getState().reset();
    }
  }, [status, userId]);
}

export interface E2EEAccount {
  /** Crypto lifecycle: idle | initializing | ready | locked | unsupported. */
  status: import("./cryptoStore").E2EEStatus;
  /** Ready, but the account has no server key backup yet → multi-device not set up. */
  needsBackup: boolean;
  /** A server backup exists but this device can't read history until it's unlocked. */
  locked: boolean;
  /** Unused single-use recovery codes left on the account (drives the "use a backup code" option). */
  recoveryCodesRemaining: number;
  /** Masked verified phone (e.g. "•••• 3210") for the recovery-code unlock flow; null if unknown. */
  phoneHint: string | null;
}

/** Account-level E2EE state (Sprint D / D.1) for the unlock/setup UI and recovery settings. */
export function useE2EEAccount(): E2EEAccount {
  const status = useCryptoStore((s) => s.status);
  const needsBackup = useCryptoStore((s) => s.needsBackup);
  const recoveryCodesRemaining = useCryptoStore((s) => s.recoveryCodesRemaining);
  const phoneHint = useCryptoStore((s) => s.phoneHint);
  return { status, needsBackup, locked: status === "locked", recoveryCodesRemaining, phoneHint };
}

export type DecryptedState = "empty" | "plain" | "decrypted" | "pending" | "failed";

export interface DecryptedText {
  text: string;
  state: DecryptedState;
}

/** Resolve a (possibly encrypted) message/reply body to display text, decrypting lazily + cached. */
export function useDecryptedText(item: Decryptable | null | undefined): DecryptedText {
  const id = item?.id;
  const encrypted = Boolean(item?.encrypted);
  const content = item?.content;

  const status = useCryptoStore((s) => s.status);
  const cached = useCryptoStore((s) => (id && encrypted ? s.plaintext[id] : undefined));

  useEffect(() => {
    if (encrypted && id && content && status === "ready" && cached === undefined) {
      useCryptoStore.getState().decryptInto(id, content);
    }
  }, [encrypted, id, content, status, cached]);

  if (!item || !id) return { text: "", state: "empty" };
  if (!encrypted) return { text: content ?? "", state: "plain" };
  if (cached === undefined) {
    return { text: "", state: status === "unsupported" ? "failed" : "pending" };
  }
  if (cached === null) return { text: "", state: "failed" };
  return { text: cached, state: "decrypted" };
}

/**
 * Whether a peer is E2EE-capable (has a published key). Returns undefined until known. Triggers a
 * cached key fetch so the encryption badge can reflect end-to-end vs in-transit for the active chat.
 */
export function usePeerHasKey(userId: string | undefined): boolean | undefined {
  const status = useCryptoStore((s) => s.status);
  const cached = useCryptoStore((s) => (userId ? s.peerKeys[userId] : undefined));

  useEffect(() => {
    if (userId && status === "ready" && cached === undefined) {
      void useCryptoStore.getState().fetchPeerKey(userId);
    }
  }, [userId, status, cached]);

  if (!userId || cached === undefined) return undefined;
  return cached !== null;
}
