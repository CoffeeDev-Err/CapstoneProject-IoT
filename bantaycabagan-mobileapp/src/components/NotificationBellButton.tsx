import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../constants/mobileTheme';
import { useNotifications } from '../context/NotificationContext';
import { useMobileTheme } from '../context/ThemeContext';

export function NotificationBellButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useNotifications();
  const { colors } = useMobileTheme();

  return (
    <TouchableOpacity
      accessibilityLabel={unreadCount > 0
        ? `Open notifications, ${unreadCount} unread`
        : 'Open notifications'}
      activeOpacity={0.72}
      style={styles.button}
      onPress={onPress}
    >
      <Icon name="notifications-none" size={23} color={colors.text} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 9,
    backgroundColor: mobileTheme.danger,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
});
