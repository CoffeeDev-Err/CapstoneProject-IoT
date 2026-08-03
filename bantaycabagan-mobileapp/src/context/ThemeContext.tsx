import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { mobileTheme } from '../constants/mobileTheme';

const STORAGE_KEY = 'bantaycabagan-mobile-theme';

const darkTheme = {
  ...mobileTheme,
  background: '#050b18',
  surface: '#0b1528',
  surfaceMuted: '#0e1a30',
  border: '#2a3a56',
  borderSoft: '#22314a',
  text: '#f8fafc',
  textMuted: '#9eabc0',
  blueSoft: '#132442',
  purpleSoft: '#132442',
  successSoft: '#0b3024',
  warningSoft: '#38270d',
  dangerSoft: '#3a151d',
  offline: '#64748b',
};

type ThemeContextValue = {
  colors: typeof mobileTheme;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredTheme = async () => {
  if (Platform.OS === 'web') return window.localStorage.getItem(STORAGE_KEY);
  return SecureStore.getItemAsync(STORAGE_KEY);
};

const storeTheme = async (value: 'dark' | 'light') => {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    readStoredTheme()
      .then((value) => setIsDark(value === 'dark'))
      .catch(() => undefined);
  }, []);

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;
      storeTheme(next ? 'dark' : 'light').catch(() => undefined);
      return next;
    });
  };

  const value = useMemo(() => ({
    colors: isDark ? darkTheme : mobileTheme,
    isDark,
    toggleTheme,
  }), [isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useMobileTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useMobileTheme must be used inside ThemeProvider.');
  return value;
}
