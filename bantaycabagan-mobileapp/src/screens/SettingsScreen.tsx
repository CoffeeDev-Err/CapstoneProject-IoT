import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../constants/theme';

type SettingsScreenProps = {
  onReload: () => void;
};

export const SettingsScreen = ({ onReload }: SettingsScreenProps) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Development Settings</Text>
      <Text style={styles.subtitle}>Connection and data refresh controls.</Text>

      <View style={styles.card}>
        <Text style={styles.itemTitle}>Shared API</Text>
        <Text style={styles.itemDescription}>
          Personnel and operations are loaded from the BantayCabagan server.
        </Text>
      </View>

      <Pressable style={styles.button} onPress={onReload}>
        <Text style={styles.buttonText}>Refresh Data</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  itemDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    backgroundColor: COLORS.brandDark,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
