import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AuthSession,
  type AuthUser,
  AuthApiError,
  getCurrentUser,
  logoutSession,
} from '../services/authApi';
import {
  deleteStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from '../services/authTokenStorage';

const TOKEN_KEY = 'bantaycabagan_auth_token';

type AuthContextValue = {
  loading: boolean;
  sessionError: string;
  retrySession: () => Promise<void>;
  token: string | null;
  user: AuthUser | null;
  establishSession: (session: AuthSession) => Promise<void>;
  applyIdentityUpdate: (identity: AuthIdentityUpdate) => void;
  clearSession: () => Promise<void>;
  logout: () => Promise<void>;
};

export type AuthIdentityUpdate = {
  personnelId?: string;
  name?: string;
  badgeNumber?: string;
  rank?: string;
  mobileNumber?: string;
  photoUrl?: string;
  loginId?: string;
  officialEmail?: string;
  emailVerified?: boolean;
  accountStatus?: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionError, setSessionError] = useState('');
  const sessionAttempt = useRef(0);

  const clearSession = useCallback(async () => {
    sessionAttempt.current += 1;
    setSessionError('');
    await deleteStoredAuthToken(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const establishSession = useCallback(async (session: AuthSession) => {
    sessionAttempt.current += 1;
    setSessionError('');
    await setStoredAuthToken(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  }, []);

  const applyIdentityUpdate = useCallback((identity: AuthIdentityUpdate) => {
    setUser((current) => {
      if (!current || !identity.personnelId || current.personnelId !== identity.personnelId) {
        return current;
      }
      return {
        ...current,
        username: identity.loginId ?? current.username,
        email: identity.officialEmail ?? current.email,
        emailVerified: identity.emailVerified ?? current.emailVerified,
        profile: current.profile ? {
          ...current.profile,
          fullName: identity.name ?? current.profile.fullName,
          badgeNumber: identity.badgeNumber ?? current.profile.badgeNumber,
          rank: identity.rank ?? current.profile.rank,
          mobileNumber: identity.mobileNumber ?? current.profile.mobileNumber,
          photoUrl: identity.photoUrl ?? current.profile.photoUrl,
        } : current.profile,
      };
    });
  }, []);

  const logout = useCallback(async () => {
    const activeToken = token;
    await clearSession();
    if (activeToken) {
      await logoutSession(activeToken).catch(() => undefined);
    }
  }, [clearSession, token]);

  const retrySession = useCallback(async () => {
    const attempt = ++sessionAttempt.current;
    setLoading(true);
    setSessionError('');
    try {
      const storedToken = await getStoredAuthToken(TOKEN_KEY);
      if (!storedToken || attempt !== sessionAttempt.current) return;
      const response = await getCurrentUser(storedToken);
      if (attempt !== sessionAttempt.current) return;
      if (!response.user?.id) throw new AuthApiError('Invalid session response.', 502);
      setToken(storedToken);
      setUser(response.user);
    } catch (error) {
      if (attempt !== sessionAttempt.current) return;
      if (error instanceof AuthApiError && [401, 403].includes(error.status)) {
        try {
          await deleteStoredAuthToken(TOKEN_KEY);
        } catch {
          setSessionError('Cannot clear the expired saved session. Please tap Retry.');
        }
        setToken(null);
        setUser(null);
      } else {
        // Keep the stored token but do not grant access without verification.
        setSessionError('Cannot verify your saved session. Check your connection and tap Retry. Your saved login has not been removed.');
      }
    } finally {
      if (attempt === sessionAttempt.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void retrySession();
    return () => { sessionAttempt.current += 1; };
  }, [retrySession]);

  const value = useMemo(() => ({
    applyIdentityUpdate,
    loading,
    sessionError,
    retrySession,
    token,
    user,
    establishSession,
    clearSession,
    logout,
  }), [applyIdentityUpdate, clearSession, establishSession, loading, logout, retrySession, sessionError, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
};
