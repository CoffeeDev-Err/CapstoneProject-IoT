import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { OperationalTask } from '../types/operations';

const filters = ['Open', 'Accepted', 'History'] as const;

const formatShiftDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatShiftTime = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

type TasksScreenProps = {
  presentation?: 'screen' | 'modal';
  onClose?: () => void;
};

export default function TasksScreen({
  presentation = 'screen',
  onClose,
}: TasksScreenProps) {
  const { colors, isDark } = useMobileTheme();
  const {
    tasks,
    upcomingDeployment,
    acceptTask,
    cancelBackupRequest,
    currentPersonnelId,
    isLoading,
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    refreshTaskHistory,
    loadMoreTaskHistory,
  } = useOperationalContext();
  const [filter, setFilter] = useState<(typeof filters)[number]>('Open');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (filter !== 'History') return;
    refreshTaskHistory().catch(() => undefined);
  }, [filter, refreshTaskHistory]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const active = task.status === 'open' || task.status === 'full';
    if (filter === 'Open') return active;
    if (filter === 'Accepted') {
      return active && task.accepted_by.includes(currentPersonnelId);
    }
    return task.status === 'completed' || task.status === 'cancelled';
  }), [currentPersonnelId, filter, tasks]);

  const handleAccept = async (task: OperationalTask) => {
    setAcceptingId(task.id);
    try {
      await acceptTask(task.id);
    } catch (error) {
      Alert.alert('Unable to accept task', (error as Error).message);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCancel = (task: OperationalTask) => {
    Alert.alert(
      'Cancel backup request?',
      'This closes the request for every responder.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(task.id);
            try {
              await cancelBackupRequest(task.id);
            } catch (error) {
              Alert.alert('Unable to cancel backup', (error as Error).message);
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const renderTask = ({ item }: { item: OperationalTask }) => {
    const accepted = item.accepted_by.includes(currentPersonnelId);
    const full = item.accepted_by.length >= item.required_responders || item.status === 'full';
    const ownRequest = item.type === 'backup' && item.requested_by === currentPersonnelId;
    const active = item.status === 'open' || item.status === 'full';
    const cancelled = item.status === 'cancelled';
    const completed = item.status === 'completed';
    const remaining = Math.max(0, item.required_responders - item.accepted_by.length);
    const statusLabel = cancelled
      ? 'Cancelled'
      : completed
        ? 'Completed'
        : full
          ? 'Team Full'
          : 'Open';

    return (
      <View style={[
        styles.taskCard,
        isDark && darkStyles.surface,
        item.type === 'backup' ? styles.taskCardBackup : styles.taskCardUrgent,
        isDark && item.type === 'urgent' && darkStyles.urgentSurface,
      ]}>
        <View style={styles.taskTopRow}>
          <View style={[styles.taskType, item.type === 'backup' ? styles.taskTypeBackup : styles.taskTypeUrgent]}>
            <Icon name={item.type === 'backup' ? 'campaign' : 'priority-high'} size={16} color={item.type === 'backup' ? mobileTheme.danger : mobileTheme.warning} />
            <Text style={[styles.taskTypeText, item.type === 'urgent' && styles.taskTypeTextUrgent]}>
              {item.type}
            </Text>
          </View>
          <Text style={[styles.taskTime, isDark && darkStyles.muted]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>

        <Text style={[styles.taskTitle, isDark && darkStyles.text]}>{item.title}</Text>
        <Text style={[styles.taskDescription, isDark && darkStyles.muted]}>{item.description}</Text>

        <View style={styles.locationRow}>
          <Icon name="place" size={17} color={colors.textMuted} />
          <Text style={[styles.locationText, isDark && darkStyles.text]}>{item.location}</Text>
        </View>

        <View style={[styles.responseRow, isDark && darkStyles.border]}>
          <View>
            <Text style={[styles.responseLabel, isDark && darkStyles.muted]}>RESPONSE TEAM</Text>
            <Text style={[styles.responseCount, isDark && darkStyles.text]}>
              {item.accepted_by.length}/{item.required_responders} accepted
              {!full && ` - ${remaining} slot${remaining === 1 ? '' : 's'} left`}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            cancelled
              ? styles.statusCancelled
              : completed
                ? styles.statusCompleted
                : full
                  ? styles.statusFull
                  : styles.statusOpen,
          ]}>
            <Text style={[styles.statusText, isDark && darkStyles.text]}>{statusLabel}</Text>
          </View>
        </View>

        {ownRequest && active ? (
          <TouchableOpacity
            style={[styles.acceptButton, styles.cancelButton, cancellingId === item.id && styles.actionPending]}
            onPress={() => handleCancel(item)}
            disabled={cancellingId === item.id}
          >
            <Icon name="close" size={18} color="#ffffff" />
            <Text style={styles.acceptButtonText}>
              {cancellingId === item.id ? 'Cancelling...' : 'Cancel Request'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.acceptButton, (!active || accepted || full) && styles.acceptButtonDisabled]}
            onPress={() => handleAccept(item)}
            disabled={!active || accepted || full || acceptingId === item.id}
          >
            <Icon
              name={accepted ? 'check' : 'person-add'}
              size={18}
              color={!active || accepted || full ? colors.textMuted : '#ffffff'}
            />
            <Text style={[
              styles.acceptButtonText,
              (!active || accepted || full) && styles.acceptButtonTextDisabled,
            ]}>
              {cancelled
                ? 'Request Cancelled'
                : completed
                  ? 'Task Completed'
                  : accepted
                    ? 'Accepted'
                    : full
                      ? 'Team Full'
                      : acceptingId === item.id
                        ? 'Accepting...'
                        : 'Accept Task'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        isDark && darkStyles.screen,
        presentation === 'modal' && styles.modalContainer,
        isDark && presentation === 'modal' && darkStyles.surface,
      ]}
      edges={presentation === 'modal' ? [] : ['top']}
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.title, isDark && darkStyles.text]}>My Task</Text>
          {presentation === 'modal' && (
            <TouchableOpacity
              accessibilityLabel="Close tasks"
              style={[styles.closeButton, isDark && darkStyles.surfaceMuted]}
              onPress={onClose}
            >
              <Icon name="close" size={23} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.subtitle, isDark && darkStyles.muted]}>Duty schedule and operational response requests</Text>
      </View>

      <View style={styles.upcomingSection}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={[styles.sectionTitle, isDark && darkStyles.text]}>Upcoming Shift</Text>
            <Text style={[styles.sectionSubtitle, isDark && darkStyles.muted]}>Your nearest scheduled deployment</Text>
          </View>
          <Icon name="event" size={22} color={mobileTheme.blue} />
        </View>

        {isLoading && !upcomingDeployment ? (
          <View style={[styles.upcomingEmpty, isDark && darkStyles.surfaceMuted]}>
            <ActivityIndicator size="small" color={mobileTheme.blue} />
            <Text style={[styles.upcomingEmptyText, isDark && darkStyles.muted]}>Loading upcoming shift...</Text>
          </View>
        ) : upcomingDeployment ? (
          <View style={[styles.upcomingCard, isDark && darkStyles.upcomingCard]}>
            <View style={styles.upcomingCardHeader}>
              <View style={[styles.calendarIcon, isDark && darkStyles.calendarIcon]}>
                <Icon name="calendar-today" size={20} color={mobileTheme.blue} />
              </View>
              <View style={styles.upcomingDateBlock}>
                <Text style={[styles.upcomingEyebrow, isDark && darkStyles.muted]}>NEXT DUTY</Text>
                <Text style={[styles.upcomingDate, isDark && darkStyles.text]}>
                  {formatShiftDate(upcomingDeployment.shiftStart)}
                </Text>
              </View>
              <View style={[styles.scheduledBadge, isDark && darkStyles.scheduledBadge]}>
                <Text style={styles.scheduledBadgeText}>Scheduled</Text>
              </View>
            </View>

            <View style={[styles.shiftDetails, isDark && darkStyles.border]}>
              <View style={styles.shiftDetailRow}>
                <Icon name="schedule" size={18} color={colors.textMuted} />
                <View style={styles.shiftDetailText}>
                  <Text style={[styles.shiftDetailLabel, isDark && darkStyles.muted]}>SHIFT TIME</Text>
                  <Text style={[styles.shiftDetailValue, isDark && darkStyles.text]}>
                    {formatShiftTime(upcomingDeployment.shiftStart)} - {formatShiftTime(upcomingDeployment.shiftEnd)}
                  </Text>
                </View>
              </View>
              <View style={styles.shiftDetailRow}>
                <Icon name="place" size={18} color={colors.textMuted} />
                <View style={styles.shiftDetailText}>
                  <Text style={[styles.shiftDetailLabel, isDark && darkStyles.muted]}>ASSIGNED AREA</Text>
                  <Text style={[styles.shiftDetailValue, isDark && darkStyles.text]} numberOfLines={2}>
                    {upcomingDeployment.patrolArea}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.upcomingEmpty, isDark && darkStyles.surfaceMuted]}>
            <Icon name="event-available" size={22} color={colors.textMuted} />
            <View style={styles.upcomingEmptyCopy}>
              <Text style={[styles.upcomingEmptyTitle, isDark && darkStyles.text]}>No upcoming shift scheduled.</Text>
              <Text style={[styles.upcomingEmptyText, isDark && darkStyles.muted]}>Your next deployment will appear here.</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.regularTasksHeading}>
        <Text style={[styles.sectionTitle, isDark && darkStyles.text]}>Regular Assigned Tasks</Text>
        <Text style={[styles.sectionSubtitle, isDark && darkStyles.muted]}>Backup and urgent response requests</Text>
      </View>

      <View style={styles.filters}>
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterButton,
              isDark && darkStyles.filterButton,
              filter === item && styles.filterButtonActive,
              isDark && filter === item && darkStyles.filterButtonActive,
            ]}
            onPress={() => setFilter(item)}
          >
            <Text style={[
              styles.filterText,
              isDark && darkStyles.muted,
              filter === item && styles.filterTextActive,
              isDark && filter === item && darkStyles.text,
            ]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={[styles.list, presentation === 'modal' && styles.modalList]}
        ListFooterComponent={filter === 'History' && taskHistoryHasMore ? (
          <TouchableOpacity
            style={[styles.loadMoreButton, isDark && darkStyles.surfaceMuted]}
            onPress={() => loadMoreTaskHistory().catch(() => undefined)}
            disabled={isTaskHistoryLoadingMore}
          >
            {isTaskHistoryLoadingMore ? (
              <ActivityIndicator size="small" color={mobileTheme.blue} />
            ) : (
              <Icon name="expand-more" size={20} color={mobileTheme.blue} />
            )}
            <Text style={styles.loadMoreText}>
              {isTaskHistoryLoadingMore ? 'Loading...' : 'Load more'}
            </Text>
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Icon name="assignment-turned-in" size={34} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, isDark && darkStyles.text]}>
              {(filter === 'History' ? isTaskHistoryLoading : isLoading)
                ? 'Loading tasks...'
                : 'No tasks here'}
            </Text>
            <Text style={[styles.emptyText, isDark && darkStyles.muted]}>
              {filter === 'History'
                ? 'Completed and cancelled tasks will appear here.'
                : 'New backup and urgent requests will appear automatically.'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.background },
  modalContainer: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: mobileTheme.surface,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: mobileTheme.navy, fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 13 },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 21,
    backgroundColor: mobileTheme.surface,
  },
  upcomingSection: { paddingHorizontal: 22, paddingBottom: 18 },
  sectionHeadingRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  sectionSubtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  upcomingCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderLeftWidth: 3,
    borderLeftColor: mobileTheme.blue,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
    shadowColor: mobileTheme.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  upcomingCardHeader: { flexDirection: 'row', alignItems: 'center' },
  calendarIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: mobileTheme.blueSoft,
  },
  upcomingDateBlock: { flex: 1, marginHorizontal: 11 },
  upcomingEyebrow: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  upcomingDate: { marginTop: 3, color: mobileTheme.text, fontSize: 14, fontWeight: '800' },
  scheduledBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: mobileTheme.blueSoft,
  },
  scheduledBadgeText: { color: mobileTheme.blue, fontSize: 9, fontWeight: '800' },
  shiftDetails: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderSoft,
    gap: 10,
  },
  shiftDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  shiftDetailText: { flex: 1 },
  shiftDetailLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  shiftDetailValue: { marginTop: 2, color: mobileTheme.text, fontSize: 12, fontWeight: '700' },
  upcomingEmpty: {
    minHeight: 66,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surfaceMuted,
  },
  upcomingEmptyCopy: { flex: 1 },
  upcomingEmptyTitle: { color: mobileTheme.text, fontSize: 12, fontWeight: '800' },
  upcomingEmptyText: { color: mobileTheme.textMuted, fontSize: 11 },
  regularTasksHeading: { paddingHorizontal: 22, paddingBottom: 10 },
  filters: {
    marginHorizontal: 22,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },
  filterButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
  },
  filterButtonActive: { borderColor: mobileTheme.blue, backgroundColor: '#edf4ff' },
  filterText: { color: mobileTheme.navy, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: mobileTheme.blue },
  list: { paddingHorizontal: 22, paddingBottom: 112, gap: 13 },
  modalList: { paddingBottom: 28 },
  taskCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  taskCardBackup: { borderLeftWidth: 3, borderLeftColor: mobileTheme.blue },
  taskCardUrgent: { borderLeftWidth: 3, borderLeftColor: mobileTheme.danger },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskType: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  taskTypeBackup: { backgroundColor: 'transparent' },
  taskTypeUrgent: { backgroundColor: 'transparent' },
  taskTypeText: { color: mobileTheme.purple, fontSize: 20, fontWeight: '800', textTransform: 'capitalize' },
  taskTypeTextUrgent: { color: mobileTheme.danger },
  taskTime: { color: mobileTheme.textMuted, fontSize: 11 },
  taskTitle: { marginTop: 12, color: mobileTheme.text, fontSize: 16, fontWeight: '800' },
  taskDescription: { marginTop: 5, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  locationRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { flex: 1, color: mobileTheme.text, fontSize: 12, fontWeight: '600' },
  responseRow: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: mobileTheme.border,
  },
  responseLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  responseCount: { marginTop: 3, color: mobileTheme.text, fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusOpen: { backgroundColor: mobileTheme.successSoft },
  statusFull: { backgroundColor: mobileTheme.blueSoft },
  statusCompleted: { backgroundColor: mobileTheme.successSoft },
  statusCancelled: { backgroundColor: '#e2e2ea' },
  statusText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800' },
  acceptButton: {
    minHeight: 42,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: mobileTheme.purple,
  },
  acceptButtonDisabled: { backgroundColor: '#e2e2ea' },
  cancelButton: { backgroundColor: mobileTheme.danger },
  actionPending: { opacity: 0.6 },
  acceptButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  acceptButtonTextDisabled: { color: mobileTheme.textMuted },
  emptyState: { paddingTop: 80, alignItems: 'center' },
  emptyTitle: { marginTop: 12, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  emptyText: { maxWidth: 260, marginTop: 5, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  loadMoreButton: {
    minHeight: 44,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
  },
  loadMoreText: { color: mobileTheme.blue, fontSize: 12, fontWeight: '800' },
});

const darkStyles = StyleSheet.create({
  screen: { backgroundColor: '#050b18' },
  surface: { borderColor: '#22314a', backgroundColor: '#0b1528' },
  urgentSurface: { backgroundColor: '#0b1528' },
  surfaceMuted: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
  border: { borderColor: '#22314a' },
  filterButton: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  filterButtonActive: { borderColor: mobileTheme.blue, backgroundColor: '#132442' },
  upcomingCard: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  calendarIcon: { backgroundColor: '#132442' },
  scheduledBadge: { backgroundColor: '#132442' },
});
