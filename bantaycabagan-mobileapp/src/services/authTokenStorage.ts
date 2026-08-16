import * as SecureStore from 'expo-secure-store';

export const getStoredAuthToken = (key: string) => SecureStore.getItemAsync(key);
export const setStoredAuthToken = (key: string, token: string) => SecureStore.setItemAsync(key, token);
export const deleteStoredAuthToken = (key: string) => SecureStore.deleteItemAsync(key);
