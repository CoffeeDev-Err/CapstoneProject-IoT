import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { OperationalTask } from '../../types/operations';
import { SmoothCollapsible } from './SmoothCollapsible';

type TaskCardProps = {
  accepting: boolean;
  cancelling: boolean;
  currentPersonnelId: string;
  expanded: boolean;
  filterTranslateX: SharedValue<number>;
  onAccept: (task: OperationalTask) => void;
  onCancel: (task: OperationalTask) => void;
  onToggle: (taskId: string) => void;
  task: OperationalTask;
};

export function TaskCard({
  accepting,
  cancelling,
  currentPersonnelId,
  expanded,
  filterTranslateX,
  onAccept,
  onCancel,
  onToggle,
  task,
}: TaskCardProps) {
  const { colors, isDark } = useMobileTheme();
  const transitionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: filterTranslateX.value }],
  }));
  const accepted = task.accepted_by.includes(currentPersonnelId);
  const full = task.accepted_by.length >= task.required_responders || task.status === 'full';
  const ownRequest = task.type === 'backup' && task.requested_by === currentPersonnelId;
  const active = task.status === 'open' || task.status === 'full';
  const cancelled = task.status === 'cancelled';
  const completed = task.status === 'completed';
  const remaining = Math.max(0, task.required_responders - task.accepted_by.length);
  const statusLabel = cancelled ? 'Cancelled' : completed ? 'Completed' : full ? 'Team Full' : 'Open';

  return (
    <View style={[
      styles.card,
      isDark && darkStyles.surface,
      task.type === 'backup' ? styles.cardBackup : styles.cardUrgent,
      isDark && task.type === 'urgent' && darkStyles.urgentSurface,
    ]}>
      <Animated.View style={transitionStyle}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={0.76}
          onPress={() => onToggle(task.id)}
        >
          <View style={styles.topRow}>
            <View style={styles.taskType}>
              <Icon name={task.type === 'backup' ? 'campaign' : 'priority-high'} size={16} color={task.type === 'backup' ? mobileTheme.danger : mobileTheme.warning} />
              <Text style={[styles.taskTypeText, task.type === 'urgent' && styles.taskTypeTextUrgent]}>
                {task.type}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={[styles.time, isDark && darkStyles.muted]}>
                {new Date(task.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Icon name={expanded ? 'expand-less' : 'expand-more'} size={21} color={colors.textMuted} />
            </View>
          </View>

          <Text style={[styles.title, isDark && darkStyles.text]}>{task.title}</Text>
          <Text style={[styles.description, isDark && darkStyles.muted]} numberOfLines={1}>
            {task.description}
          </Text>
          <View style={styles.locationRow}>
            <Icon name="place" size={17} color={colors.textMuted} />
            <Text style={[styles.locationText, isDark && darkStyles.text]} numberOfLines={1}>{task.location}</Text>
          </View>
        </TouchableOpacity>

        <SmoothCollapsible expanded={expanded}>
          <View style={[styles.expanded, isDark && darkStyles.border]}>
            <Text style={[styles.expandedDescription, isDark && darkStyles.muted]}>
              {task.description || 'No description provided.'}
            </Text>
            <View style={styles.responseRow}>
              <View>
                <Text style={[styles.responseLabel, isDark && darkStyles.muted]}>RESPONSE TEAM</Text>
                <Text style={[styles.responseCount, isDark && darkStyles.text]}>
                  {task.accepted_by.length}/{task.required_responders} accepted
                  {!full && ` - ${remaining} slot${remaining === 1 ? '' : 's'} left`}
                </Text>
              </View>
              <View style={[
                styles.statusBadge,
                cancelled ? styles.statusCancelled
                  : completed ? styles.statusCompleted
                    : full ? styles.statusFull : styles.statusOpen,
              ]}>
                <Text style={[styles.statusText, isDark && darkStyles.text]}>{statusLabel}</Text>
              </View>
            </View>

            {ownRequest && active ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton, cancelling && styles.actionPending]}
                onPress={() => onCancel(task)}
                disabled={cancelling}
              >
                <Icon name="close" size={18} color="#ffffff" />
                <Text style={styles.actionButtonText}>{cancelling ? 'Cancelling...' : 'Cancel Request'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, (!active || accepted || full) && styles.actionButtonDisabled]}
                onPress={() => onAccept(task)}
                disabled={!active || accepted || full || accepting}
              >
                <Icon name={accepted ? 'check' : 'person-add'} size={18} color={!active || accepted || full ? colors.textMuted : '#ffffff'} />
                <Text style={[styles.actionButtonText, (!active || accepted || full) && styles.actionButtonTextDisabled]}>
                  {cancelled ? 'Request Cancelled'
                    : completed ? 'Task Completed'
                      : accepted ? 'Accepted'
                        : full ? 'Team Full'
                          : accepting ? 'Accepting...' : 'Accept Task'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </SmoothCollapsible>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 22, padding: 16, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 8, backgroundColor: mobileTheme.surface, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardBackup: { borderLeftWidth: 3, borderLeftColor: mobileTheme.blue },
  cardUrgent: { borderLeftWidth: 3, borderLeftColor: mobileTheme.danger },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskType: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  taskTypeText: { color: mobileTheme.purple, fontSize: 20, fontWeight: '800', textTransform: 'capitalize' },
  taskTypeTextUrgent: { color: mobileTheme.danger },
  time: { color: mobileTheme.textMuted, fontSize: 11 },
  title: { marginTop: 12, color: mobileTheme.text, fontSize: 16, fontWeight: '800' },
  description: { marginTop: 5, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  locationRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { flex: 1, color: mobileTheme.text, fontSize: 12, fontWeight: '600' },
  expanded: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  expandedDescription: { color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  responseRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  responseLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  responseCount: { marginTop: 3, color: mobileTheme.text, fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusOpen: { backgroundColor: mobileTheme.successSoft },
  statusFull: { backgroundColor: mobileTheme.blueSoft },
  statusCompleted: { backgroundColor: mobileTheme.successSoft },
  statusCancelled: { backgroundColor: '#e2e2ea' },
  statusText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800' },
  actionButton: { minHeight: 42, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, backgroundColor: mobileTheme.purple },
  actionButtonDisabled: { backgroundColor: '#e2e2ea' },
  cancelButton: { backgroundColor: mobileTheme.danger },
  actionPending: { opacity: 0.6 },
  actionButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  actionButtonTextDisabled: { color: mobileTheme.textMuted },
});

const darkStyles = StyleSheet.create({
  surface: { borderColor: '#22314a', backgroundColor: '#0b1528' },
  urgentSurface: { backgroundColor: '#0b1528' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
  border: { borderColor: '#22314a' },
});
