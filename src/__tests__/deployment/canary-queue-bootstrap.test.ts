import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queue = vi.hoisted(() => ({ initQueues: vi.fn() }));
vi.mock('@/lib/queueInit', () => queue);
import { register } from '@/instrumentation';

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('immutable deployment canary queue isolation', () => {
  it('does not consume production jobs while a deployment canary runs', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IASSETSPRO_DEPLOY_CANARY', '1');
    await register();
    expect(queue.initQueues).not.toHaveBeenCalled();
  });

  it('preserves normal production background processing', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IASSETSPRO_DEPLOY_CANARY', '0');
    await register();
    expect(queue.initQueues).toHaveBeenCalledOnce();
  });

  it('does not import Node-only workers in an Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('IASSETSPRO_DEPLOY_CANARY', '0');
    await register();
    expect(queue.initQueues).not.toHaveBeenCalled();
  });
});
