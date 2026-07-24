import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { CURRENT_OFFICER } from '../constants/officer';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import type { OperationalTask } from '../types/operations';

const filters = ['All', 'Open', 'Accepted'] as const;

type TasksScreenProps = {
  presentation?: 'screen' | 'modal';
  onClose?: () => void;
};

export default function TasksScreen({
  presentation = 'screen',
  onClose,
}: TasksScreenProps) {
  const { tasks, acceptTask, isLoading } = useOperationalContext();
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === 'Open') return task.status === 'open';
    if (filter === 'Accepted') return task.accepted_by.includes(CURRENT_OFFICER.id);
    return true;
  }), [filter, tasks]);

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

  const renderTask = ({ item }: { item: OperationalTask }) => {
    const accepted = item.accepted_by.includes(CURRENT_OFFICER.id);
    const full = item.accepted_by.length >= item.required_responders || item.status === 'full';
    const ownRequest = item.type === 'backup' && item.requested_by === CURRENT_OFFICER.id;
    const remaining = Math.max(0, item.required_responders - item.accepted_by.length);

    return (
      <View style={[
        styles.taskCard,
        item.type === 'backup' ? styles.taskCardBackup : styles.taskCardUrgent,
      ]}>
        <View style={styles.taskTopRow}>
          <View style={[styles.taskType, item.type === 'backup' ? styles.taskTypeBackup : styles.taskTypeUrgent]}>
            <Icon name={item.type === 'backup' ? 'campaign' : 'priority-high'} size={16} color={item.type === 'backup' ? mobileTheme.danger : mobileTheme.warning} />
            <Text style={[styles.taskTypeText, item.type === 'urgent' && styles.taskTypeTextUrgent]}>
              {item.type}
            </Text>
          </View>
          <Text style={styles.taskTime}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>

        <Text style={styles.taskTitle}>{item.title}</Text>
        <Text style={styles.taskDescription}>{item.description}</Text>

        <View style={styles.locationRow}>
          <Icon name="place" size={17} color={mobileTheme.textMuted} />
          <Text style={styles.locationText}>{item.location}</Text>
        </View>

        <View style={styles.responseRow}>
          <View>
            <Text style={styles.responseLabel}>RESPONSE TEAM</Text>
            <Text style={styles.responseCount}>
              {item.accepted_by.length}/{item.required_responders} accepted
              {!full && ` · ${remaining} slot${remaining === 1 ? '' : 's'} left`}
            </Text>
          </View>
          <View style={[styles.statusBadge, full ? styles.statusFull : styles.statusOpen]}>
            <Text style={styles.statusText}>{full ? 'Team Full' : 'Open'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.acceptButton, (accepted || full || ownRequest) && styles.acceptButtonDisabled]}
          onPress={() => handleAccept(item)}
          disabled={accepted || full || ownRequest || acceptingId === item.id}
        >
          <Icon name={accepted ? 'check' : 'person-add'} size={18} color={accepted || full || ownRequest ? mobileTheme.textMuted : '#ffffff'} />
          <Text style={[styles.acceptButtonText, (accepted || full || ownRequest) && styles.acceptButtonTextDisabled]}>
            {ownRequest ? 'Requested by You' : accepted ? 'Accepted' : full ? 'Team Full' : acceptingId === item.id ? 'Accepting...' : 'Accept Task'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, presentation === 'modal' && styles.modalContainer]}
      edges={presentation === 'modal' ? [] : ['top']}
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>My Task</Text>
          {presentation === 'modal' && (
            <TouchableOpacity
              accessibilityLabel="Close tasks"
              style={styles.closeButton}
              onPress={onClose}
            >
              <Icon name="close" size={23} color={mobileTheme.navy} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>Backup and urgent response requests</Text>
      </View>

      <View style={styles.filters}>
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filterButton, filter === item && styles.filterButtonActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={[styles.list, presentation === 'modal' && styles.modalList]}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Icon name="assignment-turned-in" size={34} color={mobileTheme.textMuted} />
            <Text style={styles.emptyTitle}>{isLoading ? 'Loading tasks...' : 'No tasks here'}</Text>
            <Text style={styles.emptyText}>New backup and urgent requests will appear automatically.</Text>
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
    borderWidth: 1.5,
    borderColor: mobileTheme.purple,
    borderRadius: 22,
    backgroundColor: '#d9d7e2',
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  filterButtonActive: { borderColor: mobileTheme.navy, backgroundColor: mobileTheme.surface },
  filterText: { color: mobileTheme.navy, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: mobileTheme.navy },
  list: { paddingHorizontal: 22, paddingBottom: 112, gap: 13 },
  modalList: { paddingBottom: 28 },
  taskCard: {
    padding: 16,
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: mobileTheme.surface,
  },
  taskCardBackup: { borderColor: mobileTheme.purple },
  taskCardUrgent: { borderColor: mobileTheme.danger, backgroundColor: '#fffafa' },
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
  statusText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800' },
  acceptButton: {
    minHeight: 42,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    backgroundColor: mobileTheme.purple,
  },
  acceptButtonDisabled: { backgroundColor: '#e2e2ea' },
  acceptButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  acceptButtonTextDisabled: { color: mobileTheme.textMuted },
  emptyState: { paddingTop: 80, alignItems: 'center' },
  emptyTitle: { marginTop: 12, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  emptyText: { maxWidth: 260, marginTop: 5, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
