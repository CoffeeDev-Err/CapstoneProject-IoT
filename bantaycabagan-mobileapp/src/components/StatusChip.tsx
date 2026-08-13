import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../constants/theme';
import { PersonnelStatus } from '../types/personnel';

type StatusChipProps = {
  status: PersonnelStatus;
};

const STATUS_THEME: Record<PersonnelStatus, { label: string; background: string; text: string }> = {
  IN_FIELD: {
    label: 'In Field',
    background: '#DBEAFE',
    text: COLORS.online,
  },
  AT_BASE: {
    label: 'At Base',
    background: '#DBEAFE',
    text: COLORS.idle,
  },
  OFF_DUTY: {
    label: 'Off Duty',
    background: '#F1F5F9',
    text: COLORS.offline,
  },
};

export const StatusChip = ({ status }: StatusChipProps) => {
  const theme = STATUS_THEME[status];

  return (
    <View style={[styles.chip, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text }]}>{theme.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
