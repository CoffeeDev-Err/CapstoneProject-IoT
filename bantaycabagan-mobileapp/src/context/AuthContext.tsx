import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  type AuthSession,
  type AuthUser,
  getCurrentUser,
  logoutSession,
} from '../services/authApi';

const TOKEN_KEY = 'bantaycabagan_auth_token';

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  user: AuthUser | null;
  establishSession: (session: AuthSession) => Promise<void>;
  clearSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearSession = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const establishSession = useCallback(async (session: AuthSession) => {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
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
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!storedToken) return;
      try {
        const response = await getCurrentUser(storedToken);
        setToken(storedToken);
        setUser(response.user);
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    };

    restoreSession().finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    loading,
    token,
    user,
    establishSession,
    clearSession,
    logout,
  }), [clearSession, establishSession, loading, logout, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
};
