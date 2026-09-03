import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileFontFamily, mobileTheme } from '../constants/mobileTheme';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAuth } from '../context/AuthContext';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import { resolveApiAssetUrl } from '../services/operationsApi';
import { cleanupOrphanedPickerEvidence } from '../services/offlineReportQueue';
import { clearMapCache } from '../services/mapCache';

const formatAccountDate = (value?: string, includeTime = false) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString([], includeTime
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function OfficerProfileScreen() {
  const { currentOfficer, deployments } = useOperationalContext();
  const { clearSession, logout, token, user } = useAuth();
  const { isDark, toggleTheme } = useMobileTheme();
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const assignment = deployments.find((item) => item.isCurrentShift !== false);
  const profile = user?.profile;
  const officer = {
    name: currentOfficer.name,
    rank: currentOfficer.rank,
    badge: currentOfficer.badge || profile?.badgeNumber || user?.personnelId || '-',
    station: 'Cabagan Police Station',
    contact: profile?.mobileNumber || 'Not provided',
    email: user?.email || 'Not provided',
    photoUrl: resolveApiAssetUrl(currentOfficer.photoUrl),
  };

  const shift = assignment?.shiftStart
    ? `${new Date(assignment.shiftStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${assignment.shiftEnd ? ` - ${new Date(assignment.shiftEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
    : 'Not scheduled';

  const clearDownloadedCache = () => {
    Alert.alert(
      'Clear downloaded cache?',
      'Cached maps and viewed images will be downloaded again. Pending offline reports and evidence will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear cache',
          onPress: async () => {
            try {
              await Promise.all([
                clearMapCache(),
                Image.clearDiskCache(),
                cleanupOrphanedPickerEvidence(),
              ]);
              Alert.alert('Cache cleared', 'Pending offline reports and evidence were preserved.');
            } catch {
              Alert.alert('Unable to clear cache', 'Try again after closing the map and report viewer.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Image source={{ uri: officer.photoUrl }} cachePolicy="memory" style={styles.avatar} />
          <View style={styles.nameLine}>
            <Text style={[styles.name, isDark && styles.textDark]}>{officer.name}</Text>
            {user?.emailVerified && (
              <Icon name="verified" size={18} color={mobileTheme.blue}/>
            )}
          </View>
          <Text style={styles.rank}>{officer.rank}</Text>
        </View>

        <DetailSection title="Personal details">
          <DetailRow label="Badge number" value={officer.badge} />
          <DetailRow label="Station" value={officer.station} />
          <DetailRow label="Phone number" value={officer.contact} />
          <DetailRow label="Email" value={officer.email} />
        </DetailSection>

        <DetailSection title="Account details">
          <DetailRow label="Login ID" value={user?.username || 'Not available'} />
          <DetailRow label="Account created" value={formatAccountDate(user?.createdAt)} />
          <DetailRow label="Last login" value={formatAccountDate(user?.lastLoginAt, true)} />
          <DetailRow
            label="Duty status"
            value={currentOfficer.status}
            valueStyle={currentOfficer.status === 'Off Duty'
              ? styles.statusOffline
              : styles.statusOnDuty}
          />
          <DetailRow
            label="Account verification"
            value={user?.emailVerified ? 'Verified' : 'Pending'}
            valueStyle={user?.emailVerified ? styles.statusOnDuty : styles.statusOffline}
          />
          <DetailRow label="Current deployment" value={assignment?.patrolArea || 'No active deployment'} />
          <DetailRow label="Shift" value={shift} isLast />
        </DetailSection>

        {assignment?.notes && (
          <DetailSection title="Assignment instructions">
            <Text style={[styles.instructions, isDark && styles.mutedDark]}>{assignment.notes}</Text>
          </DetailSection>
        )}

        <DetailSection title="Preferences">
          <View style={[styles.themeRow, isDark && styles.themeRowDark]}>
            <View style={[styles.themeIcon, isDark && styles.themeIconDark]}>
              <Icon
                name={isDark ? 'dark-mode' : 'light-mode'}
                size={21}
                color={isDark ? '#7aa7ff' : mobileTheme.blue}
              />
            </View>
            <View style={styles.themeCopy}>
              <Text style={[styles.themeTitle, isDark && styles.textDark]}>Dark Theme</Text>
              <Text style={[styles.themeDescription, isDark && styles.mutedDark]}>
                Switch between light and dark appearance.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Toggle dark theme"
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: mobileTheme.border, true: mobileTheme.blue }}
              thumbColor="#ffffff"
            />
          </View>
        </DetailSection>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
            onPress={clearDownloadedCache}
          >
            <Icon name="cleaning-services" size={20} color={mobileTheme.blue} />
            <Text style={styles.secondaryButtonText}>Clear Downloaded Cache</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
            onPress={() => setPasswordModalOpen(true)}
          >
            <Icon name="lock-outline" size={20} color={mobileTheme.blue} />
            <Text style={styles.secondaryButtonText}>Change Password</Text>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" style={styles.logoutButton} onPress={logout}>
            <Icon name="logout" size={20} color="#ffffff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {token && (
        <ChangePasswordModal
          visible={passwordModalOpen}
          token={token}
          onClose={() => setPasswordModalOpen(false)}
          onChanged={() => {
            setPasswordModalOpen(false);
            clearSession();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const { isDark } = useMobileTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({
  isLast = false,
  label,
  value,
  valueStyle,
}: {
  isLast?: boolean;
  label: string;
  value: string;
  valueStyle?: object;
}) {
  const { isDark } = useMobileTheme();
  return (
    <View style={[
      styles.detailRow,
      isDark && styles.detailRowDark,
      isLast && styles.detailRowLast,
    ]}>
      <Text style={[styles.label, isDark && styles.mutedDark]}>{label}</Text>
      <Text style={[styles.value, isDark && styles.textDark, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    fontFamily: mobileFontFamily,
  },
  content: { paddingBottom: 110 },
  identity: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 26, paddingBottom: 24 },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: mobileTheme.surfaceMuted,
  },
  nameLine: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: mobileTheme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  rank: { marginTop: 5, color: mobileTheme.blue, fontSize: 12, fontWeight: '700' },
  section: { paddingHorizontal: 22, paddingTop: 14 },
  sectionTitle: { marginBottom: 8, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  sectionBody: { width: '100%' },
  detailRow: {
    minHeight: 48,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderSoft,
    gap: 18,
  },
  detailRowLast: { borderBottomWidth: 0 },
  label: { width: '39%', color: mobileTheme.textMuted, fontSize: 13, lineHeight: 20 },
  value: {
    flex: 1,
    color: mobileTheme.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'left',
  },
  statusOnDuty: { color: mobileTheme.success },
  statusOffline: { color: mobileTheme.warning },
  instructions: { color: mobileTheme.textMuted, fontSize: 13, lineHeight: 20 },
  themeRow: {
    minHeight: 66,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderSoft,
  },
  themeRowDark: { borderBottomColor: '#22314a' },
  themeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: mobileTheme.blueSoft,
  },
  themeIconDark: { backgroundColor: '#132442' },
  themeCopy: { flex: 1 },
  themeTitle: { color: mobileTheme.text, fontSize: 13, fontWeight: '700' },
  themeDescription: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 10 },
  actions: { paddingHorizontal: 22, paddingTop: 26, gap: 10 },
  secondaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.blue,
    borderRadius: 8,
    gap: 8,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { color: mobileTheme.blue, fontSize: 14, fontWeight: '800' },
  secondaryButtonDark: { backgroundColor: '#0b1528' },
  logoutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 8,
    backgroundColor: mobileTheme.navy,
  },
  logoutButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  containerDark: { backgroundColor: '#050b18' },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#9eabc0' },
  detailRowDark: { borderBottomColor: '#22314a' },
});
