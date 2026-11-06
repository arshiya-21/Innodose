import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, authApi, tokenStore } from '@/api';
import { setUnauthorizedHandler } from '@/api/client';
import type { User } from '@/api/types';
import type { ActionKey, ControlMode, NavKey } from '@/api/administration';
import { canAccess, hasPermission, type Permission } from '@/lib/permissions';

interface AuthValue {
  user: User | null;
  /** true while the stored session is being checked on start-up */
  restoring: boolean;
  /** resolves to null on success, or an error message */
  signIn: (userId: string, password: string, staySignedIn: boolean) => Promise<string | null>;
  signOut: () => Promise<void>;
  can: (p: Permission) => boolean;
  /** page / control-mode access from the role's permission matrix */
  canNav: (nav: NavKey, action?: ActionKey, mode?: ControlMode) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(() => !!tokenStore.get());

  // Restore the session from a stored token. Only wipe the token on a real
  // auth failure (401) — a transient network error or a backend that is
  // briefly down must NOT sign the user out.
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi
      .me()
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) tokenStore.clear();
      })
      .finally(() => setRestoring(false));
  }, []);

  // Any 401 from the API signs the user out
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (userId: string, password: string, staySignedIn: boolean) => {
    try {
      const res = await authApi.login({ userId, password, staySignedIn });
      tokenStore.set(res.token, staySignedIn);
      setUser(res.user);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Sign-in failed. Try again.';
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* token may already be invalid */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, restoring, signIn, signOut, can: (p) => hasPermission(user?.role, p), canNav: (nav, action = 'view', mode) => canAccess(user?.permissions, user?.role, nav, action, mode) }),
    [user, restoring, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
