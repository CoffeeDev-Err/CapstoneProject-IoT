import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

import { mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';

type Props = {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
};

export function OfflineDataNotice({
  message,
  onRetry,
  retrying = false,
  title = 'Offline mode',
}: Props) {
  const { isDark } = useMobileTheme();
  return (
    <View accessibilityRole="alert" style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.icon, isDark && styles.iconDark]}>
        <Icon name="cloud-off" size={18} color={isDark ? '#fbbf24' : '#b45309'} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
        <Text style={[styles.message, isDark && styles.messageDark]}>{message}</Text>
      </View>
      {onRetry ? (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={retrying}
          onPress={onRetry}
          style={[styles.retry, isDark && styles.retryDark]}
        >
          {retrying
            ? <ActivityIndicator size="small" color={mobileTheme.blue} />
            : <Icon name="refresh" size={18} color={mobileTheme.blue} />}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#f6c56f',
    borderRadius: 10,
    backgroundColor: '#fff8e8',
  },
  containerDark: { borderColor: '#5f481d', backgroundColor: '#241d10' },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ffedbd' },
  iconDark: { backgroundColor: '#3b2d12' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#7c2d12', fontSize: 12, fontWeight: '800' },
  titleDark: { color: '#fcd34d' },
  message: { marginTop: 2, color: '#92400e', fontSize: 11, lineHeight: 16 },
  messageDark: { color: '#d8c28d' },
  retry: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ffffff' },
  retryDark: { backgroundColor: '#0e1a30' },
});

