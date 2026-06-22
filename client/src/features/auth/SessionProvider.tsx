import { useEffect, useRef, type ReactNode } from "react";
import { restoreSession } from "@/lib/api";

/**
 * Restores the auth session once on app load (refresh cookie → access token). Children always
 * render; the route guards read the auth store's `status` to gate access while restoring.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restoreSession();
  }, []);

  return <>{children}</>;
}
