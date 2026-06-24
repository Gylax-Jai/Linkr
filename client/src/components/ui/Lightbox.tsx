import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { useUIStore } from "@/lib/store";

/**
 * Full-screen photo viewer. Mounted once globally; opened via `useUIStore().openLightbox(src, name,
 * variant)`. The image src is already resolved (blob URL for authed local images, or a public URL)
 * by the time it reaches here. `variant` is "avatar" (circular profile photo) or "chat" (full-frame
 * shared image with a download action) — Sprint 3.2.2.
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

  const isChat = lightbox.variant === "chat";

  const download = () => {
    const a = document.createElement("a");
    a.href = lightbox.src;
    a.download = lightbox.name || "image";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isChat ? lightbox.name || "Image" : `${lightbox.name}'s photo`}
      onClick={close}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in-up"
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {isChat ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              download();
            }}
            aria-label="Download image"
            title="Download"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <Download className="h-5 w-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isChat ? (
        // Full-frame viewer for shared chat images: the image fits the screen (object-contain) so it
        // opens inside LINKr instead of a new browser tab.
        <img
          src={lightbox.src}
          alt={lightbox.name || "Shared image"}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-elevated"
        />
      ) : (
        /* Professional circular viewer (Sprint C.2): the photo fills a fixed circle (object-cover) with
           a soft ring, and the contact's name sits below — like WhatsApp/Telegram profile photos. */
        <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <img
            src={lightbox.src}
            alt={`${lightbox.name}'s photo`}
            className="h-[min(20rem,70vw)] w-[min(20rem,70vw)] rounded-full object-cover shadow-elevated ring-2 ring-white/15"
          />
          <p className="text-base font-semibold text-white">{lightbox.name}</p>
        </div>
      )}
    </div>
  );
}
