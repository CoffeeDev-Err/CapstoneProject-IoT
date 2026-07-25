import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL
  || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
