/**
 * IndexedDB storage for E2EE device keypairs (Phase 2, blueprint §9). The PRIVATE key is stored
 * here and NEVER leaves the browser. Keyed by userId so multiple accounts on one device don't
 * collide. We store base64 strings (not raw buffers) to avoid detached-ArrayBuffer pitfalls.
 *
 * Note: this is at-rest protection only against other origins (IndexedDB is origin-scoped). It is
 * not a hardware keystore; clearing site data wipes the key (old messages then become unreadable —
 * the accepted lost-key tradeoff for this MVP).
 */

export interface StoredKeypair {
  publicKey: string;
  privateKey: string;
}

const DB_NAME = "linkr-e2ee";
const STORE = "keypairs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function loadKeypair(userId: string): Promise<StoredKeypair | null> {
  const db = await openDb();
  try {
    return await new Promise<StoredKeypair | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => {
        const value = req.result as StoredKeypair | undefined;
        resolve(
          value && typeof value.publicKey === "string" && typeof value.privateKey === "string"
            ? value
            : null,
        );
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
  } finally {
    db.close();
  }
}

export async function saveKeypair(userId: string, keypair: StoredKeypair): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(keypair, userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}
