import { create } from 'zustand';
import type { User } from '@/services/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: user !== null }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
