import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { mobileFontFamily, mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';

export function PolicePageHeader() {
  const { colors, isDark } = useMobileTheme();

  return (
    <View style={[styles.header, isDark && styles.headerDark]}>
      <Image
        source={require('../../assets/pnp-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.identity}>
        <Text style={[styles.title, { color: colors.text }]}>Philippine National Police</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Cabagan Police Station</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderSoft,
    backgroundColor: '#ffffff',
  },
  headerDark: {
    borderBottomColor: '#22314a',
    backgroundColor: '#0b1528',
  },
  logo: {
    width: 24,
    height: 30,
  },
  identity: {
    flex: 1,
  },
  title: {
    color: mobileTheme.text,
    fontFamily: mobileFontFamily,
    fontSize: 13,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 1,
    color: mobileTheme.textMuted,
    fontFamily: mobileFontFamily,
    fontSize: 9,
    fontWeight: '500',
  },
});
