import { useEffect } from "react";

/**
 * Mobile soft-keyboard fix (Sprint I). On Android Chrome the on-screen keyboard often does NOT shrink
 * the layout viewport — it overlays the bottom and scrolls the *document* to reveal the focused input,
 * which pushes the fixed chat header off-screen (leaving a black gap). We can't rely on `100dvh` for
 * that case, so we track the **visual viewport** (the part actually visible above the keyboard) and
 * expose its height as the `--app-vh` CSS variable that `#root` consumes.
 *
 * Effect: when the keyboard opens, `--app-vh` shrinks to the visible height, the flex column re-lays
 * out (header pinned, message list shrinks, composer rides just above the keyboard), and we reset any
 * stray document scroll so the header can't drift away. Cleans up on unmount. No-op where
 * `window.visualViewport` is unsupported (older desktops fall back to the CSS `100dvh` default).
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.getElementById("root");

    const apply = () => {
      // Height of the area visible above the keyboard.
      document.documentElement.style.setProperty("--app-vh", `${vv.height}px`);
      if (root) {
        // Keep #root aligned with the visible region even if the page tried to scroll under the keyboard.
        root.style.transform = vv.offsetTop > 0 ? `translateY(${vv.offsetTop}px)` : "";
      }
      // Undo any document scroll the browser applied to focus the input; our own panes scroll instead.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.removeProperty("--app-vh");
      if (root) root.style.transform = "";
    };
  }, []);
}
