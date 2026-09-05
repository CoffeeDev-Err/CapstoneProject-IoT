import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import LoginScreen from './src/LoginScreen';
import { mobileTheme } from './src/constants/mobileTheme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OperationalProvider } from './src/context/OperationalContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { ThemeProvider, useMobileTheme } from './src/context/ThemeContext';
import MainTabs from './src/navigation/MainTabs';
import { mobileFontFamily } from './src/constants/mobileTheme';
import { configureMapCache } from './src/services/mapCache';

const Stack = createNativeStackNavigator();

const applyDefaultFont = (Component: typeof Text | typeof TextInput) => {
  const target = Component as typeof Component & { defaultProps?: { style?: object } };
  const defaultProps = target.defaultProps || {};
  target.defaultProps = {
    ...defaultProps,
    style: [{ fontFamily: mobileFontFamily }, defaultProps.style],
  };
};

applyDefaultFont(Text);
applyDefaultFont(TextInput);

export default function App() {
  useEffect(() => {
    configureMapCache().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemedNavigation />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedNavigation() {
  const { isDark } = useMobileTheme();
  const navigationTheme = React.useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationLightTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: isDark ? '#050b18' : '#ffffff',
        card: isDark ? '#0b1528' : '#ffffff',
        border: isDark ? '#22314a' : mobileTheme.borderSoft,
      },
    };
  }, [isDark]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <AppNavigator />
    </NavigationContainer>
  );
}

function MainAppScreen() {
  return (
    <NotificationProvider>
      <OperationalProvider>
        <MainTabs />
      </OperationalProvider>
    </NotificationProvider>
  );
}

function AppNavigator() {
  const { loading, token, sessionError, retrySession } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={mobileTheme.blue} />
        <Text style={styles.loadingText}>Checking secure session...</Text>
      </View>
    );
  }

  if (sessionError) {
    return (
      <View style={styles.loading}>
        <Text accessibilityRole="alert" style={styles.sessionError}>{sessionError}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void retrySession()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <Stack.Screen name="Main" component={MainAppScreen} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  sessionError: { color: '#b91c1c', textAlign: 'center', paddingHorizontal: 24 },
  retryButton: { backgroundColor: mobileTheme.blue, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
  appRoot: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: mobileTheme.background,
  },
  loadingText: {
    color: mobileTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
