import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { PATHS } from "@/routes/paths";
import { useGoogleLoginMutation } from "./useAuth";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** The Linkr sign-in screen: brand mark, tagline, Google sign-in, and a privacy/trust note. */
export function LoginPage() {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const login = useGoogleLoginMutation();

  // Once authenticated, leave /login; the home route forwards to onboarding if needed.
  useEffect(() => {
    if (status === "authed") {
      navigate(PATHS.home, { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg px-4 py-12 text-text">
      {/* Soft themed background flourishes. */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-primary opacity-20 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="rounded-3xl border border-border bg-surface/80 p-8 shadow-elevated backdrop-blur-sm">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary font-mono text-2xl font-bold text-primary-foreground shadow-glow">
              L
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">
              Welcome to Link<span className="text-gradient-primary">r</span>
            </h1>
            <p className="mt-1 text-sm text-text-muted">Connect privately. Talk freely.</p>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            {GOOGLE_CLIENT_ID ? (
              <div className="flex min-h-[44px] w-full justify-center">
                <GoogleLogin
                  theme="filled_black"
                  shape="pill"
                  text="continue_with"
                  width="320"
                  onSuccess={(cred) => {
                    if (cred.credential) {
                      login.mutate(cred.credential);
                    }
                  }}
                  onError={() => login.reset()}
                />
              </div>
            ) : (
              <p className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-center text-xs text-text-muted">
                Google sign-in is not configured. Set <span className="font-mono">VITE_GOOGLE_CLIENT_ID</span> to enable it.
              </p>
            )}

            {login.isPending && <p className="text-xs text-text-muted">Signing you in…</p>}
            {login.isError && (
              <p className="text-xs text-[color:var(--color-primary)]">
                Sign-in failed. Please try again.
              </p>
            )}
          </div>

          <div className="mt-8 space-y-3 border-t border-border pt-6">
            <TrustPoint icon={<Lock className="h-4 w-4 text-primary" />} label="End-to-end encrypted conversations" />
            <TrustPoint icon={<ShieldCheck className="h-4 w-4 text-primary" />} label="Strangers can't message you until you're friends" />
            <TrustPoint icon={<Sparkles className="h-4 w-4 text-primary" />} label="No passwords — sign in securely with Google" />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          By continuing you agree to keep it kind. Linkr never stores your messages in readable form.
        </p>
      </div>
    </div>
  );
}

function TrustPoint({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-text">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10">{icon}</span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}
