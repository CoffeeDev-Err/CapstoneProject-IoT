import 'react-native-gesture-handler';
import React from 'react';
import { Text, TextInput } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './src/LoginScreen';
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
      <OperationalProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      </OperationalProvider>
    </SafeAreaProvider>
  );
}
