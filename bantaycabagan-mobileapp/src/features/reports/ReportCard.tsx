import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { PoliceReport } from '../../types/operations';

type ReportCardProps = {
  expanded: boolean;
  onResolve: (report: PoliceReport) => void;
  onToggle: (reportId: string) => void;
  onView: (report: PoliceReport) => void;
  report: PoliceReport;
};

const contentEnter = FadeIn.duration(170);
const contentExit = FadeOut.duration(130);

export function ReportCard({ expanded, onResolve, onToggle, onView, report }: ReportCardProps) {
  const { colors, isDark } = useMobileTheme();
  const canResolve = report.is_incident && report.case_status !== 'resolved';
  return (
    <View style={[
      styles.card,
      isDark && { backgroundColor: colors.surface },
      report.is_incident ? styles.incident : styles.routine,
    ]}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
        activeOpacity={0.76} onPress={() => onToggle(report.id)}>
        <View style={styles.topRow}>
          <View style={[styles.typeBadge, report.is_incident ? styles.incidentBadge : styles.routineBadge]}>
            <Text style={styles.typeBadgeText}>{report.report_type}</Text>
          </View>
          <View style={styles.topActions}>
            {report.is_incident && (
              <View style={[styles.caseBadge, report.case_status === 'resolved' ? styles.resolvedBadge : styles.openBadge]}>
                <Text style={styles.caseBadgeText}>{report.case_status}</Text>
              </View>
            )}
            <Icon name={expanded ? 'expand-less' : 'expand-more'} size={21} color={colors.textMuted} />
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
      {expanded && (
        <Animated.View entering={contentEnter} exiting={contentExit}
          style={[styles.expanded, isDark && { borderTopColor: colors.border }]}>
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
            <TouchableOpacity style={[styles.viewButton, isDark && { backgroundColor: colors.surfaceMuted }]}
              onPress={() => onView(report)}>
              <Icon name="visibility" size={17} color={mobileTheme.purple} />
              <Text style={styles.viewText}>View</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 8, backgroundColor: mobileTheme.surface, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
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
  viewButton: { minHeight: 36, minWidth: 84, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: mobileTheme.blue, borderRadius: 8, backgroundColor: mobileTheme.surface },
  viewText: { color: mobileTheme.purple, fontSize: 11, fontWeight: '800' },
});
