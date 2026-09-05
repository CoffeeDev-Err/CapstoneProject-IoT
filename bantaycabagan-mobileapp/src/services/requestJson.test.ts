import { requestJson } from './requestJson';

const originalFetch = global.fetch;
beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

describe('bounded mobile requests', () => {
  it('times out a stalled request and aborts its transport', async () => {
    (fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    const request = requestJson('https://test.invalid');
    const assertion = expect(request).rejects.toMatchObject({ status: 408 });
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('also bounds a stalled response body', async () => {
    (fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true, json: () => new Promise(() => {}) });
    const assertion = expect(requestJson('https://test.invalid')).rejects.toMatchObject({ status: 408 });
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
  it('preserves HTTP failures and distinguishes malformed success from success', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ status: 429, ok: false, json: async () => ({ message: 'Retry later' }) });
    expect((await requestJson('https://test.invalid')).response.status).toBe(429);
    (fetch as jest.Mock).mockResolvedValueOnce({ status: 200, ok: true, json: async () => { throw new Error('Bad JSON'); } });
    await expect(requestJson('https://test.invalid')).rejects.toMatchObject({ status: 502 });
  });
  it('honors caller cancellation without automatic write retries', async () => {
    (fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const request = requestJson('https://test.invalid', { method: 'POST', signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
