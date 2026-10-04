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

describe('unwired industrial protocol adapters fail closed', () => {
  it.each([
    ['BACnet', '@/services/connectivity/bacnetAdapter', 'BACnetAdapter', { port: 47808 }, 'BACnet provider is not configured'],
    ['EtherNet/IP', '@/services/connectivity/ethernetIpAdapter', 'EthernetIPAdapter', { host: '127.0.0.1' }, 'EtherNet/IP provider is not configured'],
    ['Siemens S7', '@/services/connectivity/siemensS7Adapter', 'SiemensS7Adapter', { host: '127.0.0.1' }, 'Siemens S7 provider is not configured'],
  ])('%s refuses a simulated successful connection', async (_label, modulePath, exportName, config, message) => {
    const mod = await import(modulePath);
    const Adapter = mod[exportName];
    const adapter = new Adapter(config);
    const statuses: Array<{ status: string; error?: string }> = [];
    adapter.on('status_change', (status: { status: string; error?: string }) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow(message);

    expect(adapter.getStatus().connected).toBe(false);
    expect(adapter.getStatus().errorCount).toBe(1);
    expect(statuses.at(-1)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('provider is not configured'),
    });
  });

  it('contains no fabricated zero-value data emissions in unwired adapters', () => {
    for (const path of [
      'src/services/connectivity/bacnetAdapter.ts',
      'src/services/connectivity/ethernetIpAdapter.ts',
      'src/services/connectivity/siemensS7Adapter.ts',
    ]) {
      const source = fs.readFileSync(path, 'utf8');
      expect(source, path).toContain('Refusing to fabricate telemetry values');
      expect(source, path).not.toMatch(/emit\('data'.*value:\s*0/s);
      expect(source, path).not.toMatch(/processedValue\s*=\s*0/);
    }
  });
});
