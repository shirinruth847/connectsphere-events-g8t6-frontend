"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type AuthSession = { access_token: string } | null;

interface AuthContextValue {
  session: AuthSession;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Single source of truth for authentication.
 *
 * Reads the Supabase session exactly once (getSession) and keeps it in sync
 * via onAuthStateChange. Every page that gates on auth consumes useAuth()
 * instead of calling getSession() directly, so redirect decisions always agree
 * and never fire while auth state is still loading.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    const initialize = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) throw error;
        setSession(
          data.session?.access_token
            ? { access_token: data.session.access_token }
            : null,
        );
      } catch {
        setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(
        nextSession?.access_token
          ? { access_token: nextSession.access_token }
          : null,
      );
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
