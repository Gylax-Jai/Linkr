import { create } from "zustand";

/**
 * Global UI state (Zustand). Layout/navigation plus ephemeral realtime UI (typing, presence overrides).
 */
interface UIState {
  activeChatId: string | null;
  detailsOpen: boolean;
  /**
   * Mobile-only: whether the slide-up details sheet is open. Kept separate from `detailsOpen`
   * (which defaults to `true` for the desktop aside) so the sheet is never open-by-default on
   * mobile and only ever appears as the result of an explicit user action.
   */
  mobileDetailsOpen: boolean;
  friendSearchOpen: boolean;
  /** Which list the left sidebar shows: conversations ("chats") or the friends directory ("friends"). */
  sidebarView: "chats" | "friends";
  /** Full-screen avatar/photo viewer. `null` when closed. */
  lightbox: { src: string; name: string } | null;
  typingByChat: Record<string, boolean>;
  onlineOverrides: Record<string, boolean>;
  setActiveChat: (id: string | null) => void;
  toggleDetails: () => void;
  setDetailsOpen: (open: boolean) => void;
  openMobileDetails: () => void;
  closeMobileDetails: () => void;
  openFriendSearch: () => void;
  closeFriendSearch: () => void;
  setSidebarView: (view: "chats" | "friends") => void;
  openLightbox: (src: string, name: string) => void;
  closeLightbox: () => void;
  setTyping: (chatId: string, typing: boolean) => void;
  setParticipantOnline: (userId: string, online: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeChatId: null,
  detailsOpen: true,
  mobileDetailsOpen: false,
  friendSearchOpen: false,
  sidebarView: "chats",
  lightbox: null,
  typingByChat: {},
  onlineOverrides: {},
  // Switching/closing the active chat always dismisses the mobile sheet so it can't auto-pop open
  // when the next chat loads. Opening a chat also returns the sidebar to the Chats list so the new
  // conversation is visible (you don't stay stranded on the Friends directory).
  setActiveChat: (id) =>
    set({ activeChatId: id, mobileDetailsOpen: false, ...(id ? { sidebarView: "chats" as const } : {}) }),
  toggleDetails: () => set((state) => ({ detailsOpen: !state.detailsOpen })),
  setDetailsOpen: (open) => set({ detailsOpen: open }),
  openMobileDetails: () => set({ mobileDetailsOpen: true }),
  closeMobileDetails: () => set({ mobileDetailsOpen: false }),
  openFriendSearch: () => set({ friendSearchOpen: true }),
  closeFriendSearch: () => set({ friendSearchOpen: false }),
  setSidebarView: (view) => set({ sidebarView: view }),
  openLightbox: (src, name) => set({ lightbox: { src, name } }),
  closeLightbox: () => set({ lightbox: null }),
  setTyping: (chatId, typing) =>
    set((state) => ({
      typingByChat: { ...state.typingByChat, [chatId]: typing },
    })),
  setParticipantOnline: (userId, online) =>
    set((state) => ({
      onlineOverrides: { ...state.onlineOverrides, [userId]: online },
    })),
}));
