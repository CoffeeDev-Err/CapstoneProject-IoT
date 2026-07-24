import { Platform } from 'react-native';

export const mobileFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: '"Segoe UI", Inter, Arial, sans-serif',
  default: 'sans-serif',
});

export const mobileTheme = {
  navy: '#1c1c4d',
  navySoft: '#2d2da8',
  blue: '#2d2da8',
  blueSoft: '#ebe9ff',
  purple: '#6b28f1',
  purpleSoft: '#f1ebff',
  background: '#f2f3f7',
  surface: '#ffffff',
  border: '#dddfe8',
  text: '#17172f',
  textMuted: '#686982',
  success: '#16883f',
  successSoft: '#dcfce7',
  warning: '#9a6100',
  warningSoft: '#fef3c7',
  danger: '#ff4d4d',
  dangerSoft: '#fee8e8',
};
