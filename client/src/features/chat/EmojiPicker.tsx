import { lazy, Suspense, useEffect, useState } from "react";

// Lazy-load the picker (and its emoji dataset) so it never bloats the initial bundle — it only
// downloads when the user first opens the emoji popover.
const Picker = lazy(() => import("@emoji-mart/react"));

/** Shape of the object emoji-mart passes to onEmojiSelect (only `native` is needed here). */
interface EmojiSelectEvent {
  native?: string;
}

/**
 * Emoji picker popover body. Outside-click / Escape closing is owned by the parent composer (so the
 * toggle button and popover share one boundary); this component only loads the data + renders.
 */
export function EmojiPickerPopover({
  onSelect,
  theme,
}: {
  onSelect: (emoji: string) => void;
  theme: "light" | "dark";
}) {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    void import("@emoji-mart/data").then((mod) => {
      if (active) setData((mod as { default: unknown }).default);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl shadow-elevated">
      {data ? (
        <Suspense fallback={<PickerSkeleton />}>
          <Picker
            data={data}
            theme={theme}
            previewPosition="none"
            skinTonePosition="none"
            navPosition="top"
            // Fixed grid (8 per line) keeps a tidy rectangle instead of a full-width stretched strip
            // on mobile; the picker fits inside the responsive container above.
            perLine={8}
            emojiButtonSize={34}
            emojiSize={22}
            onEmojiSelect={(emoji: EmojiSelectEvent) => {
              if (emoji.native) onSelect(emoji.native);
            }}
          />
        </Suspense>
      ) : (
        <PickerSkeleton />
      )}
    </div>
  );
}

function PickerSkeleton() {
  return (
    <div
      className="h-[22rem] w-full animate-pulse rounded-xl border border-border bg-surface"
      aria-hidden="true"
    />
  );
}
