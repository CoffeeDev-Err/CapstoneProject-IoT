import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import VerificationCodeInput from './components/VerificationCodeInput';
import { COMPLETE_CODE_MESSAGE, PASSWORD_REQUIREMENTS } from './features/auth/authCopy';
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
  && value.length <= 128
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
    if (!loginId.trim()) throw new Error('Enter your Login ID.');
    if (!password) throw new Error('Enter your password.');
    const response = await beginLogin(loginId.trim(), password);
    setChallenge(response);
    setCode('');
    setMode('verify');
  });

  const submitVerification = () => run(async () => {
    if (!challenge) return;
    if (code.length !== 6) throw new Error(COMPLETE_CODE_MESSAGE);
    const session = await verifyLoginCode(challenge.challengeId, code);
    await establishSession(session);
  });

  const submitForgot = () => run(async () => {
    if (!identifier.trim()) throw new Error('Enter your Login ID or official email.');
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
    if (code.length !== 6) throw new Error(COMPLETE_CODE_MESSAGE);
    if (!newPassword) throw new Error('Enter a new password.');
    if (!isStrongPassword(newPassword)) {
      throw new Error(PASSWORD_REQUIREMENTS);
    }
    if (!confirmPassword) throw new Error('Confirm your new password.');
    if (newPassword !== confirmPassword) {
      throw new Error('The new password and confirmation do not match.');
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
    if (mode === 'reset') {
      // Resend through the uniform reset endpoint (never the challenge-scoped
      // resend) so a resend cannot reveal whether the account exists or leak its
      // masked email — that would reopen the enumeration the reset flow closes.
      const response = await requestPasswordReset(identifier.trim());
      setChallenge(response);
      setCode('');
      setMessage(response.message || 'If the account exists, a new code was sent.');
    } else {
      if (!challenge) return;
      const response = await resendVerificationCode(challenge.challengeId);
      setChallenge(response);
      setCode('');
      setMessage(`A new code was sent to ${response.maskedEmail}.`);
    }
  });

  const backToLogin = () => {
    setMode('login');
    setChallenge(null);
    setCode('');
    setError('');
    setMessage('');
  };

  const handleVerificationCodeChange = (nextCode: string) => {
    setCode(nextCode);
    if (error) setError('');
  };

  const copy = {
    login: ['Officer Sign In', 'Use your assigned Login ID and password.'],
    verify: ['Verify Your Login', `Enter the code sent to ${challenge?.maskedEmail || 'your official email'}.`],
    forgot: ['Reset Password', 'Enter your Login ID or official email.'],
    reset: ['Create New Password', `Enter the code sent to ${challenge?.maskedEmail || 'your official email'}.`],
  }[mode];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#050b18" />
      <View pointerEvents="none" style={styles.accentTop} />
      <View pointerEvents="none" style={styles.accentBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image
              source={require('../assets/pnp-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Philippine National Police seal"
            />
            <View>
              <Text style={styles.brandName}>GeoSentri</Text>
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
                  placeholder="e.g., 01-2002"
                  autoCapitalize="none"
                  autoComplete="username"
                  maxLength={50}
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secureTextEntry
                  autoComplete="current-password"
                  maxLength={128}
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
                <Feedback error={error} message={message} />
                <SubmitButton label="Sign In" pending={pending} onPress={submitLogin} />
              </>
            )}

            {mode === 'verify' && (
              <>
                <VerificationCodeInput
                  value={code}
                  onChangeText={handleVerificationCodeChange}
                  dark
                  invalid={Boolean(error)}
                />
                <Feedback error={error} message={message} />
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
                  placeholder="e.g., 01-2002 or example@gmail.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  maxLength={254}
                />
                <Feedback error={error} message={message} />
                <SubmitButton label="Send Reset Code" pending={pending} onPress={submitForgot} />
                <TextButton label="Back to sign in" onPress={backToLogin} />
              </>
            )}

            {mode === 'reset' && (
              <>
                <VerificationCodeInput value={code} onChangeText={handleVerificationCodeChange} dark />
                <Field
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={128}
                />
                <Text style={styles.passwordRequirements}>{PASSWORD_REQUIREMENTS}</Text>
                <Field
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={128}
                />
                <Feedback error={error} message={message} />
                <SubmitButton label="Reset Password" pending={pending} onPress={submitReset} />
                <TextButton label="Resend code" onPress={resend} disabled={pending} />
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
  secureTextEntry = false,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={secureTextEntry ? styles.passwordInputShell : undefined}>
        <TextInput
          {...props}
          secureTextEntry={secureTextEntry && !passwordVisible}
          style={[styles.input, secureTextEntry && styles.passwordInput, style]}
          placeholderTextColor="#94a3b8"
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
              color="#93a4bd"
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
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
}: {
  error: string;
  message: string;
}) {
  return (
    <>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {message ? <Text style={styles.success} accessibilityRole="alert">{message}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#050b18' },
  accentTop: {
    position: 'absolute',
    top: -34,
    left: -54,
    width: 270,
    height: 118,
    borderBottomRightRadius: 96,
    backgroundColor: '#132442',
    transform: [{ rotate: '-5deg' }],
  },
  accentBottom: {
    position: 'absolute',
    right: -62,
    bottom: -36,
    width: 286,
    height: 126,
    borderTopLeftRadius: 108,
    backgroundColor: '#0b2d63',
    transform: [{ rotate: '-4deg' }],
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brand: {
    marginBottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 62,
    height: 72,
  },
  brandName: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  brandCaption: { marginTop: 3, color: '#93a4bd', fontSize: 12 },
  formPanel: {
    borderWidth: 1,
    borderColor: '#22314a',
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#0b1528',
  },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 24, color: '#9eabc0', fontSize: 13, lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { marginBottom: 7, color: '#aebbd0', fontSize: 12, fontWeight: '700' },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: '#2a3a56',
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0e1a30',
    color: '#f8fafc',
    fontSize: 14,
  },
  passwordInputShell: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  passwordToggle: {
    position: 'absolute',
    top: 8,
    right: 7,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  passwordRequirements: {
    marginTop: -7,
    marginBottom: 14,
    color: '#93a4bd',
    fontSize: 11,
    lineHeight: 17,
  },
  textActionRight: { alignSelf: 'flex-end', marginTop: -2, marginBottom: 18 },
  textButton: { alignSelf: 'center', padding: 9 },
  textAction: { color: '#72a7ff', fontSize: 13, fontWeight: '700' },
  submit: {
    minHeight: 52,
    marginTop: 4,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2864e8',
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
});
