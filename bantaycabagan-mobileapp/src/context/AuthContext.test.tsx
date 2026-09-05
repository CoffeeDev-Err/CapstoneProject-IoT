import { act, renderHook } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthApiError, getCurrentUser } from '../services/authApi';
import { deleteStoredAuthToken, getStoredAuthToken } from '../services/authTokenStorage';

jest.mock('../services/authApi', () => ({
  AuthApiError: class extends Error { constructor(message: string, code: number) { super(message); Object.assign(this, { status: code }); } },
  getCurrentUser: jest.fn(), logoutSession: jest.fn(),
}));
jest.mock('../services/authTokenStorage', () => ({
  deleteStoredAuthToken: jest.fn(), getStoredAuthToken: jest.fn(), setStoredAuthToken: jest.fn(),
}));
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getStoredAuthToken).mockResolvedValue('stored-token');
});

describe('session recovery', () => {
  it.each([0, 408, 429, 503])('retains the saved token but grants no access on failure %s', async (status) => {
    jest.mocked(getCurrentUser).mockRejectedValue(new AuthApiError('Unavailable', status));
    const { result } = await renderHook(useAuth, { wrapper: AuthProvider });
    expect(result.current.loading).toBe(false);
    expect(result.current.sessionError).toContain('Retry');
    expect(result.current.token).toBeNull();
    expect(deleteStoredAuthToken).not.toHaveBeenCalled();
    jest.mocked(getCurrentUser).mockResolvedValue({ user: { id: 'officer' } } as Awaited<ReturnType<typeof getCurrentUser>>);
    await act(async () => { await result.current.retrySession(); });
    expect(result.current.token).toBe('stored-token');
    expect(result.current.sessionError).toBe('');
  });
  it.each([401, 403])('removes a server-rejected session (%s)', async (status) => {
    jest.mocked(getCurrentUser).mockRejectedValue(new AuthApiError('Rejected', status));
    const { result } = await renderHook(useAuth, { wrapper: AuthProvider });
    expect(deleteStoredAuthToken).toHaveBeenCalledTimes(1);
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
