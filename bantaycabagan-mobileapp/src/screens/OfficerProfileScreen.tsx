import React from 'react';
import {
  Alert,
  Image,
  ScrollView,
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

export default function OfficerProfileScreen({ navigation }: { navigation: any }) {
  const { deployments, isConnected } = useOperationalContext();
  const assignment = deployments[0];

  const shift = assignment?.shiftStart
    ? `${new Date(assignment.shiftStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${assignment.shiftEnd ? ` - ${new Date(assignment.shiftEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
    : 'Not scheduled';

  const handleLogout = () => {
    navigation.getParent()?.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Icon name="local-police" size={27} color="#ffffff" />
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <Image source={{ uri: CURRENT_OFFICER.photoUrl }} style={styles.avatar} />
          <Text style={styles.name}>{CURRENT_OFFICER.name}</Text>
          <Text style={styles.rank}>{CURRENT_OFFICER.rank}</Text>

          <View style={styles.divider} />
          <ProfileRow label="Personnel ID" value={CURRENT_OFFICER.badge} />
          <View style={styles.divider} />
          <ProfileRow label="Station" value={CURRENT_OFFICER.station} />
          <View style={styles.divider} />
          <ProfileRow
            label="Status"
            value={isConnected ? 'On Duty' : 'Offline'}
            valueStyle={isConnected ? styles.statusOnDuty : styles.statusOffline}
          />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.label}>Current Duty</Text>
            <View style={styles.dutyBadge}>
              <Text style={styles.dutyBadgeText}>{assignment?.patrolArea || 'No assignment'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <ProfileRow label="Shift" value={shift} />
          <View style={styles.divider} />
          <ProfileRow label="Contact" value={CURRENT_OFFICER.contact} />
          {assignment?.notes && (
            <>
              <View style={styles.divider} />
              <View style={styles.notesRow}>
                <Text style={styles.label}>Instructions</Text>
                <Text style={styles.notesValue}>{assignment.notes}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.changePasswordButton}
            onPress={() => Alert.alert('Change password', 'Password management will open after account authentication is connected.')}
          >
            <Icon name="lock-outline" size={19} color="#ffffff" />
            <Text style={styles.actionText}>Change Password</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Icon name="logout" size={19} color="#ffffff" />
            <Text style={styles.actionText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.background },
  header: {
    height: 76,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: mobileTheme.blue,
  },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  headerSpacer: { width: 27 },
  content: { padding: 20, paddingBottom: 118 },
  profileCard: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  avatar: {
    width: 104,
    height: 104,
    borderWidth: 3,
    borderColor: mobileTheme.blue,
    borderRadius: 52,
    backgroundColor: '#e5e5ea',
  },
  name: { marginTop: 14, color: '#111111', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  rank: { marginTop: 3, color: mobileTheme.purple, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  divider: { width: '100%', height: 1, marginVertical: 13, backgroundColor: mobileTheme.border },
  infoRow: {
    width: '100%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  label: { color: '#686868', fontSize: 14 },
  value: { flex: 1, color: '#111111', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  statusOnDuty: { color: mobileTheme.success },
  statusOffline: { color: mobileTheme.warning },
  dutyBadge: {
    maxWidth: '62%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: mobileTheme.blue,
  },
  dutyBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  notesRow: { width: '100%' },
  notesValue: { marginTop: 7, color: mobileTheme.text, fontSize: 12, lineHeight: 18 },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  changePasswordButton: {
    minHeight: 46,
    flex: 1,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 23,
    backgroundColor: mobileTheme.purple,
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  logoutButton: {
    minHeight: 46,
    minWidth: 122,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 23,
    backgroundColor: mobileTheme.blue,
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  actionText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
