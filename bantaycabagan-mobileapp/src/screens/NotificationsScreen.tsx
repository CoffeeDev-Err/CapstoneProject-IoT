import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { SheetFlatList } from '../components/SwipeDismissSheet';

const iconFor = (notification: OfficerNotification): keyof typeof Icon.glyphMap => {
  if (notification.type === 'emergency') return 'campaign';
  if (notification.type === 'geofence') return 'location-off';
  if (notification.referenceType === 'deployment') return 'event';
  if (notification.referenceType === 'task') return 'assignment';
  if (notification.referenceType === 'report') return 'description';
  if (notification.type === 'success') return 'check-circle';
  return 'notifications';
};

const colorFor = (notification: OfficerNotification, colors: typeof mobileTheme) => {
  if (notification.priority === 'critical') return colors.priorityCritical;
  if (notification.priority === 'high') return colors.priorityHigh;
  if (notification.priority === 'low') return colors.priorityLow;
  if (notification.type === 'success') return colors.success;
  if (notification.type === 'geofence' || notification.type === 'warning') return colors.warning;
  return colors.info;
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

type NotificationRow =
  | { kind: 'heading'; id: string; label: string }
  | { kind: 'notification'; id: string; notification: OfficerNotification };

const startOfDay = (date: Date) => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
);

const dateHeading = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const dayDifference = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return date.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const groupNotifications = (notifications: OfficerNotification[]): NotificationRow[] => {
  const rows: NotificationRow[] = [];
  let previousHeading = '';
  notifications.forEach((notification) => {
    const heading = dateHeading(notification.timestamp);
    if (heading !== previousHeading) {
      rows.push({ kind: 'heading', id: `heading-${heading}`, label: heading });
      previousHeading = heading;
    }
    rows.push({ kind: 'notification', id: notification.id, notification });
  });
  return rows;
};

export default function NotificationsScreen({
  onClose,
}: {
  onClose: (afterClose?: () => void) => void;
}) {
  const { colors, isDark } = useMobileTheme();
  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    notificationsHasMore,
    notificationsError,
    loadMoreNotifications,
    markAllRead,
    openNotification,
    refreshNotifications,
  } = useNotifications();
  const rows = useMemo(() => groupNotifications(notifications), [notifications]);

  const handleOpen = useCallback((notification: OfficerNotification) => {
    onClose(() => openNotification(notification));
  }, [onClose, openNotification]);

  const renderNotification = useCallback(({ item }: { item: NotificationRow }) => {
    if (item.kind === 'heading') {
      return (
        <Text style={[styles.dateHeading, { color: colors.textMuted }]}>
          {item.label}
        </Text>
      );
    }
    const notification = item.notification;
    const accent = colorFor(notification, colors);
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        style={[
          styles.notificationCard,
          { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
          !notification.isRead && { borderLeftColor: accent, borderLeftWidth: 3 },
        ]}
        onPress={() => handleOpen(notification)}
      >
        <View style={[styles.iconShell, { backgroundColor: isDark ? '#132442' : mobileTheme.blueSoft }]}>
          <Icon name={iconFor(notification)} size={20} color={accent} />
        </View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationTopRow}>
            <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
              {notification.title}
            </Text>
            {!notification.isRead && <View style={[styles.unreadDot, { backgroundColor: accent }]} />}
          </View>
          <Text style={[styles.notificationMessage, { color: colors.textMuted }]}>{notification.message}</Text>
          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>{formatTimestamp(notification.timestamp)}</Text>
        </View>
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }, [colors.border, colors.surfaceMuted, colors.text, colors.textMuted, handleOpen, isDark]);

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
      </View>

      <SheetFlatList
        data={rows}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={renderNotification}
        ListFooterComponent={notifications.length > 0 && (notificationsHasMore || notificationsError) ? (
          <View style={styles.footer}>
            {notificationsError ? (
              <Text style={[styles.footerError, { color: mobileTheme.danger }]}>
                {notificationsError}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.loadMoreButton, { borderColor: colors.border }]}
              onPress={() => loadMoreNotifications().catch(() => undefined)}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={mobileTheme.blue} />
              ) : (
                <Icon name={notificationsError ? 'refresh' : 'expand-more'} size={19} color={mobileTheme.blue} />
              )}
              <Text style={styles.loadMoreText}>
                {isLoadingMore ? 'Loading...' : notificationsError ? 'Try again' : 'See previous notifications'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            {isLoading ? (
              <ActivityIndicator size="small" color={mobileTheme.blue} />
            ) : (
              <Icon
                name={notificationsError ? 'cloud-off' : 'notifications-none'}
                size={38}
                color={notificationsError ? mobileTheme.danger : colors.textMuted}
              />
            )}
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {isLoading
                ? 'Loading notifications...'
                : notificationsError ? 'Notifications could not be loaded' : 'No notifications yet'}
            </Text>
            {!isLoading && notificationsError ? (
              <>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {notificationsError}
                </Text>
                <TouchableOpacity
                  style={[styles.loadMoreButton, styles.emptyRetryButton, { borderColor: colors.border }]}
                  onPress={() => refreshNotifications().catch(() => undefined)}
                >
                  <Icon name="refresh" size={19} color={mobileTheme.blue} />
                  <Text style={styles.loadMoreText}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : !isLoading && (
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
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 10, flexGrow: 1 },
  dateHeading: { marginTop: 6, marginBottom: -2, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
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
  footer: { paddingTop: 4, alignItems: 'center' },
  footerError: { marginBottom: 8, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  loadMoreButton: { minHeight: 42, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 8 },
  loadMoreText: { color: mobileTheme.blue, fontSize: 11, fontWeight: '800' },
  emptyRetryButton: { marginTop: 14 },
});
