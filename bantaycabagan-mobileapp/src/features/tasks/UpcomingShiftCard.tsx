import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { DeploymentAssignment } from '../../types/operations';
import { SmoothCollapsible } from './SmoothCollapsible';

const formatShiftDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

const formatShiftTime = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

export function UpcomingShiftCard({
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
    <View style={styles.content}>
      {isLoading && !upcomingDeployment ? (
        <View style={[styles.empty, isDark && darkStyles.surfaceMuted]}>
          <ActivityIndicator size="small" color={mobileTheme.blue} />
          <Text style={[styles.emptyText, isDark && darkStyles.muted]}>Loading upcoming shift...</Text>
        </View>
      ) : upcomingDeployment ? (
        <View style={[styles.card, isDark && darkStyles.card]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            activeOpacity={0.76}
            style={styles.cardHeader}
            onPress={onToggle}
          >
            <View style={[styles.calendarIcon, isDark && darkStyles.blueSurface]}>
              <Icon name="calendar-today" size={20} color={mobileTheme.blue} />
            </View>
            <View style={styles.dateBlock}>
              <Text style={[styles.eyebrow, isDark && darkStyles.muted]}>NEXT DUTY</Text>
              <Text style={[styles.date, isDark && darkStyles.text]} numberOfLines={2}>
                {formatShiftDate(upcomingDeployment.shiftStart)}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <View style={[styles.scheduledBadge, isDark && darkStyles.blueSurface]}>
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
        <View style={[styles.empty, isDark && darkStyles.surfaceMuted]}>
          <Icon name="event-available" size={22} color={colors.textMuted} />
          <View style={styles.emptyCopy}>
            <Text style={[styles.emptyTitle, isDark && darkStyles.text]}>No upcoming shift scheduled.</Text>
            <Text style={[styles.emptyText, isDark && darkStyles.muted]}>Your next deployment will appear here.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingBottom: 18 },
  card: {
    padding: 15, borderWidth: 1, borderColor: mobileTheme.border, borderLeftWidth: 3,
    borderLeftColor: mobileTheme.blue, borderRadius: 8, backgroundColor: mobileTheme.surface,
    shadowColor: mobileTheme.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
    shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  headerActions: { alignItems: 'center', gap: 3 },
  calendarIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: mobileTheme.blueSoft },
  dateBlock: { flex: 1, marginHorizontal: 11 },
  eyebrow: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  date: { marginTop: 3, color: mobileTheme.text, fontSize: 14, fontWeight: '800' },
  scheduledBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: mobileTheme.blueSoft },
  scheduledBadgeText: { color: mobileTheme.blue, fontSize: 9, fontWeight: '800' },
  shiftDetails: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: mobileTheme.borderSoft, gap: 10 },
  shiftDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  shiftDetailText: { flex: 1 },
  shiftDetailLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  shiftDetailValue: { marginTop: 2, color: mobileTheme.text, fontSize: 12, fontWeight: '700' },
  empty: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 8, backgroundColor: mobileTheme.surfaceMuted },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: mobileTheme.text, fontSize: 12, fontWeight: '800' },
  emptyText: { color: mobileTheme.textMuted, fontSize: 11 },
});

const darkStyles = StyleSheet.create({
  card: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  surfaceMuted: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  blueSurface: { backgroundColor: '#132442' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
  border: { borderColor: '#22314a' },
});
