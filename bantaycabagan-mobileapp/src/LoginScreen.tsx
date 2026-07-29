import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileTheme } from './constants/mobileTheme';
import { useAuth } from './context/AuthContext';
import {
  beginLogin,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  type VerificationChallenge,
  verifyLoginCode,
} from './services/authApi';

type Mode = 'login' | 'verify' | 'forgot' | 'reset';

const isStrongPassword = (value: string) => (
  value.length >= 10
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
);

export default function LoginScreen() {
  const { establishSession } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete the request.');
    } finally {
      setPending(false);
    }
  };

  const submitLogin = () => run(async () => {
    const response = await beginLogin(loginId.trim(), password);
    setChallenge(response);
    setCode('');
    setMode('verify');
  });

  const submitVerification = () => run(async () => {
    if (!challenge) return;
    const session = await verifyLoginCode(challenge.challengeId, code);
    await establishSession(session);
  });

  const submitForgot = () => run(async () => {
    const response = await requestPasswordReset(identifier.trim());
    if (response.challengeId) {
      setChallenge(response);
      setCode('');
      setMode('reset');
      return;
    }
    setMessage(response.message || 'If the account exists, a verification code was sent.');
  });

  const submitReset = () => run(async () => {
    if (!challenge) return;
    if (!isStrongPassword(newPassword)) {
      throw new Error('Use 10+ characters with upper, lower, number, and symbol.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match.');
    }
    await resetPassword(challenge.challengeId, code, newPassword);
    setMode('login');
    setPassword('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('Password updated. Sign in with your new password.');
  });

  const resend = () => run(async () => {
    if (!challenge) return;
    const response = await resendVerificationCode(challenge.challengeId);
    setChallenge(response);
    setCode('');
    setMessage(`A new code was sent to ${response.maskedEmail}.`);
  });

  const backToLogin = () => {
    setMode('login');
    setChallenge(null);
    setCode('');
    setError('');
    setMessage('');
  };

  const copy = {
    login: ['Officer Sign In', 'Use your assigned Login ID and password.'],
    verify: ['Verify Your Login', `Enter the code sent to ${challenge?.maskedEmail || 'your official email'}.`],
    forgot: ['Reset Password', 'Enter your Login ID or official email.'],
    reset: ['Create New Password', `Enter the code sent to ${challenge?.maskedEmail || 'your official email'}.`],
  }[mode];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={mobileTheme.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Icon name="local-police" size={34} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.brandName}>BantayCabagan</Text>
              <Text style={styles.brandCaption}>Police Personnel Portal</Text>
            </View>
          </View>

          <View style={styles.formPanel}>
            <Text style={styles.title}>{copy[0]}</Text>
            <Text style={styles.subtitle}>{copy[1]}</Text>

            {mode === 'login' && (
              <>
                <Field
                  label="Login ID"
                  value={loginId}
                  onChangeText={setLoginId}
                  placeholder="Enter your Login ID"
                  autoCapitalize="none"
                  autoComplete="username"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secureTextEntry
                  autoComplete="current-password"
                />
                <TouchableOpacity
                  style={styles.textActionRight}
                  onPress={() => {
                    setIdentifier(loginId);
                    setMode('forgot');
                    setError('');
                    setMessage('');
                  }}
                >
                  <Text style={styles.textAction}>Forgot password?</Text>
                </TouchableOpacity>
                <Feedback error={error} message={message} debugCode={undefined} />
                <SubmitButton label="Sign In" pending={pending} onPress={submitLogin} />
              </>
            )}

            {mode === 'verify' && (
              <>
                <CodeField value={code} onChangeText={setCode} />
                <Feedback error={error} message={message} debugCode={challenge?.debugCode} />
                <SubmitButton label="Verify and Continue" pending={pending} onPress={submitVerification} />
                <TextButton label="Resend code" onPress={resend} disabled={pending} />
                <TextButton label="Use another account" onPress={backToLogin} />
              </>
            )}

            {mode === 'forgot' && (
              <>
                <Field
                  label="Login ID or Official Email"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <Feedback error={error} message={message} debugCode={undefined} />
                <SubmitButton label="Send Reset Code" pending={pending} onPress={submitForgot} />
                <TextButton label="Back to sign in" onPress={backToLogin} />
              </>
            )}

            {mode === 'reset' && (
              <>
                <CodeField value={code} onChangeText={setCode} />
                <Field
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
                <Field
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
                <Feedback error={error} message={message} debugCode={challenge?.debugCode} />
                <SubmitButton label="Reset Password" pending={pending} onPress={submitReset} />
                <TextButton label="Cancel" onPress={backToLogin} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, style]}
        placeholderTextColor="#999aab"
      />
    </View>
  );
}

function CodeField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return (
    <Field
      label="Verification Code"
      value={value}
      onChangeText={(nextValue) => onChangeText(nextValue.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="000000"
      style={styles.codeInput}
    />
  );
}

function SubmitButton({
  label,
  pending,
  onPress,
}: {
  label: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.submit, pending && styles.disabled]}
      onPress={onPress}
      disabled={pending}
    >
      {pending
        ? <ActivityIndicator color="#ffffff" />
        : <Text style={styles.submitText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function TextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.textButton} onPress={onPress} disabled={disabled}>
      <Text style={[styles.textAction, disabled && styles.disabledText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Feedback({
  error,
  message,
  debugCode,
}: {
  error: string;
  message: string;
  debugCode?: string;
}) {
  return (
    <>
      {debugCode ? <Text style={styles.debug}>Development code: {debugCode}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: mobileTheme.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  brand: {
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: mobileTheme.blue,
  },
  brandName: { color: mobileTheme.text, fontSize: 22, fontWeight: '800' },
  brandCaption: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 12 },
  formPanel: {
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    padding: 20,
    backgroundColor: mobileTheme.surface,
  },
  title: { color: mobileTheme.text, fontSize: 26, fontWeight: '800' },
  subtitle: { marginTop: 6, marginBottom: 24, color: mobileTheme.textMuted, fontSize: 13, lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { marginBottom: 7, color: mobileTheme.textMuted, fontSize: 12, fontWeight: '700' },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fafbff',
    color: mobileTheme.text,
    fontSize: 14,
  },
  codeInput: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  textActionRight: { alignSelf: 'flex-end', marginTop: -2, marginBottom: 18 },
  textButton: { alignSelf: 'center', padding: 9 },
  textAction: { color: mobileTheme.blue, fontSize: 13, fontWeight: '700' },
  submit: {
    minHeight: 52,
    marginTop: 4,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: mobileTheme.blue,
  },
  submitText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  disabledText: { opacity: 0.55 },
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
  debug: {
    marginBottom: 12,
    borderRadius: 8,
    padding: 10,
    backgroundColor: mobileTheme.warningSoft,
    color: mobileTheme.warning,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
