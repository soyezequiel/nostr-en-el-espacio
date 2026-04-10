import { create } from 'zustand';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { NostrProfile, parseProfile, LoginMethod, resetUserRelays } from '@/lib/nostr';

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
  user: NDKUser | null;
  profile: NostrProfile | null;
  loginMethod: LoginMethod | null;
  error: string | null;
  
  // Actions
  setUser: (user: NDKUser | null, method: LoginMethod | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

const LEGACY_AUTH_STORAGE_KEY = 'nostr-auth';

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // Ignore browsers where storage is unavailable.
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  isConnected: false,
  isLoading: false,
  user: null,
  profile: null,
  loginMethod: null,
  error: null,

  setUser: (user, method) => {
    if (user) {
      set({
        isConnected: true,
        user,
        profile: parseProfile(user),
        loginMethod: method,
        error: null,
      });
    } else {
      set({
        isConnected: false,
        user: null,
        profile: null,
        loginMethod: null,
        error: null,
      });
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, isLoading: false }),

  logout: () => {
    resetUserRelays();
    set({
      isConnected: false,
      isLoading: false,
      user: null,
      profile: null,
      loginMethod: null,
      error: null,
    });
  },
}));
