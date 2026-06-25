import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  if (VAPID_PUBLIC_KEY?.trim()) return VAPID_PUBLIC_KEY.trim();
  try {
    const res = await api.get<{ publicKey: string | null }>("/push/vapid-public-key");
    return res.data.publicKey;
  } catch {
    return null;
  }
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** True when this browser has an active push subscription registered with the push manager. */
export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/** Subscribe this browser for background push (Phase 5 / 7B). */
export async function subscribeToPush(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) throw new Error("Push notifications are not configured on the server");

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  await api.post("/push/subscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    expirationTime: json.expirationTime ?? null,
  });

  return permission;
}

/** Remove this browser's push subscription. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete("/push/subscribe", { data: { endpoint } });
}

/** Re-sync an existing browser subscription after login (silent). */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    await subscribeToPush();
  } catch {
    /* best-effort */
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    isPushSupported() ? Notification.permission : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      setSubscribed(false);
      return;
    }
    setPermission(Notification.permission);
    setSubscribed(await hasPushSubscription());
  }, []);

  useEffect(() => {
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToPush();
      setPermission(result);
      if (result === "denied") {
        setSubscribed(false);
        setError("Notifications blocked in browser settings");
        return;
      }
      setSubscribed(true);
    } catch (err) {
      setSubscribed(await hasPushSubscription());
      setError(err instanceof Error ? err.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSubscribed(false);
    try {
      await unsubscribeFromPush();
      setPermission(Notification.permission);
      setSubscribed(false);
    } catch (err) {
      setSubscribed(await hasPushSubscription());
      setError(err instanceof Error ? err.message : "Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (subscribed && permission === "granted") {
      await disable();
    } else {
      await enable();
    }
  }, [busy, subscribed, permission, disable, enable]);

  const enabled = permission === "granted" && subscribed;
  const blocked = permission === "denied";

  return {
    supported: isPushSupported(),
    permission,
    subscribed,
    busy,
    error,
    enable,
    disable,
    toggle,
    enabled,
    blocked,
  };
}
