import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type AuthSession,
  type AuthUser,
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

  const clearSession = useCallback(async () => {
    await deleteStoredAuthToken(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const establishSession = useCallback(async (session: AuthSession) => {
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

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = await getStoredAuthToken(TOKEN_KEY);
      if (!storedToken) return;
      try {
        const response = await getCurrentUser(storedToken);
        setToken(storedToken);
        setUser(response.user);
      } catch {
        await deleteStoredAuthToken(TOKEN_KEY);
      }
    };

    restoreSession().finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    applyIdentityUpdate,
    loading,
    token,
    user,
    establishSession,
    clearSession,
    logout,
  }), [applyIdentityUpdate, clearSession, establishSession, loading, logout, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
};
