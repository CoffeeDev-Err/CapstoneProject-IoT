import { API_URL } from './apiConfig';
import { requestJson, TransportError } from './requestJson';

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  role: 'supervisor' | 'officer';
  personnelId?: string;
  forcePasswordReset: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  profile: {
    fullName: string;
    badgeNumber: string;
    rank: string;
    mobileNumber: string;
    photoUrl: string;
    dutyStatus: string;
  } | null;
};

export type VerificationChallenge = {
  challengeId: string;
  maskedEmail: string;
  expiresAt: string;
  message?: string;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

type RequestOptions = RequestInit & {
  token?: string;
};

export class AuthApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { token, ...fetchOptions } = options;
  try {
    const { response, payload } = await requestJson(`${API_URL}${path}`, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });
    if (!response.ok) {
      throw new AuthApiError(payload.message || 'Unable to complete the request.', response.status, payload.code || '');
    }
    return payload as T;
  } catch (error) {
    if (error instanceof TransportError) throw new AuthApiError(error.message, error.status);
    throw error;
  }
};

const deviceName = 'GeoSentri mobile app';

export const beginLogin = (username: string, password: string) => (
  request<VerificationChallenge>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      application: 'mobile',
      device_name: deviceName,
    }),
  })
);

export const verifyLoginCode = (challengeId: string, code: string) => (
  request<AuthSession>('/api/auth/login/verify', {
    method: 'POST',
    body: JSON.stringify({
      challenge_id: challengeId,
      code,
      device_name: deviceName,
    }),
  })
);

export const resendVerificationCode = (challengeId: string) => (
  request<VerificationChallenge>('/api/auth/verification/resend', {
    method: 'POST',
    body: JSON.stringify({
      challenge_id: challengeId,
      device_name: deviceName,
    }),
  })
);

export const requestPasswordReset = (identifier: string) => (
  request<VerificationChallenge>('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ identifier, device_name: deviceName }),
  })
);

export const resetPassword = (
  challengeId: string,
  code: string,
  newPassword: string,
) => request<{ success: boolean }>('/api/auth/password/reset', {
  method: 'POST',
  body: JSON.stringify({
    challenge_id: challengeId,
    code,
    new_password: newPassword,
  }),
});

export const getCurrentUser = (token: string) => (
  request<{ user: AuthUser }>('/api/auth/me', { token })
);

export const logoutSession = (token: string) => (
  request<{ success: boolean }>('/api/auth/logout', { method: 'POST', token })
);

export const requestPasswordChange = (token: string, currentPassword: string) => (
  request<VerificationChallenge>('/api/auth/password/change/request', {
    method: 'POST',
    token,
    body: JSON.stringify({
      current_password: currentPassword,
      device_name: deviceName,
    }),
  })
);

export const confirmPasswordChange = (
  token: string,
  challengeId: string,
  code: string,
  newPassword: string,
) => request<{ success: boolean }>('/api/auth/password', {
  method: 'PATCH',
  token,
  body: JSON.stringify({
    challenge_id: challengeId,
    code,
    new_password: newPassword,
  }),
});
