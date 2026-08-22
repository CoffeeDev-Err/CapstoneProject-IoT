import { Platform } from 'react-native';
import { mobileSemanticColors } from './semanticColors';

export const mobileFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: '"Segoe UI", Arial, sans-serif',
  default: 'sans-serif',
});

export const mobileTheme = {
  ...mobileSemanticColors,
  navy: '#0f172a',
  navySoft: '#1e3a5f',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  // Compatibility aliases while older screens move to semantic tokens.
  purple: '#2563eb',
  purpleSoft: '#eff6ff',
  background: '#f4f7fb',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#d7e0eb',
  borderSoft: '#e5ebf2',
  text: '#0f172a',
  textMuted: '#64748b',
  offline: '#94a3b8',
  focus: '#2563eb',
};

export const mobileSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const mobileRadius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  round: 999,
};

export const mobileControl = {
  height: 46,
  iconButtonSize: 44,
  minimumTouchTarget: 44,
};

export const mobileTypography = {
  pageTitle: 26,
  sectionTitle: 18,
  body: 14,
  supporting: 12,
  label: 11,
};
