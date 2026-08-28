import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SwipeDismissCard } from '../../components/SwipeDismissSheet';
import { mobileTheme } from '../../constants/mobileTheme';
import type { LivePersonnel } from '../../types/operations';

type Props = {
  currentPersonnelId: string;
  emergencyActive: boolean;
  isFollowing: boolean;
  officer: LivePersonnel;
  onClose: () => void;
  onLocate: () => void;
  pulseOpacity: Animated.AnimatedInterpolation<number>;
  pulseScale: Animated.AnimatedInterpolation<number>;
};

export function OfficerDetailSheet({
  currentPersonnelId,
  emergencyActive,
  isFollowing,
  officer,
  onClose,
  onLocate,
  pulseOpacity,
  pulseScale,
}: Props) {
  return (
    <SwipeDismissCard key={officer.id} style={styles.sheet} onClose={onClose}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.profilePhotoWrap}>
            {emergencyActive && (
              <Animated.View style={[
                styles.profilePulseRing,
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]} />
            )}
            <Image
              source={{ uri: officer.photoUrl }}
              cachePolicy="memory"
              style={[styles.profilePhoto, emergencyActive && styles.profilePhotoEmergency]}
            />
          </View>
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{officer.name}</Text>
            <Text style={styles.rank} numberOfLines={1}>{officer.rank}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{officer.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.locationRow}>
          <Icon name="place" size={18} color="#93c5fd" />
          <Text style={styles.locationText} numberOfLines={2}>{officer.locationName}</Text>
          {officer.id !== currentPersonnelId && (
            <TouchableOpacity
              style={[styles.locateButton, isFollowing && styles.locateButtonFollowing]}
              onPress={onLocate}
            >
              <Icon
                name={isFollowing ? 'location-disabled' : 'my-location'}
                size={18}
                color="#ffffff"
              />
              <Text style={styles.locateButtonText}>{isFollowing ? 'Stop' : 'Locate'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.telemetryGrid}>
          <Telemetry icon="speed" label="Speed" value={
            Number.isFinite(officer.speed) ? `${Number(officer.speed).toFixed(1)} km/h` : 'Unavailable'
          } />
          <Telemetry icon="battery-full" label="Battery" value={
            Number.isFinite(officer.batteryLevel)
              ? `${Math.round(Number(officer.batteryLevel))}%`
              : 'Unavailable'
          } />
          <Telemetry icon="schedule" label="GPS time" value={
            officer.locationRecordedAt
              ? new Date(officer.locationRecordedAt).toLocaleString('en-PH', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
              : 'Unavailable'
          } />
        </View>
      </View>
    </SwipeDismissCard>
  );
}

function Telemetry({ icon, label, value }: {
  icon: 'speed' | 'battery-full' | 'schedule';
  label: string;
  value: string;
}) {
  return (
    <View style={styles.telemetryItem}>
      <Icon name={icon} size={16} color="#93a4bd" />
      <Text style={styles.telemetryLabel}>{label}</Text>
      <Text style={styles.telemetryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', right: 20, bottom: 104, left: 20, padding: 0,
    borderRadius: 18, backgroundColor: mobileTheme.navy, shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 12,
  },
  content: { padding: 16, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profilePhotoWrap: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  profilePulseRing: {
    position: 'absolute', width: 62, height: 62, borderWidth: 3,
    borderColor: mobileTheme.danger, borderRadius: 31,
  },
  profilePhoto: {
    width: 62, height: 62, borderWidth: 3, borderColor: '#2563eb',
    borderRadius: 31, backgroundColor: '#ffffff',
  },
  profilePhotoEmergency: { borderColor: mobileTheme.danger },
  identity: { flex: 1 },
  name: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  rank: { marginTop: 3, color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  statusRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2563eb' },
  statusText: { color: '#e2e8f0', fontSize: 11, fontWeight: '700' },
  locationRow: {
    minHeight: 52, marginTop: 13, paddingTop: 12, flexDirection: 'row', alignItems: 'center',
    gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)',
  },
  locationText: { flex: 1, color: '#ffffff', fontSize: 12, lineHeight: 17 },
  telemetryGrid: {
    marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
  },
  telemetryItem: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 },
  telemetryLabel: { width: 62, color: '#93a4bd', fontSize: 11, fontWeight: '700' },
  telemetryValue: { flex: 1, color: '#ffffff', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  locateButton: {
    minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, borderRadius: 20, backgroundColor: mobileTheme.purple,
  },
  locateButtonFollowing: { backgroundColor: '#475569' },
  locateButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
