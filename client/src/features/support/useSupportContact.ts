import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export { SUPPORT_MESSAGE_MAX, SUPPORT_MESSAGE_MIN } from "@linkr/shared";

/** Submit a support query (stored in MongoDB for manual review). */
export function useSupportContactMutation() {
  return useMutation({
    mutationFn: async (message: string) => {
      await api.post("/support/contact", { message });
    },
  });
}
