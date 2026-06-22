import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  usernameSchema,
  type OnboardingInput,
  type OtpSendResponse,
  type SessionUser,
  type UsernameAvailability,
} from "@linkr/shared";
import { api } from "@/lib/api";
import { isMsg91Enabled, sendMsg91Otp, verifyMsg91Otp } from "@/lib/msg91";
import { useAuthStore } from "@/lib/store";

/**
 * Best-effort human-readable message from a mutation error. Prefers the server's `{ error }` body
 * (e.g. the real MSG91 reason surfaced by /auth/otp/msg91-verify) over the generic Axios message.
 */
function errorMessage(err: unknown): string | undefined {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    return err.message;
  }
  return err instanceof Error ? err.message : undefined;
}

/** Live username-availability check; only runs once the value passes the shared username rules. */
export function useUsernameAvailability(username: string) {
  const valid = usernameSchema.safeParse(username).success;
  return useQuery({
    queryKey: ["username-available", username],
    queryFn: async () => {
      const res = await api.get<UsernameAvailability>("/users/username-available", {
        params: { username },
      });
      return res.data;
    },
    enabled: valid,
    staleTime: 10_000,
  });
}

/** Request an OTP for a phone number. In dev the response may include a `devCode` hint. */
export function useSendOtpMutation() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const res = await api.post<OtpSendResponse>("/auth/otp/send", { phone });
      return res.data;
    },
  });
}

/** Verify an OTP code; on success the server binds the (encrypted) phone to the user. */
export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: async (input: { phone: string; code: string }) => {
      await api.post("/auth/otp/verify", input);
    },
  });
}

/** Send an OTP via the MSG91 widget (client-side SMS send). */
function useSendMsg91OtpMutation() {
  return useMutation({
    mutationFn: async (phone: string) => {
      await sendMsg91Otp(phone);
    },
  });
}

/**
 * Verify the OTP via the MSG91 widget, then hand the resulting access token to our server which
 * re-verifies it and binds the trusted phone to the user.
 */
function useVerifyMsg91OtpMutation() {
  return useMutation({
    mutationFn: async (input: { phone: string; code: string }) => {
      const accessToken = await verifyMsg91Otp(input.code);
      await api.post("/auth/otp/msg91-verify", { accessToken });
    },
  });
}

/** Normalized result the PhoneStep consumes, regardless of provider. */
export interface PhoneVerification {
  /** True when real SMS (MSG91) is wired up; false uses the built-in dev OTP flow. */
  usingMsg91: boolean;
  send: (phone: string) => void;
  verify: (input: { phone: string; code: string }, opts: { onSuccess: () => void }) => void;
  sending: boolean;
  sent: boolean;
  sendError: boolean;
  /** The underlying send error message (e.g. the real MSG91 reason), when available. */
  sendErrorMessage?: string;
  verifying: boolean;
  verifyError: boolean;
  verifyErrorMessage?: string;
  /** Dev-only OTP hint (built-in flow only); never present with MSG91. */
  devCode?: string;
  resetVerify: () => void;
}

/**
 * Unified phone-verification hook. Uses the MSG91 widget when configured (`VITE_MSG91_*`), otherwise
 * falls back to the built-in dev OTP flow so local development works with no SMS provider.
 */
export function usePhoneVerification(): PhoneVerification {
  const usingMsg91 = isMsg91Enabled();

  const devSend = useSendOtpMutation();
  const devVerify = useVerifyOtpMutation();
  const msgSend = useSendMsg91OtpMutation();
  const msgVerify = useVerifyMsg91OtpMutation();

  if (usingMsg91) {
    return {
      usingMsg91,
      send: (phone) => msgSend.mutate(phone),
      verify: (input, opts) => msgVerify.mutate(input, opts),
      sending: msgSend.isPending,
      sent: msgSend.isSuccess,
      sendError: msgSend.isError,
      sendErrorMessage: errorMessage(msgSend.error),
      verifying: msgVerify.isPending,
      verifyError: msgVerify.isError,
      verifyErrorMessage: errorMessage(msgVerify.error),
      resetVerify: () => msgVerify.reset(),
    };
  }

  return {
    usingMsg91,
    send: (phone) => devSend.mutate(phone),
    verify: (input, opts) => devVerify.mutate(input, opts),
    sending: devSend.isPending,
    sent: devSend.isSuccess,
    sendError: devSend.isError,
    verifying: devVerify.isPending,
    verifyError: devVerify.isError,
    devCode: devSend.data?.devCode,
    resetVerify: () => devVerify.reset(),
  };
}

/** Finalize onboarding (username + profile). Updates the in-store session user on success. */
export function useCompleteOnboardingMutation() {
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (input: OnboardingInput) => {
      const res = await api.post<{ user: SessionUser }>("/users/onboarding", input);
      return res.data.user;
    },
    onSuccess: setUser,
  });
}
