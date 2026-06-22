import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout";
import { LoginPage } from "@/features/auth";
import { SocketProvider } from "@/features/chat";
import { OnboardingWizard } from "@/features/onboarding";
import { ProfilePage } from "@/features/profile";
import { useAuthStore } from "@/lib/store";
import { useE2EEInit } from "@/lib/crypto";
import { PATHS } from "./paths";
import { RequireAuth, RequireOnboarded } from "./guards";

function OnboardingGate() {
  const user = useAuthStore((s) => s.user);
  if (user?.onboarded) return <Navigate to={PATHS.home} replace />;
  return <OnboardingWizard />;
}

function AuthedShell({ children }: { children: React.ReactNode }) {
  // Bootstrap the device E2EE keypair (Phase 2) once we're in the authenticated app.
  useE2EEInit();
  return (
    <SocketProvider>
      {children}
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
