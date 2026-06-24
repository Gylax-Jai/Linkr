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
  /**
   * Full-screen photo viewer. `null` when closed. `variant` selects the layout: "avatar" is the
   * circular profile-photo viewer; "chat" is a full-frame image viewer for shared chat images
   * (rectangular, with an optional download action) — Sprint 3.2.2.
   */
  lightbox: { src: string; name: string; variant: "avatar" | "chat" } | null;
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
  openLightbox: (src: string, name: string, variant?: "avatar" | "chat") => void;
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
  openLightbox: (src, name, variant = "avatar") => set({ lightbox: { src, name, variant } }),
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
