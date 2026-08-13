import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../constants/mobileTheme';
import { useMobileTheme } from '../context/ThemeContext';
import { SwipeDismissSheet } from './SwipeDismissSheet';
import VerificationCodeInput from './VerificationCodeInput';
import {
  confirmPasswordChange,
  requestPasswordChange,
  resendVerificationCode,
  type VerificationChallenge,
} from '../services/authApi';

const isStrongPassword = (value: string) => (
  value.length >= 10
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
);

const PASSWORD_REQUIREMENTS = 'Use at least 10 characters, including an uppercase letter, lowercase letter, number, and symbol.';

type Props = {
  visible: boolean;
  token: string;
  onClose: () => void;
  onChanged: () => void;
};

type SheetClose = (afterClose?: () => void) => void;

export default function ChangePasswordModal({
  visible,
  token,
  onClose,
  onChanged,
}: Props) {
  const { isDark } = useMobileTheme();
  const [step, setStep] = useState<'password' | 'verify'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
      setMessage('');
    }
  }, [visible]);

  const requestCode = async () => {
    setError('');
    setMessage('');
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    setPending(true);
    try {
      const response = await requestPasswordChange(token, currentPassword);
      setChallenge(response);
      setStep('verify');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send a verification code. Try again.');
    } finally {
      setPending(false);
    }
  };

  const updatePassword = async (close: SheetClose) => {
    if (!challenge) return;
    setError('');
    setMessage('');
    if (code.length !== 6) {
      setError('Enter the complete 6-digit verification code.');
      return;
    }
    if (!newPassword) {
      setError('Enter a new password.');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS);
      return;
    }
    if (!confirmPassword) {
      setError('Confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current password.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await confirmPasswordChange(token, challenge.challengeId, code, newPassword);
      close(onChanged);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update your password. Try again.');
    } finally {
      setPending(false);
    }
  };

  const resendCode = async () => {
    if (!challenge) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await resendVerificationCode(challenge.challengeId);
      setChallenge(response);
      setCode('');
      setMessage(`A new code was sent to ${response.maskedEmail}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to resend the verification code. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <SwipeDismissSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={[styles.sheet, isDark && darkStyles.sheet]}
    >
      {({ close }) => (
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.step}>Step {step === 'password' ? '1' : '2'} of 2</Text>
              <Text style={[styles.title, isDark && darkStyles.text]}>Change Password</Text>
              <Text style={[styles.subtitle, isDark && darkStyles.muted]}>
                {step === 'password'
                  ? 'Confirm your current password.'
                  : `Enter the code sent to ${challenge?.maskedEmail}.`}
              </Text>
            </View>
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
              <VerificationCodeInput
                value={code}
                onChangeText={setCode}
                dark={isDark}
                invalid={Boolean(error && /code|verification/i.test(error))}
              />
              <Field
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Text style={[styles.passwordRequirements, isDark && darkStyles.muted]}>
                {PASSWORD_REQUIREMENTS}
              </Text>
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

          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {message ? <Text style={styles.success} accessibilityRole="alert">{message}</Text> : null}
          <TouchableOpacity
            style={[styles.submit, pending && styles.disabled]}
            onPress={step === 'password' ? requestCode : () => updatePassword(close)}
            disabled={pending}
          >
            {pending
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.submitText}>{step === 'password' ? 'Send Code' : 'Update Password'}</Text>}
          </TouchableOpacity>
          {step === 'verify' ? (
            <TouchableOpacity
              style={styles.resend}
              onPress={resendCode}
              disabled={pending}
              accessibilityRole="button"
            >
              <Text style={[styles.resendText, pending && styles.disabled]}>Resend code</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </SwipeDismissSheet>
  );
}

function Field({
  label,
  secureTextEntry = false,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { colors, isDark } = useMobileTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, isDark && darkStyles.muted]}>{label}</Text>
      <View style={secureTextEntry ? styles.passwordInputShell : undefined}>
        <TextInput
          {...inputProps}
          secureTextEntry={secureTextEntry && !passwordVisible}
          style={[
            styles.input,
            secureTextEntry && styles.passwordInput,
            isDark && darkStyles.input,
          ]}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
        {secureTextEntry ? (
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setPasswordVisible((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            accessibilityState={{ selected: passwordVisible }}
            hitSlop={8}
          >
            <Icon
              name={passwordVisible ? 'visibility-off' : 'visibility'}
              size={21}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: mobileTheme.surface,
  },
  content: { padding: 20, paddingTop: 4 },
  header: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  step: {
    marginBottom: 4,
    color: mobileTheme.blue,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: { color: mobileTheme.text, fontSize: 20, fontWeight: '800' },
  subtitle: { maxWidth: 280, marginTop: 4, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
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
  passwordInputShell: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  passwordToggle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  passwordRequirements: {
    marginTop: -7,
    marginBottom: 13,
    color: mobileTheme.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  error: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 10,
    backgroundColor: mobileTheme.dangerSoft,
    color: '#b42318',
    fontSize: 12,
    lineHeight: 18,
  },
  success: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 10,
    backgroundColor: mobileTheme.successSoft,
    color: mobileTheme.success,
    fontSize: 12,
    lineHeight: 18,
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
  resend: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  resendText: { color: mobileTheme.blue, fontSize: 13, fontWeight: '700' },
});

const darkStyles = StyleSheet.create({
  sheet: { borderWidth: 1, borderColor: '#22314a', backgroundColor: '#0b1528' },
  input: { borderColor: '#2a3a56', backgroundColor: '#0e1a30', color: '#f8fafc' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
});
