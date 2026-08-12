import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type ReportMapCoordinates = {
  latitude: number;
  longitude: number;
};

export type ReportLocationMapProps = {
  initialCoordinates: ReportMapCoordinates;
  isDark: boolean;
  selectedCoordinates: ReportMapCoordinates | null;
  onSelect: (coordinates: ReportMapCoordinates) => void;
};

export default function ReportLocationMap({
  initialCoordinates,
  selectedCoordinates,
  onSelect,
}: ReportLocationMapProps) {
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
      const hasInitialPin = ${Boolean(selectedCoordinates)};
      const map = L.map('map', { zoomControl: true }).setView(initial, hasInitialPin ? 17 : 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
</html>`, [initialCoordinates, selectedCoordinates]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const coordinates = JSON.parse(event.nativeEvent.data) as ReportMapCoordinates;
      if (Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)) {
        onSelect(coordinates);
      }
    } catch {
      // Ignore malformed messages from the embedded web fallback.
    }
  };

  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      onMessage={handleMessage}
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#dce5ef' },
});

