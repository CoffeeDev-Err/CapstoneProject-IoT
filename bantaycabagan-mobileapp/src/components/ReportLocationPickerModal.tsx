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
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
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

  const html = useMemo(() => `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; background: #dce5ef; }
      .leaflet-control-attribution { font: 9px system-ui, sans-serif; }
      .incident-pin { width: 20px; height: 20px; border: 3px solid white; border-radius: 50% 50% 50% 0; background: #ef4444; box-shadow: 0 2px 8px rgba(15,23,42,.35); transform: rotate(-45deg); }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const initial = [${initialCoordinates.latitude}, ${initialCoordinates.longitude}];
      const hasInitialPin = ${isCoordinate(initialLatitude) && isCoordinate(initialLongitude)};
      const map = L.map('map', { zoomControl: true }).setView(initial, hasInitialPin ? 17 : 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      const icon = L.divIcon({ className: '', html: '<div class="incident-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
      let marker = hasInitialPin ? L.marker(initial, { icon, draggable: true }).addTo(map) : null;
      const send = (latlng) => window.ReactNativeWebView.postMessage(JSON.stringify({ latitude: latlng.lat, longitude: latlng.lng }));
      const place = (latlng) => {
        if (!marker) {
          marker = L.marker(latlng, { icon, draggable: true }).addTo(map);
          marker.on('dragend', () => send(marker.getLatLng()));
        } else {
          marker.setLatLng(latlng);
        }
        send(latlng);
      };
      map.on('click', (event) => place(event.latlng));
      if (marker) marker.on('dragend', () => send(marker.getLatLng()));
    </script>
  </body>
</html>`, [initialCoordinates, initialLatitude, initialLongitude]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const coordinates = JSON.parse(event.nativeEvent.data) as Coordinates;
      if (isCoordinate(coordinates.latitude) && isCoordinate(coordinates.longitude)) {
        setSelectedCoordinates(coordinates);
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <View style={[styles.header, isDark && styles.borderDark]}>
          <TouchableOpacity style={[styles.iconButton, isDark && styles.buttonDark]} onPress={onClose}>
            <Icon name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, isDark && styles.textDark]}>Pin incident location</Text>
            <Text style={[styles.subtitle, isDark && styles.mutedDark]}>Tap the map or drag the red pin to the actual scene.</Text>
          </View>
        </View>

        <View style={styles.mapFrame}>
          <WebView
            key={`${initialCoordinates.latitude}:${initialCoordinates.longitude}:${visible}`}
            source={{ html }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMessage}
            style={styles.map}
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
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 10, backgroundColor: mobileTheme.background },
  buttonDark: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  headerCopy: { flex: 1 },
  title: { color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  subtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11, lineHeight: 16 },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#9eabc0' },
  mapFrame: { flex: 1, overflow: 'hidden' },
  map: { flex: 1, backgroundColor: '#dce5ef' },
  footer: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: mobileTheme.border, backgroundColor: mobileTheme.surface },
  coordinateCopy: { minHeight: 42 },
  coordinateLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  coordinateValue: { marginTop: 4, color: mobileTheme.text, fontSize: 13, fontWeight: '700' },
  confirmButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: mobileTheme.blue },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
