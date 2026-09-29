import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { PoliceReport } from '../../types/operations';
import { SmoothCollapsible } from '../tasks/SmoothCollapsible';

type ReportCardProps = {
  expanded: boolean;
  onResolve: (report: PoliceReport) => void;
  onToggle: (reportId: string) => void;
  onView: (report: PoliceReport) => void;
  report: PoliceReport;
  transitionDirection?: SharedValue<number>;
  transitionIndex?: number;
  transitionProgress?: SharedValue<number>;
};

const EXPANSION_DURATION_MS = 230;
const EXPANSION_EASING = Easing.bezier(0.2, 0, 0, 1);
const CONTENT_REVEAL_DURATION_MS = 220;

export const ReportCard = React.memo(function ReportCard({
  expanded,
  onResolve,
  onToggle,
  onView,
  report,
  transitionDirection,
  transitionIndex = 0,
  transitionProgress,
}: ReportCardProps) {
  const { colors, isDark } = useMobileTheme();
  const canResolve = report.is_incident && report.case_status !== 'resolved';
  const chevronProgress = useSharedValue(expanded ? 1 : 0);
  const contentReveal = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(contentReveal);
    contentReveal.value = 0;
    contentReveal.value = withTiming(1, {
      duration: CONTENT_REVEAL_DURATION_MS,
      easing: EXPANSION_EASING,
    });
  }, [
    contentReveal,
    report.case_status,
    report.date_time,
    report.id,
    report.location,
    report.title,
    report.validation_status,
  ]);
  useEffect(() => {
    cancelAnimation(chevronProgress);
    chevronProgress.value = withTiming(expanded ? 1 : 0, {
      duration: EXPANSION_DURATION_MS,
      easing: EXPANSION_EASING,
    });
  }, [chevronProgress, expanded]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronProgress.value * 180}deg` }],
  }));
  const transitionStyle = useAnimatedStyle(() => {
    const rawProgress = Math.min(transitionProgress?.value ?? 1, contentReveal.value);
    const staggerStart = Math.min(transitionIndex, 6) * 0.035;
    const itemProgress = interpolate(
      rawProgress,
      [staggerStart, Math.min(1, staggerStart + 0.72)],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: 0.24 + (itemProgress * 0.76),
      transform: [{
        translateX: (1 - itemProgress) * (transitionDirection?.value ?? 1) * 14,
      }, {
        scale: 0.99 + (itemProgress * 0.01),
      }],
    };
  });
  return (
    <View style={[
      styles.card,
      isDark && styles.cardDark,
      report.is_incident ? styles.incident : styles.routine,
    ]}>
      <Animated.View style={transitionStyle}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
        activeOpacity={0.76} onPress={() => onToggle(report.id)}>
        <View style={styles.topRow}>
          <View style={[styles.typeBadge, report.is_incident ? styles.incidentBadge : styles.routineBadge]}>
            <Text style={styles.typeBadgeText}>{report.report_type}</Text>
          </View>
          <View style={styles.topActions}>
            <View style={[styles.caseBadge, report.validation_status === 'validated' ? styles.resolvedBadge : report.validation_status === 'rejected' ? styles.incidentBadge : styles.openBadge]}>
              <Text style={styles.caseBadgeText}>{report.validation_status || 'pending'}</Text>
            </View>
            {report.is_incident && (
              <View style={[styles.caseBadge, report.case_status === 'resolved' ? styles.resolvedBadge : styles.openBadge]}>
                <Text style={styles.caseBadgeText}>{report.case_status}</Text>
              </View>
            )}
            <Animated.View style={chevronStyle}>
              <Icon name="expand-more" size={21} color={colors.textMuted} />
            </Animated.View>
          </View>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{report.title}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {new Date(report.date_time).toLocaleString([], {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </Text>
        <View style={styles.locationRow}>
          <Icon name="place" size={16} color={colors.textMuted} />
          <Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>{report.location}</Text>
        </View>
      </TouchableOpacity>
      <SmoothCollapsible expanded={expanded}>
        <View style={[styles.expanded, isDark && { borderTopColor: colors.border }]}>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {report.description || 'No description provided.'}
          </Text>
          <View style={styles.actions}>
            {canResolve && (
              <TouchableOpacity style={styles.resolveButton} onPress={() => onResolve(report)}>
                <Icon name="check-circle" size={17} color="#ffffff" />
                <Text style={styles.resolveText}>Resolve Incident</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.viewButton, isDark && styles.viewButtonDark]}
              onPress={() => onView(report)}>
              <Icon name="visibility" size={17} color={mobileTheme.blue} />
              <Text style={styles.viewText}>View</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothCollapsible>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 0, borderRadius: 10, backgroundColor: mobileTheme.surface, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.11, shadowRadius: 10, elevation: 4 },
  cardDark: { backgroundColor: '#101f38', shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.42, shadowRadius: 12, elevation: 5 },
  incident: { borderLeftWidth: 3, borderLeftColor: mobileTheme.danger },
  routine: { borderLeftWidth: 3, borderLeftColor: mobileTheme.blue },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  incidentBadge: { backgroundColor: mobileTheme.dangerSoft },
  routineBadge: { backgroundColor: mobileTheme.blueSoft },
  typeBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  caseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  openBadge: { backgroundColor: mobileTheme.warningSoft },
  resolvedBadge: { backgroundColor: mobileTheme.successSoft },
  caseBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  title: { marginTop: 7, fontSize: 15, fontWeight: '800' },
  meta: { marginTop: 2, fontSize: 11 },
  locationRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { flex: 1, fontSize: 12 },
  expanded: { marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  description: { fontSize: 12, lineHeight: 17 },
  actions: { marginTop: 7, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  resolveButton: { minHeight: 36, paddingHorizontal: 11, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, backgroundColor: mobileTheme.success },
  resolveText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  viewButton: { minHeight: 36, minWidth: 84, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#b7d2ff', borderRadius: 8, backgroundColor: '#e8f1ff', shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5, elevation: 2 },
  viewButtonDark: { borderColor: '#3568b8', backgroundColor: '#17315a', shadowColor: '#000000', shadowOpacity: 0.38 },
  viewText: { color: mobileTheme.blue, fontSize: 11, fontWeight: '800' },
});
