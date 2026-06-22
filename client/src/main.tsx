import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import { ThemeProvider } from "@/lib/theme";
import { QueryProvider } from "@/lib/query/QueryProvider";
import { SessionProvider } from "@/features/auth";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

createRoot(rootElement).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </QueryProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);
