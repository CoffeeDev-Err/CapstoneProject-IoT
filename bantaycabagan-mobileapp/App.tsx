import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './src/LoginScreen';
import { mobileTheme } from './src/constants/mobileTheme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OperationalProvider } from './src/context/OperationalContext';
import MainTabs from './src/navigation/MainTabs';
import { mobileFontFamily } from './src/constants/mobileTheme';

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
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppNavigator() {
  const { loading, token } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={mobileTheme.blue} />
        <Text style={styles.loadingText}>Checking secure session...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <Stack.Screen name="Main">
          {() => (
            <OperationalProvider>
              <MainTabs />
            </OperationalProvider>
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
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
