import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { ReportEvidenceInput } from '../../types/operations';

type ReportEvidenceFieldProps = {
  evidence: ReportEvidenceInput | null;
  onCapture: () => void;
  onRemove: () => void;
};

export function ReportEvidenceField({ evidence, onCapture, onRemove }: ReportEvidenceFieldProps) {
  const { colors, isDark } = useMobileTheme();
  if (!evidence) {
    return (
      <TouchableOpacity style={[styles.captureButton, isDark && { backgroundColor: colors.surfaceMuted }]}
        onPress={onCapture}>
        <View style={styles.captureIcon}><Icon name="photo-camera" size={22} color={mobileTheme.purple} /></View>
        <View style={styles.captureCopy}>
          <Text style={[styles.captureTitle, { color: colors.text }]}>Capture evidence</Text>
          <Text style={[styles.captureMeta, { color: colors.textMuted }]}>Use the front or back camera. Maximum upload: 5 MB.</Text>
        </View>
        <Icon name="chevron-right" size={22} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.preview, isDark && { backgroundColor: colors.surfaceMuted }]}>
      <Image source={{ uri: evidence.uri }} style={styles.previewImage} />
      <View style={styles.previewInfo}>
        <View style={styles.previewCopy}>
          <Text style={[styles.previewTitle, { color: colors.text }]}>Photo ready</Text>
          <Text style={[styles.previewMeta, { color: colors.textMuted }]}>
            {evidence.camera_facing === 'front' ? 'Front camera' : 'Back camera'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.removeButton, { borderColor: colors.border }]}
          onPress={onRemove} accessibilityLabel="Remove photo evidence">
          <Icon name="delete-outline" size={20} color={mobileTheme.danger} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.retakeButton} onPress={onCapture}>
        <Icon name="cameraswitch" size={18} color={mobileTheme.purple} />
        <Text style={styles.retakeText}>Retake photo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { overflow: 'hidden', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  previewImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: mobileTheme.background },
  previewInfo: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewCopy: { flex: 1 },
  previewTitle: { fontSize: 13, fontWeight: '800' },
  previewMeta: { marginTop: 2, fontSize: 10 },
  removeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8 },
  retakeButton: { minHeight: 42, marginHorizontal: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, backgroundColor: mobileTheme.purpleSoft },
  retakeText: { color: mobileTheme.purple, fontSize: 11, fontWeight: '800' },
  captureButton: { minHeight: 76, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  captureIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: mobileTheme.purpleSoft },
  captureCopy: { flex: 1 },
  captureTitle: { fontSize: 12, fontWeight: '800' },
  captureMeta: { marginTop: 3, fontSize: 9, lineHeight: 14 },
});
