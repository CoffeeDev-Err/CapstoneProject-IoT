import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReportLocationMap from './ReportLocationMap';
import { mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';

const CABAGAN_CENTER = { latitude: 17.4269, longitude: 121.7653 };

type Coordinates = {
  latitude: number;
  longitude: number;
};

type ReportLocationPickerModalProps = {
  visible: boolean;
  initialLatitude?: number;
  initialLongitude?: number;
  onClose: () => void;
  onConfirm: (coordinates: Coordinates) => void;
};

const isCoordinate = (value?: number) => typeof value === 'number' && Number.isFinite(value);

export function ReportLocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  onClose,
  onConfirm,
}: ReportLocationPickerModalProps) {
  const { colors, isDark } = useMobileTheme();
  const initialCoordinates = useMemo<Coordinates>(() => ({
    latitude: isCoordinate(initialLatitude) ? initialLatitude as number : CABAGAN_CENTER.latitude,
    longitude: isCoordinate(initialLongitude) ? initialLongitude as number : CABAGAN_CENTER.longitude,
  }), [initialLatitude, initialLongitude]);
  const [selectedCoordinates, setSelectedCoordinates] = useState<Coordinates | null>(
    isCoordinate(initialLatitude) && isCoordinate(initialLongitude) ? initialCoordinates : null,
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedCoordinates(
      isCoordinate(initialLatitude) && isCoordinate(initialLongitude) ? initialCoordinates : null,
    );
  }, [initialCoordinates, initialLatitude, initialLongitude, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <View style={[styles.header, isDark && styles.borderDark]}>
          <TouchableOpacity style={[styles.cancelButton, isDark && styles.buttonDark]} onPress={onClose}>
            <Text style={[styles.cancelText, isDark && styles.textDark]}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, isDark && styles.textDark]}>Pin incident location</Text>
            <Text style={[styles.subtitle, isDark && styles.mutedDark]}>Tap the map or drag the red pin to the actual scene.</Text>
          </View>
        </View>

        <View style={styles.mapFrame}>
          <ReportLocationMap
            key={`${initialCoordinates.latitude}:${initialCoordinates.longitude}:${visible}`}
            initialCoordinates={initialCoordinates}
            selectedCoordinates={selectedCoordinates}
            isDark={isDark}
            onSelect={setSelectedCoordinates}
          />
        </View>

        <View style={[styles.footer, isDark && styles.borderDark]}>
          <View style={styles.coordinateCopy}>
            <Text style={[styles.coordinateLabel, isDark && styles.mutedDark]}>SELECTED COORDINATES</Text>
            <Text style={[styles.coordinateValue, isDark && styles.textDark]}>
              {selectedCoordinates
                ? `${selectedCoordinates.latitude.toFixed(6)}, ${selectedCoordinates.longitude.toFixed(6)}`
                : 'Tap the map to place a pin'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.confirmButton, !selectedCoordinates && styles.confirmButtonDisabled]}
            disabled={!selectedCoordinates}
            onPress={() => selectedCoordinates && onConfirm(selectedCoordinates)}
          >
            <Icon name="check" size={20} color="#ffffff" />
            <Text style={styles.confirmText}>Use this location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mobileTheme.background },
  screenDark: { backgroundColor: '#050b18' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: mobileTheme.border, backgroundColor: mobileTheme.surface },
  borderDark: { borderColor: '#22314a', backgroundColor: '#0b1528' },
  cancelButton: { minWidth: 64, height: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 10, backgroundColor: mobileTheme.background },
  cancelText: { color: mobileTheme.text, fontSize: 12, fontWeight: '800' },
  buttonDark: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  headerCopy: { flex: 1 },
  title: { color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  subtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11, lineHeight: 16 },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#9eabc0' },
  mapFrame: { flex: 1, overflow: 'hidden' },
  footer: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: mobileTheme.border, backgroundColor: mobileTheme.surface },
  coordinateCopy: { minHeight: 42 },
  coordinateLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  coordinateValue: { marginTop: 4, color: mobileTheme.text, fontSize: 13, fontWeight: '700' },
  confirmButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: mobileTheme.blue },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
