import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runFunction cancellation', () => {
  it('forwards the AbortSignal to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const controller = new AbortController();

    await api.runFunction('fn', { a: 1 }, controller.signal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('rejects with an AbortError that isAbortError detects', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = api.runFunction('fn', {}, controller.signal);
    controller.abort();

    const err = await pending.catch((e) => e);
    expect(api.isAbortError(err)).toBe(true);
  });
});
