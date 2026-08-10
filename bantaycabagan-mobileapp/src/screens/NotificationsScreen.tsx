import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../constants/mobileTheme';
import { useNotifications } from '../context/NotificationContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { OfficerNotification } from '../types/notifications';

const iconFor = (notification: OfficerNotification): keyof typeof Icon.glyphMap => {
  if (notification.type === 'emergency') return 'campaign';
  if (notification.type === 'geofence') return 'location-off';
  if (notification.referenceType === 'deployment') return 'event';
  if (notification.referenceType === 'task') return 'assignment';
  if (notification.referenceType === 'report') return 'description';
  if (notification.type === 'success') return 'check-circle';
  return 'notifications';
};

const colorFor = (notification: OfficerNotification) => {
  if (notification.priority === 'critical') return mobileTheme.danger;
  if (notification.priority === 'high') return mobileTheme.warning;
  if (notification.type === 'success') return mobileTheme.success;
  return mobileTheme.blue;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function NotificationsScreen({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useMobileTheme();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAllRead,
    openNotification,
  } = useNotifications();

  const handleOpen = (notification: OfficerNotification) => {
    openNotification(notification);
    onClose();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {unreadCount > 0 ? `${unreadCount} unread officer alert${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.readAllButton} onPress={() => markAllRead().catch(() => undefined)}>
            <Text style={styles.readAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityLabel="Close notifications"
          style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
          onPress={onClose}
        >
          <Icon name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const accent = colorFor(item);
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                styles.notificationCard,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                !item.isRead && { borderLeftColor: accent, borderLeftWidth: 3 },
              ]}
              onPress={() => handleOpen(item)}
            >
              <View style={[styles.iconShell, { backgroundColor: isDark ? '#132442' : mobileTheme.blueSoft }]}>
                <Icon name={iconFor(item)} size={20} color={accent} />
              </View>
              <View style={styles.notificationCopy}>
                <View style={styles.notificationTopRow}>
                  <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: accent }]} />}
                </View>
                <Text style={[styles.notificationMessage, { color: colors.textMuted }]}>{item.message}</Text>
                <Text style={[styles.notificationTime, { color: colors.textMuted }]}>{formatTimestamp(item.timestamp)}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            {isLoading ? (
              <ActivityIndicator size="small" color={mobileTheme.blue} />
            ) : (
              <Icon name="notifications-none" size={38} color={colors.textMuted} />
            )}
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {isLoading ? 'Loading notifications...' : 'No notifications yet'}
            </Text>
            {!isLoading && (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Deployment, backup, shift, report, and boundary alerts will appear here.
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1 },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { marginTop: 3, fontSize: 11 },
  readAllButton: { minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' },
  readAllText: { color: mobileTheme.blue, fontSize: 11, fontWeight: '800' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 10, flexGrow: 1 },
  notificationCard: { minHeight: 90, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 8 },
  iconShell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  notificationCopy: { flex: 1 },
  notificationTopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  notificationTitle: { flex: 1, fontSize: 13, fontWeight: '800' },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  notificationMessage: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  notificationTime: { marginTop: 6, fontSize: 9, fontWeight: '700' },
  emptyState: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '800' },
  emptyText: { marginTop: 5, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
