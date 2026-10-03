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

it('does not replace a newer deployment refresh with an older HTTP response', async () => {
  const options = socketOptions();
  const empty = { deployments: [], reports: [], tasks: [], upcomingDeployment: null };
  let finishOld!: (value: typeof empty) => void;
  let finishNew!: (value: typeof empty) => void;
  jest.mocked(fetchOperations)
    .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }));
  await renderHook(() => useOperationalSocket(options));
  const notify = jest.mocked(operationsSocket.on).mock.calls.find(([event]) => event === 'notification:created')?.[1];
  await act(async () => { notify?.({ referenceType: 'deployment' }); });
  await act(async () => { notify?.({ referenceType: 'deployment' }); });
  await act(async () => { finishNew(empty); });
  const applied = options.setDeployments.mock.calls.length;
  await act(async () => { finishOld(empty); });
  expect(options.setDeployments).toHaveBeenCalledTimes(applied);
  expect(applied).toBe(1);
});

it('invalidates an in-flight screen refresh when deployment state arrives over the socket', async () => {
  const onOperationsUpdated = jest.fn();
  const options = { ...socketOptions(), onOperationsUpdated };
  await renderHook(() => useOperationalSocket(options));
  const receive = jest.mocked(operationsSocket.on).mock.calls.find(([event]) => event === 'deployments:updated')?.[1];
  await act(async () => { receive?.([]); });
  expect(onOperationsUpdated).toHaveBeenCalled();
});
