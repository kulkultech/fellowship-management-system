import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const THEME_KEY = 'kulkul_theme';

export const useUiStore = create<UiState>((set) => ({
  theme: (localStorage.getItem(THEME_KEY) as Theme) || 'dark',
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
}));
