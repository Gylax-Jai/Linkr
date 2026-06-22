export type BubblePosition = "single" | "first" | "middle" | "last";

/** Determine iMessage-style grouping position within a consecutive run from the same sender. */
export function getBubblePosition<T extends { senderKey: string }>(
  messages: T[],
  index: number,
): BubblePosition {
  const curr = messages[index];
  if (!curr) return "single";

  const prev = messages[index - 1];
  const next = messages[index + 1];
  const samePrev = prev?.senderKey === curr.senderKey;
  const sameNext = next?.senderKey === curr.senderKey;

  if (!samePrev && !sameNext) return "single";
  if (!samePrev && sameNext) return "first";
  if (samePrev && sameNext) return "middle";
  return "last";
}

/** Corner radii for grouped message bubbles (sent = mine, received = theirs). */
export function bubbleRadiusClasses(position: BubblePosition, mine: boolean): string {
  if (mine) {
    switch (position) {
      case "single":
        return "rounded-2xl rounded-br-md";
      case "first":
        return "rounded-2xl rounded-br-sm";
      case "middle":
        return "rounded-l-2xl rounded-r-lg";
      case "last":
        return "rounded-2xl rounded-tr-sm";
    }
  }

  switch (position) {
    case "single":
      return "rounded-2xl rounded-bl-md";
    case "first":
      return "rounded-2xl rounded-bl-sm";
    case "middle":
      return "rounded-r-2xl rounded-l-lg";
    case "last":
      return "rounded-2xl rounded-tl-sm";
  }
}
