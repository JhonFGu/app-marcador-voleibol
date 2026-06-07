import { create } from 'zustand';
import { supabase } from '../supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  checkUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  isLoading: true,

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      isLoading: false,
    });
  },

  checkUser: async () => {
    set({ isLoading: true });
    try {
      // Race session check with a 5 second timeout to prevent hanging on expired refresh tokens
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((_, reject) => 
        setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
      );

      const res = await Promise.race([sessionPromise, timeoutPromise]);
      const session = res?.data?.session ?? null;

      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
      });
    } catch (e) {
      console.error('Error checking auth session:', e);
      set({ user: null, session: null, isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Clear state locally first to update UI instantly
      set({ user: null, session: null, isLoading: false });
      // Call signOut in the background
      supabase.auth.signOut().catch((e) => {
        console.error('Error in background signOut:', e);
      });
    } catch (e) {
      console.error('Error logging out:', e);
      set({ isLoading: false });
    }
  },
}));
