import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    timer: () => ({ end: () => 0 }),
  }),
}));

describe('ModbusAdapter fail-closed behavior', () => {
  it('refuses to report a fake connected state when no real Modbus provider is configured', async () => {
    const { ModbusAdapter } = await import('@/services/connectivity/modbusAdapter');
    const adapter = new ModbusAdapter({ host: '127.0.0.1', port: 502 });
    const statuses: Array<{ status: string; error?: string }> = [];
    adapter.on('status_change', (status) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow('Modbus TCP provider is not configured');

    expect(adapter.getStatus()).toMatchObject({
      protocol: 'modbus_tcp',
      connected: false,
      connecting: false,
      readCount: 0,
      errorCount: 1,
      lastDataAt: null,
    });
    expect(statuses.at(-1)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('provider is not configured'),
    });
  });

  it('contains no placeholder zero telemetry fallback', () => {
    const source = fs.readFileSync('src/services/connectivity/modbusAdapter.ts', 'utf8');

    expect(source).not.toContain('new Array(quantity).fill(0)');
    expect(source).toContain('Refusing to fabricate telemetry values');
  });
});
