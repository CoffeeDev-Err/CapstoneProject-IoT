import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { beginLogin, requestPasswordReset, resendVerificationCode, resetPassword, verifyLoginCode } from './services/authApi';

const mockEstablishSession = jest.fn();
jest.mock('./context/AuthContext', () => ({ useAuth: () => ({ establishSession: mockEstablishSession }) }));
jest.mock('./services/authApi', () => ({
  beginLogin: jest.fn(), requestPasswordReset: jest.fn(), resendVerificationCode: jest.fn(),
  resetPassword: jest.fn(), verifyLoginCode: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

const challenge = { challengeId: 'first', maskedEmail: 'o***@example.com', expiresAt: '2030-01-01' };
const session = { token: 'test-session' } as Awaited<ReturnType<typeof verifyLoginCode>>;
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.mocked(beginLogin).mockResolvedValue(challenge);
  jest.mocked(verifyLoginCode).mockResolvedValue(session);
  jest.mocked(requestPasswordReset).mockResolvedValue(challenge);
  jest.mocked(resendVerificationCode).mockResolvedValue({ ...challenge, challengeId: 'resent' });
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function openVerification() {
  const view = await render(<LoginScreen />);
  await fireEvent.changeText(view.getByPlaceholderText('e.g., 01-2002'), '01-2002');
  await fireEvent.changeText(view.getByPlaceholderText('Enter your password'), 'test-password');
  await fireEvent.press(view.getByText('Sign In'));
  return view;
}

describe('automatic login verification', () => {
  it('shows the on-duty personal data notice before sign-in', async () => {
    const view = await render(<LoginScreen />);
    expect(view.getByTestId('login-privacy-notice').parent).not.toBe(
      view.getByTestId('login-form-panel'),
    );
    expect(view.getByText('Privacy Notice')).toBeTruthy();
    expect(view.getByText(/See how GeoSentri uses and protects/)).toBeTruthy();
    expect(view.queryByText(/GeoSentri processes your name/)).toBeNull();
    await fireEvent.press(view.getByLabelText('Open Privacy Notice'));
    expect(view.getByText('Your information, clearly explained')).toBeTruthy();
    expect(view.getByText('On-duty location tracking')).toBeTruthy();
    expect(view.getByText('Your data privacy rights')).toBeTruthy();
    expect(view.getByText(/station administrative desk/)).toBeTruthy();
    await fireEvent.press(view.getByText('Done'));
  });

  it('recovers the keyboard after consecutive wrong codes and accepts a correct retry', async () => {
    let nativeFocused = true;
    let keyboardVisible = false;
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => keyboardVisible);
    jest.spyOn(TextInput.prototype, 'blur').mockImplementation(() => {
      nativeFocused = false;
      keyboardVisible = false;
    });
    jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {
      if (nativeFocused) return;
      nativeFocused = true;
      keyboardVisible = true;
    });
    const wrongCode = Object.assign(new Error('Wrong'), { code: 'INCORRECT_OTP' });
    jest.mocked(verifyLoginCode)
      .mockRejectedValueOnce(wrongCode)
      .mockRejectedValueOnce(wrongCode)
      .mockRejectedValueOnce(wrongCode);
    const view = await openVerification();
    for (const code of ['111111', '222222', '333333']) {
      keyboardVisible = false;
      await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), code);
      await act(() => jest.advanceTimersByTime(32));
      expect(view.getByLabelText('Six-digit verification code')).toHaveProp('value', '');
      expect(view.getByLabelText('Six-digit verification code')).toHaveProp('selection', { start: 0, end: 0 });
      expect(keyboardVisible).toBe(true);
      // Dismissing the recovered keyboard must still allow a box tap to reopen it.
      keyboardVisible = false;
      await fireEvent.press(view.getByLabelText('Verification code digit 1'));
      await act(() => jest.advanceTimersByTime(32));
      expect(keyboardVisible).toBe(true);
    }
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '654321');
    expect(verifyLoginCode).toHaveBeenCalledTimes(4);
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('clears only incorrect codes and allows a fresh automatic attempt', async () => {
    jest.mocked(verifyLoginCode).mockRejectedValueOnce(Object.assign(new Error('Wrong'), { code: 'INCORRECT_OTP' }));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(view.getByText('Incorrect code. Check your email and enter the code again.')).toBeTruthy();
    expect(view.getByLabelText('Six-digit verification code')).toHaveProp('value', '');
    expect(view.getByLabelText('Six-digit verification code')).toHaveProp('editable', true);
    await fireEvent.press(view.getByLabelText('Verification code digit 1'));
    expect(verifyLoginCode).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '654321');
    expect(verifyLoginCode).toHaveBeenLastCalledWith('first', '654321');
  });

  it('retains the code on connection errors for the visible fallback', async () => {
    jest.mocked(verifyLoginCode).mockRejectedValueOnce(Object.assign(new Error('Network'), { code: 'NETWORK_ERROR' }));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(view.getByText(/Connection problem/)).toBeTruthy();
    expect(view.getByLabelText('Six-digit verification code')).toHaveProp('value', '123456');
    await fireEvent.press(view.getByText('Verify and Continue'));
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('counts down server deadlines independently of device clock skew', async () => {
      jest.mocked(beginLogin).mockResolvedValue({ ...challenge, receivedAt: Date.now(),
        serverTime: '2020-01-01T00:00:00.000Z', resendAvailableAt: '2020-01-01T00:00:05.000Z',
        expiresAt: '2020-01-01T00:00:10.000Z' });
      const view = await openVerification();
      expect(view.getByText('Resend code in 0:05')).toBeTruthy();
      expect(view.getByText('Code expires in 0:10')).toBeTruthy();
      await fireEvent.press(view.getByText('Resend code in 0:05'));
      expect(resendVerificationCode).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTime(11_000));
      expect(view.getByText('Code expired. Request a new code.')).toBeTruthy();
      await fireEvent.press(view.getByText('Resend code'));
      expect(resendVerificationCode).toHaveBeenCalledTimes(1);
      await view.unmount();
  });

  it('blocks resending until the server retry deadline while keeping verification available', async () => {
    jest.mocked(resendVerificationCode).mockRejectedValueOnce(Object.assign(new Error('Too many codes requested.'), {
      code: 'OTP_RATE_LIMITED', retryAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    const view = await openVerification();
    await fireEvent.press(view.getByText('Resend code'));
    expect(view.getByText('Too many codes requested.')).toBeTruthy();
    await fireEvent.press(view.getByText(/Resend code in/));
    expect(resendVerificationCode).toHaveBeenCalledTimes(1);
    expect(view.getByText('Verify and Continue')).toBeTruthy();
  });
  it('waits for the sixth digit then establishes the session without a button click', async () => {
    const view = await openVerification();
    expect(view.getByText('A verification code was sent to o***@example.com.')).toBeTruthy();
    expect(view.queryByText(/Enter the code sent to/)).toBeNull();
    expect(view.queryByText(/verifies automatically/)).toBeNull();
    expect(view.getByText('Verify and Continue')).toBeTruthy();
    for (let length = 1; length <= 5; length++) {
      await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456'.slice(0, length));
    }
    expect(verifyLoginCode).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(verifyLoginCode).toHaveBeenCalledTimes(1);
    expect(verifyLoginCode).toHaveBeenCalledWith('first', '123456');
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('handles paste/autofill and blocks overlapping requests and account changes', async () => {
    let resolve!: (value: typeof session) => void;
    jest.mocked(verifyLoginCode).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(view.getByLabelText('Six-digit verification code')).toHaveProp('editable', true);
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '654321');
    await fireEvent.press(view.getByText('Resend code'));
    await fireEvent.press(view.getByText('Use another account'));
    expect(verifyLoginCode).toHaveBeenCalledTimes(1);
    expect(resendVerificationCode).not.toHaveBeenCalled();
    await act(async () => resolve(session));
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('shows a manual fallback on failure without automatically retrying the same code', async () => {
    jest.mocked(verifyLoginCode).mockRejectedValueOnce(new Error('Connection failed.'));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(view.getByText('Connection failed.')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(verifyLoginCode).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByText('Verify and Continue'));
    expect(verifyLoginCode).toHaveBeenCalledTimes(2);
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('automatically retries a corrected code', async () => {
    jest.mocked(verifyLoginCode).mockRejectedValueOnce(new Error('Invalid code.'));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(view.getByText('Invalid code.')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123457');
    expect(verifyLoginCode).toHaveBeenLastCalledWith('first', '123457');
    expect(mockEstablishSession).toHaveBeenCalledWith(session);
  });

  it('keeps the fallback and verifies against the resent challenge', async () => {
    jest.mocked(verifyLoginCode).mockRejectedValueOnce(new Error('Expired code.'));
    const view = await openVerification();
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    await fireEvent.press(view.getByText('Resend code'));
    expect(view.getByText('Verify and Continue')).toBeTruthy();
    expect(view.getByLabelText('Six-digit verification code')).toHaveProp('value', '');
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(verifyLoginCode).toHaveBeenLastCalledWith('resent', '123456');
  });

  it('does not submit password recovery when only its code is entered', async () => {
    const view = await render(<LoginScreen />);
    await fireEvent.press(view.getByText('Forgot password?'));
    await fireEvent.changeText(view.getByPlaceholderText('e.g., 01-2002 or example@gmail.com'), '01-2002');
    await fireEvent.press(view.getByText('Send Reset Code'));
    await fireEvent.changeText(view.getByLabelText('Six-digit verification code'), '123456');
    expect(verifyLoginCode).not.toHaveBeenCalled();
    expect(resetPassword).not.toHaveBeenCalled();
    expect(view.getByText('Reset Password')).toBeTruthy();
  });
});
