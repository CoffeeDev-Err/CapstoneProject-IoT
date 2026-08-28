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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { OperationalTask } from '../types/operations';
import { SheetFlatList } from '../components/SwipeDismissSheet';
import { TaskCard } from '../features/tasks/TaskCard';
import { UpcomingShiftCard } from '../features/tasks/UpcomingShiftCard';

const filters = ['Open', 'Accepted', 'History'] as const;

type TaskListRow =
  | { kind: 'controls'; id: 'regular-controls' }
  | { kind: 'task'; id: string; task: OperationalTask }
  | { kind: 'empty'; id: 'regular-empty' };

const TASK_CONTROLS_ROW: TaskListRow = {
  kind: 'controls',
  id: 'regular-controls',
};

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

  const renderTask = useCallback(({ item }: { item: OperationalTask }) => (
    <TaskCard
      accepting={acceptingId === item.id}
      cancelling={cancellingId === item.id}
      currentPersonnelId={currentPersonnelId}
      expanded={expandedTaskIds.has(item.id)}
      filterTranslateX={filterTranslateX}
      onAccept={handleAccept}
      onCancel={handleCancel}
      onToggle={toggleTask}
      task={item}
    />
  ), [acceptingId, cancellingId, currentPersonnelId, expandedTaskIds,
    filterTranslateX, handleAccept, handleCancel, toggleTask]);

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
              <UpcomingShiftCard
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
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  title: { color: mobileTheme.navy, fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 13 },
  regularStickyHeader: { zIndex: 3, backgroundColor: mobileTheme.background },
  regularStickyHeaderModal: { backgroundColor: mobileTheme.surface },
  sectionHeadingRow: {
    paddingHorizontal: 22,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  sectionSubtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
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
  surfaceMuted: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
  border: { borderColor: '#22314a' },
  filterButton: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  filterButtonActive: { borderColor: mobileTheme.blue, backgroundColor: '#132442' },
  regularStickyHeader: { backgroundColor: '#050b18' },
  regularStickyHeaderModal: { backgroundColor: '#0b1528' },
});
