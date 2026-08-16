import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Animated } from 'react-native';
import type { DeploymentAssignment, LivePersonnel } from '../types/operations';
import type { GeoSentriMapMode } from '../services/mapTilerConfig';

export type OfficerMapPerson = LivePersonnel & {
  emergencyActive?: boolean;
  operationActive?: boolean;
  outsideBoundary?: boolean;
};

export type OfficerMapCanvasHandle = {
  focusOfficer: (officerId: string) => void;
};

export type OfficerMapCanvasProps = {
  assignment?: DeploymentAssignment;
  currentPersonnelId: string;
  emergencyPulse: Animated.Value;
  enable3D: boolean;
  followedOfficerId: string | null;
  isDark: boolean;
  mapMode: GeoSentriMapMode;
  personnel: OfficerMapPerson[];
  onMapInteractionEnd?: () => void;
  onMapInteractionStart?: () => void;
  onOfficerPress: (officerId: string) => void;
};

const OfficerMapCanvas = forwardRef<OfficerMapCanvasHandle, OfficerMapCanvasProps>((_props, ref) => {
  useImperativeHandle(ref, () => ({ focusOfficer: () => undefined }), []);
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackText}>The native map is available on Android and iOS builds.</Text>
    </View>
  );
});

OfficerMapCanvas.displayName = 'OfficerMapCanvas';

export default OfficerMapCanvas;

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e5e8' },
  fallbackText: { maxWidth: 280, color: '#475569', textAlign: 'center' },
});
