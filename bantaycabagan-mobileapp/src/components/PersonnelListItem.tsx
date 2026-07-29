import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../constants/theme';
import {Personnel} from '../types/personnel';
import { formatTimestamp } from '../utils/dateTime';
import { StatusChip } from './StatusChip';

type PersonnelListItemProps = {
  item: Personnel;
};

export const PersonnelListItem = ({ item }: PersonnelListItemProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.nameWrap}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.unit}>{item.unit}</Text>
        </View>
        <StatusChip status={item.status} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Last seen</Text>
        <Text style={styles.metaValue}>{formatTimestamp(item.lastSeen)}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Location</Text>
        <Text style={styles.metaValue}>{item.location}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Contact</Text>
        <Text style={styles.metaValue}>{item.contact}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  nameWrap: {
    flex: 1,
  },
  name: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  unit: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
});
