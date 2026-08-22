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
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { mobileTheme } from '../constants/mobileTheme';
import { mobileDarkSemanticColors } from '../constants/semanticColors';

const STORAGE_KEY = 'bantaycabagan-mobile-theme';
const THEME_REVEAL_DURATION = 460;
const THEME_SETTLE_DURATION = 140;
const THEME_REVEAL_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const darkTheme = {
  ...mobileTheme,
  ...mobileDarkSemanticColors,
  background: '#050b18',
  surface: '#0b1528',
  surfaceMuted: '#0e1a30',
  border: '#2a3a56',
  borderSoft: '#22314a',
  text: '#f8fafc',
  textMuted: '#9eabc0',
  blueSoft: '#132442',
  purpleSoft: '#132442',
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
  const { height, width } = useWindowDimensions();
  const [isDark, setIsDark] = useState(false);
  const [revealTargetDark, setRevealTargetDark] = useState(false);
  const revealScale = useSharedValue(0.001);
  const revealOpacity = useSharedValue(0);
  const transitionRunningRef = useRef(false);
  const revealDiameter = Math.ceil(Math.hypot(width, height)) + 8;

  const revealAnimatedStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scale: revealScale.value }],
  }));

  useEffect(() => {
    readStoredTheme()
      .then((value) => setIsDark(value === 'dark'))
      .catch(() => undefined);
  }, []);

  const finishTransition = useCallback(() => {
    transitionRunningRef.current = false;
    revealScale.value = 0.001;
  }, [revealScale]);

  const applyRevealedTheme = useCallback((nextDark: boolean) => {
    setIsDark(nextDark);
    storeTheme(nextDark ? 'dark' : 'light').catch(() => undefined);

    requestAnimationFrame(() => {
      revealOpacity.value = withTiming(0, {
        duration: THEME_SETTLE_DURATION,
        easing: Easing.out(Easing.quad),
      }, (finished) => {
        if (finished) runOnJS(finishTransition)();
      });
    });
  }, [finishTransition, revealOpacity]);

  const toggleTheme = useCallback(() => {
    if (transitionRunningRef.current) return;
    transitionRunningRef.current = true;

    const nextDark = !isDark;
    setRevealTargetDark(nextDark);
    cancelAnimation(revealScale);
    cancelAnimation(revealOpacity);
    revealScale.value = 0.001;
    revealOpacity.value = 1;

    requestAnimationFrame(() => {
      revealScale.value = withTiming(1, {
        duration: THEME_REVEAL_DURATION,
        easing: THEME_REVEAL_EASING,
      }, (finished) => {
        if (finished) runOnJS(applyRevealedTheme)(nextDark);
        else runOnJS(finishTransition)();
      });
    });
  }, [applyRevealedTheme, finishTransition, isDark, revealOpacity, revealScale]);

  const value = useMemo(() => ({
    colors: isDark ? darkTheme : mobileTheme,
    isDark,
    toggleTheme,
  }), [isDark, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={styles.themeRoot}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.themeReveal,
            {
              width: revealDiameter,
              height: revealDiameter,
              left: (width - revealDiameter) / 2,
              top: (height - revealDiameter) / 2,
              borderRadius: revealDiameter / 2,
              backgroundColor: revealTargetDark ? darkTheme.background : mobileTheme.background,
            },
            revealAnimatedStyle,
          ]}
        />
      </View>
    </ThemeContext.Provider>
  );
}

export function useMobileTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useMobileTheme must be used inside ThemeProvider.');
  return value;
}

const styles = StyleSheet.create({
  themeRoot: { flex: 1 },
  themeReveal: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 9999,
  },
});
