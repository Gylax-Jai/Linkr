/**
 * Placeholder conversation data for Sprint 0 (no backend yet — blueprint §15).
 * Centralised here so the chat list, conversation pane and details pane stay in sync
 * and the UI reads as an intentional product rather than leftover scaffolding.
 */

export interface PlaceholderMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface PlaceholderChat {
  id: string;
  name: string;
  handle: string;
  preview: string;
  time: string;
  unread?: number;
  online?: boolean;
  bio: string;
  /** Human-friendly day label for the conversation's date separator. */
  day: string;
  messages: PlaceholderMessage[];
}

export const PLACEHOLDER_CHATS: PlaceholderChat[] = [
  {
    id: "1",
    name: "Aria Linkr",
    handle: "@aria",
    preview: "Welcome to Linkr 👋",
    time: "now",
    unread: 2,
    online: true,
    bio: "Product designer. Building a calmer, more private way to talk.",
    day: "Today",
    messages: [
      { id: "m1", from: "them", text: "Welcome to Linkr 👋 This is a placeholder conversation.", time: "9:41 AM" },
      { id: "m2", from: "them", text: "Every message here is end-to-end encrypted by default.", time: "9:41 AM" },
      { id: "m3", from: "me", text: "Looks great — and the themes switch instantly!", time: "9:42 AM" },
      { id: "m4", from: "me", text: "Can't wait for real messaging in Sprint 1.", time: "9:42 AM" },
    ],
  },
  {
    id: "2",
    name: "Design Team",
    handle: "@design",
    preview: "The new bubbles look so clean",
    time: "2m",
    online: true,
    bio: "Where the Linkr design system comes together.",
    day: "Today",
    messages: [
      { id: "m1", from: "them", text: "Themes look great across light and dark.", time: "11:02 AM" },
      { id: "m2", from: "me", text: "Agreed — the gradient send button is a nice touch.", time: "11:03 AM" },
      { id: "m3", from: "them", text: "The new bubbles look so clean ✨", time: "11:05 AM" },
    ],
  },
  {
    id: "3",
    name: "Kai",
    handle: "@kai",
    preview: "Friend request accepted",
    time: "1h",
    bio: "Privacy nerd. Strangers can find me, only friends can ping me.",
    day: "Today",
    messages: [
      { id: "m1", from: "them", text: "Friend request accepted 🎉", time: "8:15 AM" },
      { id: "m2", from: "me", text: "Now we can actually talk — friends only, as it should be.", time: "8:16 AM" },
    ],
  },
];

export function getChatById(id: string | null): PlaceholderChat | undefined {
  if (!id) return undefined;
  return PLACEHOLDER_CHATS.find((chat) => chat.id === id);
}
