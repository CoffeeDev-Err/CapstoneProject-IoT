import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { getGpsReadingStatus } from '../../utils/gpsReading';

export function GpsReadingAge({ recordedAt, color = '#cbd5e1', shiftStart, compact = false }: {
  recordedAt?: string | null;
  color?: string;
  shiftStart?: string | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { label, delayed } = getGpsReadingStatus(recordedAt, now, shiftStart);
  const displayLabel = compact
    ? (label === 'GPS reading: unavailable'
      ? 'Awaiting GPS fix'
      : label.replace('GPS reading:', 'Last GPS:').replace(' · Delayed', ''))
    : label;
  return <Text numberOfLines={compact ? 1 : undefined} style={[
    styles.text, { color }, delayed && (compact ? styles.compactDelayed : styles.delayed),
  ]}>{displayLabel}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 11, lineHeight: 17, fontWeight: '600' },
  delayed: { color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 5 },
  compactDelayed: { color: '#fbbf24' },
});
