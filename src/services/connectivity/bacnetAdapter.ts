// ============================================================================
// BACnet PROTOCOL ADAPTER — Building Automation and Control Networks
// Supports read property, read property multiple, subscribe COV
// ============================================================================
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('BACnetAdapter');

export interface BACnetConnectionConfig {
  interface?: string; // network interface
  deviceId?: number; // BACnet device instance number
  port?: number; // UDP port, default 47808
  apduTimeout?: number;
  broadcastAddress?: string;
}

export interface BACnetObjectRef {
  objectType: string; // analogInput, analogValue, binaryInput, etc.
  objectIdentifier: string; // e.g. "0" for AI-0
  propertyIdentifier?: string; // presentValue, statusFlags, etc.
  mappingId: string;
  pollingIntervalMs?: number;
  covEnabled?: boolean; // Change of Value subscription
}

export class BACnetAdapter extends EventEmitter {
  private config: BACnetConnectionConfig;
  private connected = false;
  private objects: Map<string, BACnetObjectRef> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readCount = 0;
  private errorCount = 0;

  constructor(config: BACnetConnectionConfig) {
    super();
    this.config = config;
  }

  getStatus() {
    return { protocol: 'bacnet', connected: this.connected, objectCount: this.objects.size, activePollers: this.pollTimers.size, readCount: this.readCount, errorCount: this.errorCount };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.emit('status_change', { status: 'connecting' });
    log.info('Connecting to BACnet network');

    const error = new Error(
      'BACnet provider is not configured. Install and wire a supported BACnet transport before enabling this data source.',
    );
    this.errorCount++;
    this.emit('status_change', { status: 'error', error: error.message });
    log.error('BACnet connection refused: provider not configured', error);
    throw error;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const [, timer] of this.pollTimers) clearInterval(timer);
    this.pollTimers.clear();
    this.objects.clear();
    this.emit('disconnected');
    this.emit('status_change', { status: 'disconnected' });
  }

  addObject(obj: BACnetObjectRef): void {
    if (!this.connected) throw new Error('BACnet not connected');
    this.objects.set(obj.mappingId, obj);
    if (obj.pollingIntervalMs && !obj.covEnabled) {
      const timer = setInterval(() => this.readObject(obj), obj.pollingIntervalMs);
      this.pollTimers.set(obj.mappingId, timer);
    }
    log.info(`Added BACnet object: ${obj.objectType}-${obj.objectIdentifier}`);
  }

  async readObject(obj: BACnetObjectRef): Promise<{ value: unknown; status: string }> {
    if (!this.connected) throw new Error('BACnet not connected');
    this.readCount++;
    log.debug(`BACnet read requested: ${obj.objectType}-${obj.objectIdentifier}`);
    throw new Error('BACnet provider is not configured. Refusing to fabricate telemetry values.');
  }

  removeObject(mappingId: string): void {
    this.objects.delete(mappingId);
    const timer = this.pollTimers.get(mappingId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(mappingId); }
  }
}
