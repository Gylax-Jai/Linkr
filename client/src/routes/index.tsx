import { useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout";
import { LoginPage } from "@/features/auth";
import { SocketProvider } from "@/features/chat";
import { CallProvider } from "@/features/calls";
import { OnboardingWizard } from "@/features/onboarding";
import { ProfilePage } from "@/features/profile";
import { SettingsPage } from "@/features/settings";
import { SupportPage } from "@/features/support";
import { E2EEKeyGuard, E2EESecurityPrompt } from "@/features/security";
import { useAuthStore } from "@/lib/store";
import { useE2EEInit } from "@/lib/crypto";
import { syncPushSubscription } from "@/features/push";
import { PATHS } from "./paths";
import { RequireAuth, RequireOnboarded } from "./guards";

function OnboardingGate() {
  const user = useAuthStore((s) => s.user);
  if (user?.onboarded) return <Navigate to={PATHS.home} replace />;
  return <OnboardingWizard />;
}

function AuthedShell({ children }: { children: React.ReactNode }) {
  // Bootstrap the account E2EE keypair (Phase 2 + Sprint D) once we're in the authenticated app.
  useE2EEInit();
  useEffect(() => {
    void syncPushSubscription();
  }, []);
  return (
    <SocketProvider>
      <CallProvider>
        {children}
        {/* Account-key unlock (new device) + one-time E2EE setup prompt for new users. */}
        <E2EEKeyGuard />
        <E2EESecurityPrompt />
      </CallProvider>
    </SocketProvider>
  );
}

const router = createBrowserRouter([
  { path: PATHS.login, element: <LoginPage /> },
  {
    path: PATHS.onboarding,
    element: (
      <RequireAuth>
        <OnboardingGate />
      </RequireAuth>
    ),
  },
  {
    path: PATHS.profile,
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <ProfilePage />
        </RequireOnboarded>
      </RequireAuth>
    ),
  },
  {
    path: PATHS.settings,
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <SettingsPage />
        </RequireOnboarded>
      </RequireAuth>
    ),
  },
  {
    path: PATHS.support,
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <SupportPage />
        </RequireOnboarded>
      </RequireAuth>
    ),
  },
  {
    path: PATHS.home,
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <AuthedShell>
            <AppShell />
          </AuthedShell>
        </RequireOnboarded>
      </RequireAuth>
    ),
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
