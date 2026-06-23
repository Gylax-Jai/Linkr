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
  docked = false,
}: {
  onSelect: (emoji: string) => void;
  theme: "light" | "dark";
  /**
   * `docked` (mobile, WhatsApp-style): a full-width panel rendered BELOW the composer field so the
   * text box stays visible above it. Otherwise: a floating popover anchored above the emoji button.
   */
  docked?: boolean;
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

  const wrapperClass = docked
    ? "emoji-picker-docked w-full overflow-hidden rounded-xl border border-border shadow-elevated"
    : "absolute bottom-full left-0 z-40 mb-2 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl shadow-elevated";

  return (
    <div className={wrapperClass}>
      {data ? (
        <Suspense fallback={<PickerSkeleton docked={docked} />}>
          <Picker
            data={data}
            theme={theme}
            previewPosition="none"
            skinTonePosition="none"
            navPosition="top"
            // Docked (mobile): fill the panel width. Floating (desktop): a compact 7-per-line grid.
            // Either way the host height is capped in globals.css so the list scrolls.
            dynamicWidth={docked}
            perLine={docked ? 9 : 7}
            emojiButtonSize={docked ? 34 : 30}
            emojiSize={docked ? 24 : 20}
            onEmojiSelect={(emoji: EmojiSelectEvent) => {
              if (emoji.native) onSelect(emoji.native);
            }}
          />
        </Suspense>
      ) : (
        <PickerSkeleton docked={docked} />
      )}
    </div>
  );
}

function PickerSkeleton({ docked = false }: { docked?: boolean }) {
  return (
    <div
      className={`${docked ? "h-[16rem]" : "h-[18rem]"} w-full animate-pulse rounded-xl border border-border bg-surface`}
      aria-hidden="true"
    />
  );
}
