import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';
import {
  confirmPasswordChange,
  requestPasswordChange,
  type VerificationChallenge,
} from '../services/authApi';

const isStrongPassword = (value: string) => (
  value.length >= 10
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
);

type Props = {
  visible: boolean;
  token: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function ChangePasswordModal({
  visible,
  token,
  onClose,
  onChanged,
}: Props) {
  const { colors, isDark } = useMobileTheme();
  const [step, setStep] = useState<'password' | 'verify'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep('password');
      setCurrentPassword('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setChallenge(null);
      setError('');
    }
  }, [visible]);

  const requestCode = async () => {
    setPending(true);
    setError('');
    try {
      const response = await requestPasswordChange(token, currentPassword);
      setChallenge(response);
      setStep('verify');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed.');
    } finally {
      setPending(false);
    }
  };

  const updatePassword = async () => {
    if (!challenge) return;
    if (!isStrongPassword(newPassword)) {
      setError('Use 10+ characters with upper, lower, number, and symbol.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await confirmPasswordChange(token, challenge.challengeId, code, newPassword);
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, isDark && darkStyles.sheet]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, isDark && darkStyles.text]}>Change Password</Text>
              <Text style={[styles.subtitle, isDark && darkStyles.muted]}>
                {step === 'password'
                  ? 'Confirm your current password.'
                  : `Enter the code sent to ${challenge?.maskedEmail}.`}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {step === 'password' ? (
            <Field
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
          ) : (
            <>
              <Field
                label="Verification Code"
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
              />
              <Field
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Field
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {challenge?.debugCode && (
                <Text style={styles.debugCode}>Development code: {challenge.debugCode}</Text>
              )}
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.submit, pending && styles.disabled]}
            onPress={step === 'password' ? requestCode : updatePassword}
            disabled={pending}
          >
            {pending
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.submitText}>{step === 'password' ? 'Send Code' : 'Update Password'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  const { colors, isDark } = useMobileTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, isDark && darkStyles.muted]}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[styles.input, isDark && darkStyles.input]}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(17,17,47,0.55)',
  },
  sheet: {
    borderRadius: 8,
    padding: 20,
    backgroundColor: mobileTheme.surface,
  },
  header: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { color: mobileTheme.text, fontSize: 20, fontWeight: '800' },
  subtitle: { maxWidth: 280, marginTop: 4, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 13 },
  label: { marginBottom: 6, color: mobileTheme.textMuted, fontSize: 12, fontWeight: '700' },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    paddingHorizontal: 13,
    backgroundColor: '#fafbff',
    color: mobileTheme.text,
    fontSize: 14,
  },
  error: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 10,
    backgroundColor: mobileTheme.dangerSoft,
    color: '#b42318',
    fontSize: 12,
  },
  debugCode: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 10,
    backgroundColor: mobileTheme.warningSoft,
    color: mobileTheme.warning,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  submit: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: mobileTheme.blue,
  },
  disabled: { opacity: 0.65 },
  submitText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});

const darkStyles = StyleSheet.create({
  sheet: { borderWidth: 1, borderColor: '#22314a', backgroundColor: '#0b1528' },
  input: { borderColor: '#2a3a56', backgroundColor: '#0e1a30', color: '#f8fafc' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
});
