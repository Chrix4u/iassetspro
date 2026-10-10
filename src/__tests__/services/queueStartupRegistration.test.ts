import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initQueues } = vi.hoisted(() => ({ initQueues: vi.fn() }));

vi.mock('@/lib/queueInit', () => ({ initQueues }));

describe('production queue startup registration', () => {
  beforeEach(() => {
    initQueues.mockReset();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('initializes queue processors in the Next.js Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    const { register } = await import('@/instrumentation');
    await register();

    expect(initQueues).toHaveBeenCalledTimes(1);
  });

  it('does not initialize Node queue workers in non-Node runtimes', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    const { register } = await import('@/instrumentation');
    await register();

    expect(initQueues).not.toHaveBeenCalled();
  });
});
