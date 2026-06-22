import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeName } from '@linkr/shared';

export type ColorMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeName;
  colorMode: ColorMode;
  setTheme: (theme: ThemeName) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'iris',
      colorMode: 'light',
      setTheme: (theme) => set({ theme }),
      setColorMode: (colorMode) => set({ colorMode }),
      toggleColorMode: () =>
        set({ colorMode: get().colorMode === 'light' ? 'dark' : 'light' }),
    }),
    { name: 'linkr-theme' }
  )
);
