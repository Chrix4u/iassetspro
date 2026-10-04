// ============================================================================
// MODBUS TCP PROTOCOL ADAPTER — Industrial Modbus TCP connectivity
// Supports reading coils, discrete inputs, holding registers, input registers
// Supports both polling and on-demand reads
// ============================================================================
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('ModbusAdapter');

export interface ModbusConnectionConfig {
  host: string;
  port: number;
  unitId?: number;
  timeout?: number;
  connectionType?: 'tcp' | 'tcp-rtu' | 'ascii';
}

export interface ModbusPollDefinition {
  functionCode: 1 | 2 | 3 | 4; // 1=coils, 2=discrete inputs, 3=holding registers, 4=input registers
  startAddress: number;
  quantity: number;
  pollingIntervalMs: number;
  mappingId: string;
  tag: string; // e.g. "Pump_01_Speed"
  dataType?: 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64' | 'bool';
  scaleFactor?: number;
  offset?: number;
}

export class ModbusAdapter extends EventEmitter {
  private config: ModbusConnectionConfig;
  private connected = false;
  private connecting = false;
  private pollDefinitions: Map<string, ModbusPollDefinition> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readCount = 0;
  private errorCount = 0;
  private lastDataAt: Date | null = null;

  constructor(config: ModbusConnectionConfig) {
    super();
    this.config = config;
  }

  getStatus() {
    return {
      protocol: 'modbus_tcp',
      connected: this.connected,
      connecting: this.connecting,
      pollDefinitions: Array.from(this.pollDefinitions.values()),
      activePollers: this.pollTimers.size,
      readCount: this.readCount,
      errorCount: this.errorCount,
      lastDataAt: this.lastDataAt,
      host: this.config.host,
      port: this.config.port,
      unitId: this.config.unitId,
    };
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;

    this.connecting = true;
    this.emit('status_change', { status: 'connecting' });
    log.info(`Connecting to Modbus TCP: ${this.config.host}:${this.config.port}`);

    // A real Modbus transport is not bundled yet. Never report a simulated
    // connection as healthy because downstream polling would turn placeholder
    // values into authoritative telemetry.
    const error = new Error(
      'Modbus TCP provider is not configured. Install and wire a supported Modbus transport before enabling this data source.',
    );
    this.connected = false;
    this.connecting = false;
    this.errorCount++;
    this.emit('status_change', { status: 'error', error: error.message });
    log.error('Modbus TCP connection refused: provider not configured', error);
    throw error;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.connecting = false;
    this.stopAllPolling();
    // Production: this.socket?.destroy();
    this.emit('disconnected');
    this.emit('status_change', { status: 'disconnected' });
    log.info('Modbus TCP disconnected');
  }

  addPoll(poll: ModbusPollDefinition): void {
    if (!this.connected) throw new Error('Modbus not connected');
    this.pollDefinitions.set(poll.mappingId, poll);
    const timer = setInterval(() => this.executePoll(poll), poll.pollingIntervalMs);
    this.pollTimers.set(poll.mappingId, timer);
    log.info(`Added Modbus poll: FC${poll.functionCode} addr=${poll.startAddress} qty=${poll.quantity} every ${poll.pollingIntervalMs}ms`);
  }

  removePoll(mappingId: string): void {
    const timer = this.pollTimers.get(mappingId);
    if (timer) { clearInterval(timer); this.pollTimers.delete(mappingId); }
    this.pollDefinitions.delete(mappingId);
    log.info(`Removed Modbus poll for mapping: ${mappingId}`);
  }

  stopAllPolling(): void {
    for (const [id, timer] of this.pollTimers) { clearInterval(timer); }
    this.pollTimers.clear();
    log.info('All Modbus polling stopped');
  }

  async readOnce(functionCode: 1 | 2 | 3 | 4, startAddress: number, quantity: number): Promise<number[]> {
    if (!this.connected) throw new Error('Modbus not connected');

    this.readCount++;
    log.debug(`Modbus read requested: FC${functionCode} addr=${startAddress} qty=${quantity}`);
    throw new Error(
      'Modbus TCP provider is not configured. Refusing to fabricate telemetry values.',
    );
  }

  private async executePoll(poll: ModbusPollDefinition): Promise<void> {
    try {
      const values = await this.readOnce(poll.functionCode, poll.startAddress, poll.quantity);
      this.lastDataAt = new Date();
      let processedValue: number;
      if (values.length > 0) {
        processedValue = (values[0] * (poll.scaleFactor || 1)) + (poll.offset || 0);
      } else {
        processedValue = 0;
      }
      this.emit('data', {
        mappingId: poll.mappingId,
        tag: poll.tag,
        functionCode: poll.functionCode,
        startAddress: poll.startAddress,
        rawValues: values,
        processedValue,
        timestamp: new Date(),
      });
    } catch (error) {
      this.errorCount++;
      log.error(`Modbus poll error for ${poll.tag}`, error as Error);
    }
  }
}
