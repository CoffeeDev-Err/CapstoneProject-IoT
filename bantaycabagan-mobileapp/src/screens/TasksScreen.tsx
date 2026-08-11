import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { DeploymentAssignment, OperationalTask } from '../types/operations';
import { SheetFlatList } from '../components/SwipeDismissSheet';

const filters = ['Open', 'Accepted', 'History'] as const;
const COLLAPSE_DURATION = 230;
const COLLAPSE_EASING = Easing.bezier(0.2, 0, 0, 1);

type TaskListRow =
  | { kind: 'controls'; id: 'regular-controls' }
  | { kind: 'task'; id: string; task: OperationalTask }
  | { kind: 'empty'; id: 'regular-empty' };

const TASK_CONTROLS_ROW: TaskListRow = {
  kind: 'controls',
  id: 'regular-controls',
};

function SmoothCollapsible({
  children,
  expanded,
}: {
  children: React.ReactNode;
  expanded: boolean;
}) {
  const measuredHeight = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: COLLAPSE_DURATION,
      easing: COLLAPSE_EASING,
    });
  }, [expanded, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: Math.max(0, measuredHeight.value * progress.value),
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0.7, 1]),
  }));

  const measureContent = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight > 0) measuredHeight.value = nextHeight;
  }, [measuredHeight]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[styles.collapsible, animatedStyle]}
    >
      <View onLayout={measureContent} style={styles.collapsibleContent}>{children}</View>
    </Animated.View>
  );
}

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

function UpcomingShiftContent({
  expanded,
  isLoading,
  onToggle,
  upcomingDeployment,
}: {
  expanded: boolean;
  isLoading: boolean;
  onToggle: () => void;
  upcomingDeployment: DeploymentAssignment | null;
}) {
  const { colors, isDark } = useMobileTheme();

  return (
    <View style={styles.upcomingContent}>
      {isLoading && !upcomingDeployment ? (
        <View style={[styles.upcomingEmpty, isDark && darkStyles.surfaceMuted]}>
          <ActivityIndicator size="small" color={mobileTheme.blue} />
          <Text style={[styles.upcomingEmptyText, isDark && darkStyles.muted]}>Loading upcoming shift...</Text>
        </View>
      ) : upcomingDeployment ? (
        <View style={[styles.upcomingCard, isDark && darkStyles.upcomingCard]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            activeOpacity={0.76}
            style={styles.upcomingCardHeader}
            onPress={onToggle}
          >
            <View style={[styles.calendarIcon, isDark && darkStyles.calendarIcon]}>
              <Icon name="calendar-today" size={20} color={mobileTheme.blue} />
            </View>
            <View style={styles.upcomingDateBlock}>
              <Text style={[styles.upcomingEyebrow, isDark && darkStyles.muted]}>NEXT DUTY</Text>
              <Text style={[styles.upcomingDate, isDark && darkStyles.text]} numberOfLines={2}>
                {formatShiftDate(upcomingDeployment.shiftStart)}
              </Text>
            </View>
            <View style={styles.upcomingHeaderActions}>
              <View style={[styles.scheduledBadge, isDark && darkStyles.scheduledBadge]}>
                <Text style={styles.scheduledBadgeText}>Scheduled</Text>
              </View>
              <Icon name={expanded ? 'expand-less' : 'expand-more'} size={21} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <SmoothCollapsible expanded={expanded}>
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
          </SmoothCollapsible>
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
  );
}

type TasksScreenProps = {
  presentation?: 'screen' | 'modal';
};

export default function TasksScreen({
  presentation = 'screen',
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
  const filterTranslateX = useSharedValue(0);
  const pendingFilterDirection = useRef(0);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const filterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: filterTranslateX.value }],
  }));

  const toggleUpcoming = useCallback(() => {
    setUpcomingExpanded((current) => !current);
  }, []);

  const toggleTask = useCallback((taskId: string) => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectFilter = useCallback((nextFilter: (typeof filters)[number]) => {
    if (nextFilter === filter) return;

    const forward = filters.indexOf(nextFilter) > filters.indexOf(filter);
    pendingFilterDirection.current = forward ? 1 : -1;
    setFilter(nextFilter);
  }, [filter]);

  useLayoutEffect(() => {
    if (pendingFilterDirection.current === 0) return;
    cancelAnimation(filterTranslateX);
    filterTranslateX.value = pendingFilterDirection.current * 14;
    pendingFilterDirection.current = 0;
    filterTranslateX.value = withTiming(0, { duration: 140 });
  }, [filter, filterTranslateX]);

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

  const taskRows = useMemo<TaskListRow[]>(() => [
    TASK_CONTROLS_ROW,
    ...(filteredTasks.length > 0
      ? filteredTasks.map((task) => ({ kind: 'task' as const, id: task.id, task }))
      : [{ kind: 'empty' as const, id: 'regular-empty' as const }]),
  ], [filteredTasks]);

  const handleAccept = useCallback(async (task: OperationalTask) => {
    setAcceptingId(task.id);
    try {
      await acceptTask(task.id);
    } catch (error) {
      Alert.alert('Unable to accept task', (error as Error).message);
    } finally {
      setAcceptingId(null);
    }
  }, [acceptTask]);

  const handleCancel = useCallback((task: OperationalTask) => {
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
  }, [cancelBackupRequest]);

  const renderTask = useCallback(({ item }: { item: OperationalTask }) => {
    const expanded = expandedTaskIds.has(item.id);
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
      <View
        style={[
          styles.taskCard,
          isDark && darkStyles.surface,
          item.type === 'backup' ? styles.taskCardBackup : styles.taskCardUrgent,
          isDark && item.type === 'urgent' && darkStyles.urgentSurface,
        ]}
      >
        <Animated.View style={filterAnimatedStyle}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={0.76}
          onPress={() => toggleTask(item.id)}
        >
          <View style={styles.taskTopRow}>
            <View style={[styles.taskType, item.type === 'backup' ? styles.taskTypeBackup : styles.taskTypeUrgent]}>
              <Icon name={item.type === 'backup' ? 'campaign' : 'priority-high'} size={16} color={item.type === 'backup' ? mobileTheme.danger : mobileTheme.warning} />
              <Text style={[styles.taskTypeText, item.type === 'urgent' && styles.taskTypeTextUrgent]}>
                {item.type}
              </Text>
            </View>
            <View style={styles.taskMetaRow}>
              <Text style={[styles.taskTime, isDark && darkStyles.muted]}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Icon name={expanded ? 'expand-less' : 'expand-more'} size={21} color={colors.textMuted} />
            </View>
          </View>

          <Text style={[styles.taskTitle, isDark && darkStyles.text]}>{item.title}</Text>
          <Text
            style={[styles.taskDescription, isDark && darkStyles.muted]}
            numberOfLines={1}
          >
            {item.description}
          </Text>

          <View style={styles.locationRow}>
            <Icon name="place" size={17} color={colors.textMuted} />
            <Text style={[styles.locationText, isDark && darkStyles.text]} numberOfLines={1}>{item.location}</Text>
          </View>
        </TouchableOpacity>

        <SmoothCollapsible expanded={expanded}>
          <View style={[styles.taskExpanded, isDark && darkStyles.border]}>
            <Text style={[styles.taskExpandedDescription, isDark && darkStyles.muted]}>
              {item.description || 'No description provided.'}
            </Text>
            <View style={styles.responseRow}>
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
        </SmoothCollapsible>
        </Animated.View>
      </View>
    );
  }, [
    acceptingId,
    cancellingId,
    colors.textMuted,
    currentPersonnelId,
    handleAccept,
    handleCancel,
    isDark,
    expandedTaskIds,
    filterAnimatedStyle,
    toggleTask,
  ]);

  return (
    <SafeAreaView
      style={[
        styles.container,
        isDark && darkStyles.screen,
        presentation === 'modal' && styles.modalContainer,
        isDark && presentation === 'modal' && darkStyles.surface,
      ]}
      edges={[]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isDark && darkStyles.text]}>My Task</Text>
        <Text style={[styles.subtitle, isDark && darkStyles.muted]}>Duty schedule and operational response requests</Text>
      </View>

      <View style={styles.listTransition}>
        <SheetFlatList<TaskListRow>
          data={taskRows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.kind === 'controls') {
              return (
                <View style={[
                  styles.regularStickyHeader,
                  presentation === 'modal' && styles.regularStickyHeaderModal,
                  isDark && darkStyles.regularStickyHeader,
                  isDark && presentation === 'modal' && darkStyles.regularStickyHeaderModal,
                ]}>
                  <View style={styles.regularTasksHeading}>
                    <Text style={[styles.sectionTitle, isDark && darkStyles.text]}>Regular Assigned Tasks</Text>
                    <Text style={[styles.sectionSubtitle, isDark && darkStyles.muted]}>Backup and urgent response requests</Text>
                  </View>
                  <View style={styles.filters}>
                    {filters.map((filterItem) => (
                      <TouchableOpacity
                        key={filterItem}
                        style={[
                          styles.filterButton,
                          isDark && darkStyles.filterButton,
                          filter === filterItem && styles.filterButtonActive,
                          isDark && filter === filterItem && darkStyles.filterButtonActive,
                        ]}
                        onPress={() => selectFilter(filterItem)}
                      >
                        <Text style={[
                          styles.filterText,
                          isDark && darkStyles.muted,
                          filter === filterItem && styles.filterTextActive,
                          isDark && filter === filterItem && darkStyles.text,
                        ]}>{filterItem}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            }

            if (item.kind === 'task') {
              return renderTask({ item: item.task });
            }

            return (
              <Animated.View style={[styles.emptyState, filterAnimatedStyle]}>
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
              </Animated.View>
            );
          }}
          style={styles.listViewport}
          contentContainerStyle={[styles.list, presentation === 'modal' && styles.modalList]}
          stickyHeaderIndices={[1]}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={(
            <>
              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={[styles.sectionTitle, isDark && darkStyles.text]}>Upcoming Shift</Text>
                  <Text style={[styles.sectionSubtitle, isDark && darkStyles.muted]}>Your nearest scheduled deployment</Text>
                </View>
                <Icon name="event" size={22} color={mobileTheme.blue} />
              </View>
              <UpcomingShiftContent
                expanded={upcomingExpanded}
                isLoading={isLoading}
                onToggle={toggleUpcoming}
                upcomingDeployment={upcomingDeployment}
              />
            </>
          )}
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
        />
      </View>
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
  listTransition: { flex: 1 },
  listViewport: { flex: 1 },
  collapsible: { overflow: 'hidden' },
  collapsibleContent: { position: 'absolute', width: '100%' },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  title: { color: mobileTheme.navy, fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 13 },
  regularStickyHeader: { zIndex: 3, backgroundColor: mobileTheme.background },
  regularStickyHeaderModal: { backgroundColor: mobileTheme.surface },
  upcomingContent: { paddingHorizontal: 22, paddingBottom: 18 },
  sectionHeadingRow: {
    paddingHorizontal: 22,
    paddingBottom: 10,
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
  upcomingHeaderActions: { alignItems: 'center', gap: 3 },
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
  list: { paddingBottom: 112, gap: 13 },
  modalList: { paddingBottom: 28 },
  taskCard: {
    marginHorizontal: 22,
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
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  taskExpanded: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.border,
  },
  taskExpandedDescription: { color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  responseRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  emptyState: { marginHorizontal: 22, paddingTop: 54, alignItems: 'center' },
  emptyTitle: { marginTop: 12, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  emptyText: { maxWidth: 260, marginTop: 5, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  loadMoreButton: {
    marginHorizontal: 22,
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
  regularStickyHeader: { backgroundColor: '#050b18' },
  regularStickyHeaderModal: { backgroundColor: '#0b1528' },
  upcomingCard: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  calendarIcon: { backgroundColor: '#132442' },
  scheduledBadge: { backgroundColor: '#132442' },
});
