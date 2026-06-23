import { useEffect } from "react";
import { X } from "lucide-react";
import { useUIStore } from "@/lib/store";

/**
 * Full-screen photo viewer for avatars/profile pictures. Mounted once globally; opened via
 * `useUIStore().openLightbox(src, name)`. The image src is already resolved (blob URL for authed
 * local avatars, or a public URL) by the time it reaches here.
 */
export function Lightbox() {
  const lightbox = useUIStore((s) => s.lightbox);
  const close = useUIStore((s) => s.closeLightbox);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, close]);

  if (!lightbox) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${lightbox.name}'s photo`}
      onClick={close}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in-up"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {/* Professional circular viewer (Sprint C.2): the photo fills a fixed circle (object-cover) with
          a soft ring, and the contact's name sits below — like WhatsApp/Telegram profile photos. */}
      <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={lightbox.src}
          alt={`${lightbox.name}'s photo`}
          className="h-[min(20rem,70vw)] w-[min(20rem,70vw)] rounded-full object-cover shadow-elevated ring-2 ring-white/15"
        />
        <p className="text-base font-semibold text-white">{lightbox.name}</p>
      </div>
    </div>
  );
}
