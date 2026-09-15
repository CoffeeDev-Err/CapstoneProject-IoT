import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SwipeDismissSheet } from '../../components/SwipeDismissSheet';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { getGpsTrackingReminderState } from './gpsTrackingReminderState';

type GpsTrackingReminderProps = {
  assignment?: DeploymentAssignment;
  isConnected: boolean;
  officer: LivePersonnel;
  onRefresh: () => Promise<void>;
};

export function GpsTrackingReminder({
  assignment,
  isConnected,
  officer,
  onRefresh,
}: GpsTrackingReminderProps) {
  const { colors, isDark } = useMobileTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const reminder = useMemo(() => getGpsTrackingReminderState({
    assignment,
    officer,
    now,
  }), [assignment, now, officer]);

  useEffect(() => {
    if (!reminder) setModalVisible(false);
  }, [reminder]);

  if (!reminder) return null;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setNow(Date.now());
      setRefreshing(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="GPS tracking unavailable. View reminder"
        activeOpacity={0.78}
        style={[
          styles.banner,
          {
            backgroundColor: colors.warningSoft,
            borderColor: colors.warning,
          },
        ]}
        onPress={() => setModalVisible(true)}
      >
        <View style={[styles.bannerIcon, { backgroundColor: colors.warning }]}>
          <Icon name="gps-off" size={19} color="#ffffff" />
        </View>
        <View style={styles.bannerCopy}>
          <Text style={[styles.bannerTitle, { color: colors.text }]}>GPS tracking unavailable</Text>
          <Text style={[styles.bannerText, { color: colors.textMuted }]}>Tap to view tracker reminder</Text>
        </View>
        <Icon name="chevron-right" size={21} color={colors.warning} />
      </TouchableOpacity>

      <SwipeDismissSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        sheetStyle={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {({ close }) => (
          <View style={styles.modalContent}>
            <View style={styles.modalHeading}>
              <View style={[styles.modalIcon, { backgroundColor: colors.warningSoft }]}>
                <Icon name="gps-off" size={24} color={colors.warning} />
              </View>
              <View style={styles.modalHeadingCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.warning }]}>ACTIVE DEPLOYMENT</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>GPS Tracking Required</Text>
              </View>
            </View>

            <Text style={[styles.modalIntro, { color: colors.textMuted }]}>
              GeoSentri has not received a current location from your assigned GPS tracker.
            </Text>

            <View style={[styles.statusCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <Text style={[styles.statusLabel, { color: colors.textMuted }]}>CURRENT STATUS</Text>
              <Text style={[styles.statusText, { color: colors.text }]}>{reminder.statusText}</Text>
              {!isConnected && (
                <Text style={[styles.connectionText, { color: colors.warning }]}>
                  The app is offline and cannot confirm whether tracking has recovered.
                </Text>
              )}
            </View>

            <View style={[
              styles.reminderCard,
              {
                backgroundColor: isDark ? '#2b220d' : '#fffbeb',
                borderColor: colors.warning,
              },
            ]}>
              <View style={styles.reminderHeading}>
                <Icon name="lightbulb" size={18} color={colors.warning} />
                <Text style={[styles.reminderLabel, { color: colors.warning }]}>REMINDER</Text>
              </View>
              <Text style={[styles.reminderText, { color: colors.text }]}>
                Keep your assigned GPS tracker powered on, charged, connected to mobile data, and with you throughout your duty. If the signal is weak, move to an open area and wait for the next update.
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.closeButton, { borderColor: colors.danger }]}
                onPress={() => close()}
              >
                <Text style={[styles.closeButtonText, { color: colors.danger }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityState={{ busy: refreshing, disabled: refreshing }}
                style={[styles.refreshButton, refreshing && styles.disabledButton]}
                onPress={() => { void handleRefresh(); }}
                disabled={refreshing}
              >
                {refreshing ? <ActivityIndicator size="small" color="#ffffff" /> : <Icon name="refresh" size={18} color="#ffffff" />}
                <Text style={styles.refreshButtonText}>{refreshing ? 'Checking...' : 'Check Again'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SwipeDismissSheet>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 14,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  bannerCopy: { flex: 1, minWidth: 0 },
  bannerTitle: { fontSize: 12, fontWeight: '800' },
  bannerText: { marginTop: 2, fontSize: 10, fontWeight: '600' },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: mobileTheme.surface,
  },
  modalContent: { padding: 20, paddingTop: 4, paddingBottom: 30 },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  modalIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  modalHeadingCopy: { flex: 1 },
  modalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  modalTitle: { marginTop: 2, fontSize: 19, fontWeight: '800' },
  modalIntro: { marginTop: 13, fontSize: 12, lineHeight: 18 },
  statusCard: { marginTop: 13, padding: 13, borderWidth: 1, borderRadius: 10 },
  statusLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  statusText: { marginTop: 5, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  connectionText: { marginTop: 6, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  reminderCard: { marginTop: 12, padding: 13, borderWidth: 1, borderRadius: 10 },
  reminderHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reminderLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  reminderText: { marginTop: 7, fontSize: 12, lineHeight: 18 },
  actions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  closeButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  closeButtonText: { fontSize: 12, fontWeight: '800' },
  refreshButton: {
    minHeight: 44,
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    backgroundColor: mobileTheme.blue,
  },
  refreshButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  disabledButton: { opacity: 0.62 },
});
