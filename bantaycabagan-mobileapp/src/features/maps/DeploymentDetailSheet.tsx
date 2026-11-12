import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SheetScrollView, SwipeDismissCard } from '../../components/SwipeDismissSheet';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { DeploymentAssignment, PatrolScheduleBlock } from '../../types/operations';

const deploymentTypeLabel = (assignment: DeploymentAssignment) => (
  assignment.deploymentType === 'point'
    ? 'Fixed Post'
    : assignment.deploymentType === 'route'
      ? `Route Patrol${assignment.patrolMode ? ` · ${{ walk: 'Walk Patrol', car: 'Car Patrol', motorcycle: 'Motorcycle Patrol' }[assignment.patrolMode]}` : ''}`
      : 'Area Patrol'
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
  currentBlock, nextBlock, minutesLeft, guidance, onViewNext,
}: {
  assignment: DeploymentAssignment;
  onClose: () => void;
  onViewMap: () => void;
  currentBlock?: PatrolScheduleBlock;
  nextBlock?: PatrolScheduleBlock;
  minutesLeft?: number;
  guidance?: string;
  onViewNext?: () => void;
}) {
  const { colors } = useMobileTheme();
  const { height } = useWindowDimensions();
  const [showSchedule, setShowSchedule] = useState(false);
  const exactLocation = assignment.hasDeploymentPoint !== false
    && Number.isFinite(assignment.latitude)
    && Number.isFinite(assignment.longitude);

  return (
    <SwipeDismissCard key={assignment.id} style={[styles.sheet, { backgroundColor: colors.surface }]} handleColor={colors.border} onClose={onClose}>
      {({ close }) => (
        <SheetScrollView style={{ maxHeight: height * 0.72 }} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.locationIcon}>
              <Icon name="location-on" size={25} color="#FFFFFF" />
            </View>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.mapDuty }]}>CURRENT DEPLOYMENT</Text>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{assignment.patrolArea}</Text>
              <Text style={[styles.type, { color: colors.textMuted }]}>{deploymentTypeLabel(assignment)}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close deployment details"
              onPress={() => close()}
              style={[styles.closeButton, { borderColor: colors.border }]}
            >
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.details, { borderColor: colors.border }]}>
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
            <Detail icon="schedule" label="Full duty" value={formatShift(assignment)} />
            {currentBlock && <Detail icon="timer" label="Current schedule" value={`${currentBlock.label} · ${minutesLeft} minutes remaining`} />}
            {!!assignment.scheduleBlocks?.length && <Detail icon="timer" label="Transition grace period" value={`${assignment.transitionGraceMinutes ?? 10} minutes after a change of area before outside-coverage warnings. Does not extend the duty.`} />}
            {currentBlock?.coverageType === 'custom' && <Detail icon="map" label="Assigned coverage" value={`${currentBlock.radiusMeters} m radius`} />}
            {currentBlock?.coverageType === 'route' && <Detail icon="map" label="Route coverage" value={currentBlock.geometry?.type === 'LineString' && (assignment.patrolMode === 'walk' || currentBlock.roadDirections)
              ? `${currentBlock.routeCorridorMeters ?? 100} m on each side of the assigned route. GPS tolerance also applies.`
              : 'Route boundary unavailable. Follow the assigned route; automatic route warnings are unavailable.'} />}
            {currentBlock?.coverageType === 'barangay' && <Detail icon="map" label="Barangay boundary" value={currentBlock.geometry ? 'PSA indicative boundary. Confirm local coverage with your supervisor.' : 'Boundary unavailable. Follow your assigned barangay; automatic boundary warnings are unavailable.'} />}
            {assignment.vehicleId && <Detail icon="directions-car" label="Vehicle" value={`${assignment.vehicleId.replaceAll('-', ' ')} · Week of ${assignment.vehicleCrew?.weekStart || ''}`} />}
            <Detail
              icon="notes"
              label="Instructions"
              value={assignment.notes?.trim() || 'No additional instructions.'}
            />
          </View>

          {nextBlock && <View style={{ gap: 8 }}>
            <Text style={{ color: colors.text }}>{minutesLeft !== undefined && minutesLeft <= 10 ? `Your schedule at ${currentBlock?.label} is ending soon. Prepare to move to ${nextBlock.label}.` : `Next: ${nextBlock.label}`}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="View next area" onPress={onViewNext} style={[styles.viewMapButton, { backgroundColor: colors.blue }]}>
              <Icon name="directions" size={19} color="#fff" /><Text style={styles.viewMapText}>View next area</Text>
            </TouchableOpacity>
            {!!guidance && <Text style={{ color: colors.textMuted }}>{guidance}</Text>}
          </View>}
          {!!assignment.scheduleBlocks?.length && <>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showSchedule }} style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => setShowSchedule(!showSchedule)}>
              <Text style={{ color: colors.blue }}>{showSchedule ? 'Hide' : 'View'} full duty schedule</Text>
            </TouchableOpacity>
            {showSchedule && assignment.scheduleBlocks.map((block, index) => <Detail key={index} icon="schedule" label={block.label}
              value={`${new Date(Date.parse(assignment.shiftStart!) + block.offsetMinutes * 60000).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} · ${block.durationMinutes} minutes`} />)}
          </>}

          <TouchableOpacity
            accessibilityLabel="View deployment on map"
            onPress={() => close(onViewMap)}
            style={styles.viewMapButton}
          >
            <Icon name="my-location" size={19} color="#FFFFFF" />
            <Text style={styles.viewMapText}>View on Map</Text>
          </TouchableOpacity>
        </SheetScrollView>
      )}
    </SwipeDismissCard>
  );
}

function Detail({ icon, label, value }: {
  icon: 'map' | 'notes' | 'place' | 'schedule' | 'timer' | 'directions-car';
  label: string;
  value: string;
}) {
  const { colors } = useMobileTheme();
  return (
    <View style={styles.detailRow}>
      <Icon name={icon} size={18} color={colors.mapDuty} />
      <View style={styles.detailCopy}>
        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', right: 20, bottom: 104, left: 20, padding: 0,
    borderRadius: 20, backgroundColor: mobileTheme.surface, shadowColor: '#000000',
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
