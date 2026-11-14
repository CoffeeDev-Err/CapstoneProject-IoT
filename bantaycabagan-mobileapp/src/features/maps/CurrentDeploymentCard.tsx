import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMobileTheme } from '../../context/ThemeContext';
import type { DeploymentAssignment } from '../../types/operations';

export function CurrentDeploymentCard({ assignment, styleLabel, currentIndex, previewIndex, onOpen, onViewBlock }: {
  assignment: DeploymentAssignment;
  styleLabel: string;
  currentIndex: number;
  previewIndex: number | null;
  onOpen: () => void;
  onViewBlock: (index: number) => void;
}) {
  const { colors } = useMobileTheme();
  const blocks = assignment.scheduleBlocks || [];
  const dutyKey = `${assignment.id}:${assignment.shiftStart}`;
  const [expandedDuty, setExpandedDuty] = useState<string | null>(null);
  const expanded = expandedDuty === dutyKey && blocks.length > 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={blocks.length ? `Patrol schedule for ${assignment.patrolArea}` : `View current deployment details for ${assignment.patrolArea}`}
        accessibilityState={blocks.length ? { expanded } : undefined}
        activeOpacity={0.82} onPress={() => blocks.length ? setExpandedDuty(expanded ? null : dutyKey) : onOpen()} style={styles.heading}>
        <LinearGradient pointerEvents="none" colors={[colors.blueSoft, colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headingTint} />
        <View style={[styles.icon, { backgroundColor: colors.blue }]}>
          <Icon name={assignment.deploymentType === 'route' ? 'route' : 'location-on'} size={17} color="#fff" />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]} numberOfLines={1}>CURRENT DEPLOYMENT</Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{assignment.patrolArea}</Text>
          <Text style={[styles.subtitle, { color: colors.blue }]} numberOfLines={1}>{styleLabel}</Text>
        </View>
        <Icon name={blocks.length ? expanded ? 'expand-less' : 'expand-more' : 'chevron-right'} size={19} color={colors.blue} />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.schedule, { borderColor: colors.border }]}>
          <View style={styles.scheduleHeading}>
            <Text style={[styles.scheduleLabel, { color: colors.textMuted }]}>Patrol schedule</Text>
            <Text style={[styles.scheduleLabel, { color: colors.blue }]}>{previewIndex !== null ? `Preview ${previewIndex + 1}` : `Current ${currentIndex + 1}`}</Text>
          </View>
          <View style={styles.scheduleRow}>
            <ScrollView horizontal accessibilityLabel="My patrol schedule" showsHorizontalScrollIndicator={false}
              style={styles.scroller} contentContainerStyle={styles.scheduleItems}>
              {blocks.map((block, index) => {
                const selected = (previewIndex ?? currentIndex) === index;
                return (
                  <TouchableOpacity key={`${index}-${block.label}`} accessibilityRole="button"
                    accessibilityLabel={`View my ${assignment.deploymentType === 'route' ? 'route' : 'area'} ${index + 1}: ${block.label}${index === currentIndex ? ', current coverage' : ''}`}
                    accessibilityState={{ selected }} onPress={() => onViewBlock(index)}
                    style={[styles.block, { backgroundColor: selected ? colors.blue : colors.surface, borderColor: selected ? colors.blue : colors.border }]}>
                    <Text style={[styles.blockText, { color: selected ? '#fff' : colors.text }]}>{index + 1}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="View deployment details" onPress={onOpen}
              style={[styles.details, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
              <Icon name="info-outline" size={20} color={colors.blue} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: 14, shadowColor: '#172554', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 7, elevation: 5 },
  heading: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13 },
  headingTint: { ...StyleSheet.absoluteFill, borderRadius: 13 },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.3 },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  subtitle: { fontSize: 9, lineHeight: 11, fontWeight: '600' },
  schedule: { padding: 8, paddingTop: 6, borderTopWidth: 1, gap: 6 },
  scheduleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scheduleLabel: { fontSize: 10, fontWeight: '600', flexShrink: 0 },
  // ScrollView defaults to growing to fill available space. Bound both the
  // viewport and its children so the map overlay never becomes a tall panel.
  scroller: { height: 44, maxHeight: 44, flexGrow: 1, flexShrink: 1 },
  scheduleItems: { gap: 6, alignItems: 'center' },
  block: { width: 44, height: 44, flexShrink: 0, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  blockText: { fontSize: 12, fontWeight: '800' },
  details: { width: 44, height: 44, flexShrink: 0, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
