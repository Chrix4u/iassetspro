// ============================================================================
// ETHERNET/IP PROTOCOL ADAPTER — Industrial EtherNet/IP (ODVA)
// Supports CIP explicit/implicit messaging, connected/disconnected messaging
// Used with: Rockwell/Allen-Bradley, Omron, other ODVA-compliant devices
// ============================================================================
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('EthernetIPAdapter');

export interface EthernetIPConfig {
  host: string;
  port?: number; // default 44818
  timeout?: number;
  vendorId?: number;
  deviceType?: number;
  backplane?: number;
  slot?: number;
}

export interface CIPTag {
  tagPath: string; // e.g. "Program:MainProgram.Var1" or "MyTag"
  dataType?: 'BOOL' | 'SINT' | 'INT' | 'DINT' | 'LINT' | 'REAL' | 'LREAL' | 'STRING';
  arraySize?: number;
  mappingId: string;
  pollingIntervalMs: number;
  scaleFactor?: number;
  offset?: number;
}

export class EthernetIPAdapter extends EventEmitter {
  private config: EthernetIPConfig;
  private connected = false;
  private tags: Map<string, CIPTag> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readCount = 0;
  private errorCount = 0;

  constructor(config: EthernetIPConfig) {
    super();
    this.config = config;
  }

  getStatus() {
    return { protocol: 'ethernet_ip', connected: this.connected, tags: Array.from(this.tags.values()), activePollers: this.pollTimers.size, readCount: this.readCount, errorCount: this.errorCount, host: this.config.host };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.emit('status_change', { status: 'connecting' });
    log.info(`Connecting to EtherNet/IP: ${this.config.host}:${this.config.port || 44818}`);

    const error = new Error(
      'EtherNet/IP provider is not configured. Install and wire a supported CIP transport before enabling this data source.',
    );
    this.errorCount++;
    this.emit('status_change', { status: 'error', error: error.message });
    log.error('EtherNet/IP connection refused: provider not configured', error);
    throw error;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const [, timer] of this.pollTimers) clearInterval(timer);
    this.pollTimers.clear();
    this.tags.clear();
    this.emit('disconnected');
    this.emit('status_change', { status: 'disconnected' });
  }

  addTag(tag: CIPTag): void {
    if (!this.connected) throw new Error('EtherNet/IP not connected');
    this.tags.set(tag.mappingId, tag);
    const timer = setInterval(() => this.readTag(tag), tag.pollingIntervalMs);
    this.pollTimers.set(tag.mappingId, timer);
    log.info(`Added CIP tag: ${tag.tagPath}`);
  }

  removeTag(mappingId: string): void {
    this.tags.delete(mappingId);
    const timer = this.pollTimers.get(mappingId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(mappingId); }
  }

  private async readTag(tag: CIPTag): Promise<void> {
    try {
      this.readCount++;
      throw new Error('EtherNet/IP provider is not configured. Refusing to fabricate telemetry values.');
    } catch (error) {
      this.errorCount++;
      log.error(`EtherNet/IP read error for ${tag.tagPath}`, error as Error);
    }
  }
}
