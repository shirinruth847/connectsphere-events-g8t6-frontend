"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, setUnauthorizedHandler } from "@/lib/api/client";
import { fetchCurrentUser, revokeCurrentSession } from "@/lib/api/auth";
import type { AuthenticatedUser } from "@/lib/api/types";
import { getAccessToken, getSupabase, signInWithPassword, signOutLocally, type SignInFailure } from "./session";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AuthState = {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  errorMessage: string | null;
  // Why the session ended: an explicit logout skips next= on the way to /login.
  endedBy: "logout" | "expired" | null;
};

export type SignInResult = { ok: true } | { ok: false; failure: SignInFailure };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const signedOut = (endedBy: AuthState["endedBy"]): AuthState => ({
  status: "unauthenticated",
  user: null,
  errorMessage: null,
  endedBy,
});

const failureFor = (error: unknown): SignInFailure => {
  if (error instanceof ApiError && error.status === 401) return "INVALID_CREDENTIALS";
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") return "NETWORK_ERROR";
  return "UNKNOWN";
};

// The browser's stored session alone is not proof of authentication:
// GET /api/auth/me decides, and a 401 clears the stale local session.
async function checkSession(): Promise<AuthState> {
  try {
    const token = await getAccessToken();
    if (!token) return signedOut(null);
    const user = await fetchCurrentUser({ silentUnauthorized: true });
    return { status: "authenticated", user, errorMessage: null, endedBy: null };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await signOutLocally();
      return signedOut("expired");
    }
    const errorMessage =
      error instanceof ApiError ? error.message : "We couldn't check your session. Please try again.";
    return { status: "error", user: null, errorMessage, endedBy: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, errorMessage: null, endedBy: null });
  const signingOut = useRef(false);

  const verifySession = useCallback(() => {
    void checkSession().then(setState);
  }, []);

  useEffect(() => {
    verifySession();

    let unsubscribe = () => {};
    try {
      // Another tab signing out, or a failed token refresh, ends this session too.
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && !signingOut.current) {
          setState((previous) => (previous.status === "unauthenticated" ? previous : signedOut("expired")));
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Missing configuration is already reported by verifySession.
    }

    setUnauthorizedHandler(() => {
      void signOutLocally();
      setState(signedOut("expired"));
    });

    // A page restored from the back/forward cache re-checks with the backend.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) verifySession();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      unsubscribe();
      setUnauthorizedHandler(null);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [verifySession]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    let result: Awaited<ReturnType<typeof signInWithPassword>>;
    try {
      result = await signInWithPassword(email, password);
    } catch {
      return { ok: false, failure: "UNKNOWN" };
    }
    if ("failure" in result) return { ok: false, failure: result.failure };

    // Role and home_path come from the backend, never from the form or token.
    try {
      const user = await fetchCurrentUser({ accessToken: result.accessToken, silentUnauthorized: true });
      setState({ status: "authenticated", user, errorMessage: null, endedBy: null });
      return { ok: true };
    } catch (error) {
      // No active ConnectSphere profile (401) reads the same as bad credentials.
      await signOutLocally();
      return { ok: false, failure: failureFor(error) };
    }
  }, []);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      const token = await getAccessToken().catch(() => null);
      if (token) {
        try {
          await revokeCurrentSession(token);
        } catch {
          // Local sign-out still proceeds; Supabase also revokes this refresh token.
        }
      }
      await signOutLocally();
      setState(signedOut("logout"));
    } finally {
      signingOut.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading", user: null, errorMessage: null, endedBy: null });
    verifySession();
  }, [verifySession]);

  const value = useMemo(() => ({ ...state, signIn, signOut, retry }), [state, signIn, signOut, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
