import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../constants/theme';

type StatCardProps = {
  label: string;
  value: number
  accent: string;
}

export const StatCard = ({ label, value, accent }: StatCardProps) => {
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    minHeight: 96,
  },
  accent: {
    width: 28,
    height: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
