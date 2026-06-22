import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { PATHS } from "./paths";

/** Lightweight full-screen loader shown while the session is being restored. */
function SessionLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-bg text-text">
      <div className="flex flex-col items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary font-mono text-xl font-bold text-primary-foreground shadow-glow">
          L
        </span>
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    </div>
  );
}

/** Requires an authenticated session; redirects guests to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <SessionLoading />;
  if (status === "guest") return <Navigate to={PATHS.login} replace />;
  return <>{children}</>;
}

/** Requires a completed onboarding; redirects un-onboarded users to /onboarding. */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status === "loading") return <SessionLoading />;
  if (status === "guest") return <Navigate to={PATHS.login} replace />;
  if (user && !user.onboarded) return <Navigate to={PATHS.onboarding} replace />;
  return <>{children}</>;
}
