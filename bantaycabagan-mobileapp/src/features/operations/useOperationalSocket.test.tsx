import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchOperations, operationsSocket } from '../../services/operationsApi';
import { useOperationalSocket } from './useOperationalSocket';

jest.mock('../../services/operationsApi', () => ({
  fetchOperations: jest.fn(),
  operationsSocket: {
    auth: {},
    connected: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
    off: jest.fn(),
    on: jest.fn(),
  },
  resolveApiAssetUrl: (value?: string) => value || '',
}));

const socketOptions = () => ({
  applyIdentityUpdate: jest.fn(),
  clearSession: jest.fn(async () => undefined),
  currentPersonnelId: 'PNP-001',
  setDeployments: jest.fn(),
  setPersonnel: jest.fn(),
  setReports: jest.fn(),
  setTasks: jest.fn(),
  setUpcomingDeployment: jest.fn(),
  token: 'session-token',
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchOperations).mockResolvedValue({
    deployments: [],
    reports: [],
    tasks: [],
    upcomingDeployment: null,
  });
});

it('refreshes deployments immediately when a deployment notification arrives', async () => {
  const options = socketOptions();
  renderHook(() => useOperationalSocket(options));
  await waitFor(() => expect(operationsSocket.on).toHaveBeenCalledWith(
    'notification:created',
    expect.any(Function),
  ));
  const subscription = jest.mocked(operationsSocket.on).mock.calls.find(
    ([event]) => event === 'notification:created',
  );

  expect(subscription).toBeDefined();
  await act(async () => {
    subscription?.[1]({
      referenceType: 'deployment',
      data: { assignmentId: 'DEP-001' },
    });
  });

  await waitFor(() => expect(fetchOperations).toHaveBeenCalledWith('PNP-001', 'session-token'));
  expect(options.setDeployments).toHaveBeenCalledWith([]);
});
