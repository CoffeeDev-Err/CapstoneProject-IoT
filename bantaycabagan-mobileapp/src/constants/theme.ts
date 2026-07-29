import { mobileTheme } from './mobileTheme';

// Backward-compatible semantic palette for the older shared components.
// New mobile UI should import mobileTheme directly.
export const COLORS = {
  background: mobileTheme.background,
  surface: mobileTheme.surface,
  textPrimary: mobileTheme.text,
  textSecondary: mobileTheme.textMuted,
  brand: mobileTheme.blue,
  brandDark: mobileTheme.navySoft,
  border: mobileTheme.border,
  online: mobileTheme.success,
  idle: mobileTheme.blue,
  offline: mobileTheme.offline,
  danger: mobileTheme.danger,
};
