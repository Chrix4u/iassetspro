import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    timer: () => ({ end: () => 0 }),
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('production connectivity guards', () => {
  it('refuses the MQTT simulation path in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { MQTTAdapter } = await import('@/services/connectivity/mqttAdapter');
    const adapter = new MQTTAdapter({
      broker: 'localhost',
      port: 1883,
      clientId: 'uat-client',
    });
    const statuses: Array<{ status: string; error?: string }> = [];
    adapter.on('status_change', (status) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow('MQTT provider is not configured for production');
    expect(adapter.getStatus().connected).toBe(false);
    expect(statuses.at(-1)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('provider is not configured for production'),
    });
  });

  it('refuses the OPC-UA simulation path in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { OPCUAAdapter } = await import('@/services/connectivity/opcuaAdapter');
    const adapter = new OPCUAAdapter({
      endpoint: 'opc.tcp://127.0.0.1:4840',
      securityMode: 'None',
      securityPolicy: 'None',
    });
    const statuses: Array<{ status: string; error?: string }> = [];
    adapter.on('status_change', (status) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow('OPC-UA provider is not configured for production');
    expect(adapter.getStatus().connected).toBe(false);
    expect(statuses.at(-1)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('provider is not configured for production'),
    });
  });
});
