// ============================================================================
// SIEMENS S7 PROTOCOL ADAPTER — PLC connectivity via S7comm
// Supports S7-200, S7-300, S7-400, S7-1200, S7-1500
// ============================================================================
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('SiemensS7Adapter');

export interface SiemensS7Config {
  host: string;
  port?: number; // default 102
  rack?: number;
  slot?: number;
  plcType?: 'S7-200' | 'S7-300' | 'S7-400' | 'S7-1200' | 'S7-1500';
  timeout?: number;
}

export interface S7DataBlock {
  dbNumber: number;
  startByte: number;
  byteLength: number;
  dataType: 'byte' | 'word' | 'dword' | 'real' | 'int' | 'dint' | 'bool';
  bitOffset?: number; // for bool type
  mappingId: string;
  tag: string;
  pollingIntervalMs: number;
  scaleFactor?: number;
  offset?: number;
}

export class SiemensS7Adapter extends EventEmitter {
  private config: SiemensS7Config;
  private connected = false;
  private dataBlocks: Map<string, S7DataBlock> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readCount = 0;
  private errorCount = 0;

  constructor(config: SiemensS7Config) {
    super();
    this.config = config;
  }

  getStatus() {
    return { protocol: 'siemens_s7', connected: this.connected, dataBlocks: Array.from(this.dataBlocks.values()), activePollers: this.pollTimers.size, readCount: this.readCount, errorCount: this.errorCount, host: this.config.host, port: this.config.port || 102, plcType: this.config.plcType };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.emit('status_change', { status: 'connecting' });
    log.info(`Connecting to Siemens S7: ${this.config.host}:${this.config.port || 102}`);

    const error = new Error(
      'Siemens S7 provider is not configured. Install and wire a supported S7 transport before enabling this data source.',
    );
    this.errorCount++;
    this.emit('status_change', { status: 'error', error: error.message });
    log.error('Siemens S7 connection refused: provider not configured', error);
    throw error;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const [, timer] of this.pollTimers) clearInterval(timer);
    this.pollTimers.clear();
    this.dataBlocks.clear();
    this.emit('disconnected');
    this.emit('status_change', { status: 'disconnected' });
  }

  addDataBlock(block: S7DataBlock): void {
    if (!this.connected) throw new Error('S7 not connected');
    this.dataBlocks.set(block.mappingId, block);
    const timer = setInterval(() => this.readBlock(block), block.pollingIntervalMs);
    this.pollTimers.set(block.mappingId, timer);
    log.info(`Added S7 DB${block.dbNumber} byte ${block.startByte} (${block.tag})`);
  }

  removeDataBlock(mappingId: string): void {
    this.dataBlocks.delete(mappingId);
    const timer = this.pollTimers.get(mappingId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(mappingId); }
  }

  private async readBlock(block: S7DataBlock): Promise<void> {
    try {
      this.readCount++;
      throw new Error('Siemens S7 provider is not configured. Refusing to fabricate telemetry values.');
    } catch (error) {
      this.errorCount++;
      log.error(`S7 read error for DB${block.dbNumber}`, error as Error);
    }
  }
}
