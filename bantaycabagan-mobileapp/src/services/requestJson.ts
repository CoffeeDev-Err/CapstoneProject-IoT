export class TransportError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TransportError';
  }
}

// Deadline includes the response body. Never retry writes here: the caller
// must reconcile an ambiguous submission using its original submission ID.
export async function requestJson(url: string, options: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      const error = new Error('Request cancelled.');
      error.name = 'AbortError';
      reject(error);
      controller.abort();
    };
    timer = setTimeout(() => {
      reject(new TransportError('The server took too long to respond. Check your connection and try again.', 408));
      controller.abort();
    }, timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
  try {
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = response.status === 204 ? {} : await response.json().catch(() => {
        if (!response.ok) return {};
        throw new TransportError('The server returned an invalid response. Please retry.', 502);
      });
      return { response, payload };
    })()]);
  } catch (error) {
    if (error instanceof TransportError || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new TransportError('Cannot reach the server. Check your internet connection and try again.', 0);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
