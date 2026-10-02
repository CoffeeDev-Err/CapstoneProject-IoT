import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SwipeDismissCard } from '../../components/SwipeDismissSheet';
import { mobileTheme } from '../../constants/mobileTheme';
import type { DeploymentAssignment } from '../../types/operations';

const deploymentTypeLabel = (assignment: DeploymentAssignment) => (
  assignment.deploymentType === 'point'
    ? 'Fixed Post'
    : assignment.deploymentType === 'route' ? 'Route Patrol' : 'Area Patrol'
);

const formatShift = (assignment: DeploymentAssignment) => {
  const start = assignment.shiftStart ? new Date(assignment.shiftStart) : null;
  const end = assignment.shiftEnd ? new Date(assignment.shiftEnd) : null;
  const validStart = start && !Number.isNaN(start.getTime());
  const validEnd = end && !Number.isNaN(end.getTime());
  if (!validStart && !validEnd) return 'Current active shift';
  const date = validStart ? start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const time = (value: Date) => value.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${date}${validStart ? ` · ${time(start)}` : ''}${validEnd ? ` – ${time(end)}` : ''}`;
};

export function DeploymentDetailSheet({
  assignment,
  onClose,
  onViewMap,
}: {
  assignment: DeploymentAssignment;
  onClose: () => void;
  onViewMap: () => void;
}) {
  const exactLocation = assignment.hasDeploymentPoint !== false
    && Number.isFinite(assignment.latitude)
    && Number.isFinite(assignment.longitude);

  return (
    <SwipeDismissCard key={assignment.id} style={styles.sheet} onClose={onClose}>
      {({ close }) => (
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.locationIcon}>
              <Icon name="location-on" size={25} color="#FFFFFF" />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>CURRENT DEPLOYMENT</Text>
              <Text style={styles.title} numberOfLines={2}>{assignment.patrolArea}</Text>
              <Text style={styles.type}>{deploymentTypeLabel(assignment)}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close deployment details"
              onPress={() => close()}
              style={styles.closeButton}
            >
              <Icon name="close" size={20} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <View style={styles.details}>
            <Detail
              icon="place"
              label={assignment.deploymentType === 'route' ? 'Starting point' : 'Deployment point'}
              value={exactLocation
                ? assignment.deploymentPointLabel || 'Selected map point'
                : assignment.deploymentType === 'area' ? 'Whole assigned patrol area' : 'No starting point set'}
            />
            <Detail
              icon="map"
              label="Coverage"
              value={assignment.coverageBarangays?.length
                ? assignment.coverageBarangays.join(', ')
                : assignment.patrolArea}
            />
            <Detail icon="schedule" label="Shift" value={formatShift(assignment)} />
            <Detail
              icon="notes"
              label="Instructions"
              value={assignment.notes?.trim() || 'No additional instructions.'}
            />
          </View>

          <TouchableOpacity
            accessibilityLabel="View deployment on map"
            onPress={() => close(onViewMap)}
            style={styles.viewMapButton}
          >
            <Icon name="my-location" size={19} color="#FFFFFF" />
            <Text style={styles.viewMapText}>View on Map</Text>
          </TouchableOpacity>
        </View>
      )}
    </SwipeDismissCard>
  );
}

function Detail({ icon, label, value }: {
  icon: 'map' | 'notes' | 'place' | 'schedule';
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Icon name={icon} size={18} color="#93C5FD" />
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', right: 20, bottom: 104, left: 20, padding: 0,
    borderRadius: 20, backgroundColor: mobileTheme.navy, shadowColor: '#000000',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 13,
  },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationIcon: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#60A5FA', borderRadius: 15, backgroundColor: '#2563EB',
  },
  headingCopy: { flex: 1 },
  eyebrow: { color: '#93C5FD', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  title: { marginTop: 3, color: '#FFFFFF', fontSize: 16, fontWeight: '900', lineHeight: 20 },
  type: { marginTop: 3, color: '#CBD5E1', fontSize: 11, fontWeight: '700' },
  closeButton: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 18,
  },
  details: {
    marginTop: 14, paddingVertical: 5, borderTopWidth: 1,
    borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  detailRow: { minHeight: 46, paddingVertical: 7, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailCopy: { flex: 1 },
  detailLabel: { color: '#93A4BD', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { marginTop: 3, color: '#F8FAFC', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  viewMapButton: {
    minHeight: 46, marginTop: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: '#2563EB',
  },
  viewMapText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
