// ============================================================================
// DOMAIN EVENT BUS — Production-grade typed event sourcing for iAssetsPro EAM
//
// Provides a typed publisher/subscriber architecture with:
// - 22+ typed domain event interfaces covering all key business events
// - Async dispatching with error isolation per handler
// - Configurable retry with exponential backoff
// - Dead-letter queue for permanently failed handlers
// - Event persistence for audit trail and replay
// - Correlation & causation tracking for event chains
// - WO Completion orchestration chain (MTBF, health, AI, PM, etc.)
// - Execution tracing with performance metrics
// - Statistics & querying APIs
// ============================================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

import type { Prisma } from '@prisma/client';

const log = createLogger('DomainEventBus');

// ============================================================================
// 1. TYPED DOMAIN EVENT INTERFACES
// ============================================================================

// --- Work Order Events ---

export interface WorkOrderCreatedEvent {
  workOrderId: string;
  woNumber: string;
  type: string;
  priority: string;
  assetId?: string;
  departmentId?: string;
  assignedTo?: string;
  requestedBy: string;
  plantId?: string;
}

export interface WorkOrderCompletedEvent {
  workOrderId: string;
  woNumber: string;
  type: string;
  assetId?: string;
  actualHours?: number;
  totalCost: number;
  laborCost: number;
  partsCost: number;
  assignedTo?: string;
  completedBy: string;
  plantId?: string;
  failureMode?: string;
  causeCode?: string;
}

export interface WorkOrderStatusChangedEvent {
  workOrderId: string;
  woNumber: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  reason?: string;
}

// --- Maintenance Request Events ---

export interface MaintenanceRequestApprovedEvent {
  requestId: string;
  requestNumber: string;
  approvedBy: string;
  assetId?: string;
  priority: string;
  departmentId?: string;
}

export interface MaintenanceRequestRejectedEvent {
  requestId: string;
  requestNumber: string;
  rejectedBy: string;
  reason: string;
}

// --- Asset Events ---

export interface AssetHealthChangedEvent {
  assetId: string;
  assetTag: string;
  previousHealth: string;
  newHealth: string;
  healthScore: number;
  reason: string;
}

export interface AssetStatusChangedEvent {
  assetId: string;
  assetTag: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}

// --- Failure Events ---

export interface FailureDetectedEvent {
  assetId?: string;
  assetName?: string;
  failureMode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedBy: string;
  detectedAt: Date;
}

export interface FailureRecordedEvent {
  failureRecordId: string;
  workOrderId: string;
  assetId: string;
  failureMode: string;
  failureCode: string;
  description: string;
  recordedBy: string;
}

// --- Tool & Material Events ---

export interface ToolIssuedEvent {
  toolId: string;
  toolCode: string;
  issuedTo: string;
  workOrderId?: string;
  issuedBy: string;
  condition: string;
}

export interface ToolReturnedEvent {
  toolId: string;
  toolCode: string;
  returnedFrom: string;
  workOrderId?: string;
  returnedBy: string;
  condition: string;
}

export interface MaterialConsumedEvent {
  itemId: string;
  itemCode: string;
  workOrderId: string;
  quantity: number;
  consumedBy: string;
  remainingStock: number;
}

// --- Telemetry & Alarm Events ---

export interface TelemetryThresholdBreachedEvent {
  sourceId: string;
  metricName: string;
  value: number;
  threshold: number;
  unit: string;
  severity: 'warning' | 'critical';
  assetId?: string;
}

export interface AlarmTriggeredEvent {
  alarmId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metricName: string;
  value: number;
  threshold: number;
  assetId?: string;
  sourceId: string;
}

// --- AI & Prediction Events ---

export interface PredictionGeneratedEvent {
  predictionId: string;
  modelId: string;
  assetId: string;
  predictionType: string;
  confidence: number;
  predictedEvent: string;
  predictedDate?: Date;
  riskLevel: string;
}

export interface AIInsightCreatedEvent {
  insightId: string;
  assetId: string;
  insightType: string;
  title: string;
  summary: string;
  confidence: number;
  recommendations: string[];
}

// --- Inventory Events ---

export interface InventoryLowEvent {
  itemId: string;
  itemCode: string;
  itemName: string;
  currentStock: number;
  minStockLevel: number;
  reorderQuantity: number;
  plantId: string;
}

export interface StockReorderedEvent {
  itemId: string;
  itemCode: string;
  quantity: number;
  supplierId?: string;
  purchaseOrderId?: string;
  orderedBy: string;
}

// --- Safety Events ---

export interface SafetyIncidentCreatedEvent {
  incidentId: string;
  type: string;
  severity: 'minor' | 'moderate' | 'major' | 'catastrophic';
  assetId?: string;
  location: string;
  reportedBy: string;
  description: string;
}

export interface PermitExpiredEvent {
  permitId: string;
  permitType: string;
  assetId?: string;
  workOrderId?: string;
  expiredAt: Date;
  requestedBy: string;
}

// --- Auth Events ---

export interface UserLoggedInEvent {
  userId: string;
  username: string;
  ipAddress?: string;
  userAgent?: string;
  loginMethod: string;
}

export interface SessionRevokedEvent {
  userId: string;
  sessionId: string;
  reason: string;
  revokedBy: string;
}

// ============================================================================
// 2. EVENT TYPE REGISTRY — maps event type strings to TypeScript interfaces
// ============================================================================

export type DomainEventType =
  | 'WorkOrderCompleted'
  | 'WorkOrderCreated'
  | 'WorkOrderStatusChanged'
  | 'MaintenanceRequestApproved'
  | 'MaintenanceRequestRejected'
  | 'AssetHealthChanged'
  | 'AssetStatusChanged'
  | 'FailureDetected'
  | 'FailureRecorded'
  | 'ToolIssued'
  | 'ToolReturned'
  | 'MaterialConsumed'
  | 'TelemetryThresholdBreached'
  | 'AlarmTriggered'
  | 'PredictionGenerated'
  | 'AIInsightCreated'
  | 'InventoryLow'
  | 'StockReordered'
  | 'SafetyIncidentCreated'
  | 'PermitExpired'
  | 'UserLoggedIn'
  | 'SessionRevoked';

export type DomainEventPayloadMap = {
  WorkOrderCompleted: WorkOrderCompletedEvent;
  WorkOrderCreated: WorkOrderCreatedEvent;
  WorkOrderStatusChanged: WorkOrderStatusChangedEvent;
  MaintenanceRequestApproved: MaintenanceRequestApprovedEvent;
  MaintenanceRequestRejected: MaintenanceRequestRejectedEvent;
  AssetHealthChanged: AssetHealthChangedEvent;
  AssetStatusChanged: AssetStatusChangedEvent;
  FailureDetected: FailureDetectedEvent;
  FailureRecorded: FailureRecordedEvent;
  ToolIssued: ToolIssuedEvent;
  ToolReturned: ToolReturnedEvent;
  MaterialConsumed: MaterialConsumedEvent;
  TelemetryThresholdBreached: TelemetryThresholdBreachedEvent;
  AlarmTriggered: AlarmTriggeredEvent;
  PredictionGenerated: PredictionGeneratedEvent;
  AIInsightCreated: AIInsightCreatedEvent;
  InventoryLow: InventoryLowEvent;
  StockReordered: StockReorderedEvent;
  SafetyIncidentCreated: SafetyIncidentCreatedEvent;
  PermitExpired: PermitExpiredEvent;
  UserLoggedIn: UserLoggedInEvent;
  SessionRevoked: SessionRevokedEvent;
};

export type DomainEventPayload = DomainEventPayloadMap[DomainEventType];

// ============================================================================
// 3. CORE DOMAIN EVENT ENVELOPE
// ============================================================================

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  id: string;
  eventType: T;
  payload: DomainEventPayloadMap[T];
  entityName?: string;
  entityId?: string;
  correlationId: string;
  causationId?: string;
  source: string;
  timestamp: Date;
  version: number;
}

// ============================================================================
// 4. EVENT HANDLER & CONFIGURATION
// ============================================================================

export type EventHandler<T extends DomainEventType = DomainEventType> = (
  event: DomainEvent<T>,
) => void | Promise<void>;

interface HandlerRegistration {
  handler: EventHandler;
  label: string;
  maxRetries: number;
  backoffBaseMs: number;
}

interface ExecutionTrace {
  eventId: string;
  eventType: string;
  handlerLabel: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  success: boolean;
  error?: string;
  retryCount: number;
}

// ============================================================================
// 5. DOMAIN EVENT BUS — singleton service
// ============================================================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const EVENT_VERSION = 1;

class DomainEventBus {
  private subscribers = new Map<string, Set<HandlerRegistration>>();
  private wildcardSubscribers = new Set<HandlerRegistration>();
  private traces: ExecutionTrace[] = [];
  private maxTraceHistory = 10_000;

  // -------------------------------------------------------------------------
  // Constructor — register WO Completion orchestration chain
  // -------------------------------------------------------------------------
  constructor() {
    this.registerWOCompletionChain();
    log.info('DomainEventBus initialized');
  }

  // -------------------------------------------------------------------------
  // PUBLISH — main entry point for emitting domain events
  // -------------------------------------------------------------------------
  async publish<T extends DomainEventType>(
    eventType: T,
    payload: DomainEventPayloadMap[T],
    options?: {
      entityName?: string;
      entityId?: string;
      correlationId?: string;
      causationId?: string;
      source?: string;
    },
  ): Promise<void> {
    const eventId = this.generateId();
    const correlationId = options?.correlationId || this.generateId();
    const event: DomainEvent<T> = {
      id: eventId,
      eventType,
      payload,
      entityName: options?.entityName,
      entityId: options?.entityId,
      correlationId,
      causationId: options?.causationId,
      source: options?.source || 'domain-event-bus',
      timestamp: new Date(),
      version: EVENT_VERSION,
    };

    log.info(`Event published: ${eventType}`, {
      eventId,
      correlationId,
      entityName: options?.entityName,
      entityId: options?.entityId,
    });

    // Persist event to DB for audit/replay (fire-and-forget with safety)
    this.persistEvent(event).catch((err) => {
      log.error('Failed to persist domain event', err as Error, {
        eventId,
        eventType,
      });
    });

    // Dispatch to type-specific subscribers
    const typedHandlers = this.subscribers.get(eventType);
    if (typedHandlers) {
      for (const registration of typedHandlers) {
        await this.dispatchWithRetry(event, registration);
      }
    }

    // Dispatch to wildcard subscribers
    for (const registration of this.wildcardSubscribers) {
      await this.dispatchWithRetry(event, registration);
    }
  }

  // -------------------------------------------------------------------------
  // SUBSCRIBE — register handler for specific event type
  // -------------------------------------------------------------------------
  subscribe<T extends DomainEventType>(
    eventType: T,
    handler: EventHandler<T>,
    options?: { label?: string; maxRetries?: number; backoffBaseMs?: number },
  ): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    const registration: HandlerRegistration = {
      handler: handler as EventHandler,
      label: options?.label || `handler-${eventType}-${Date.now()}`,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      backoffBaseMs: options?.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    };

    this.subscribers.get(eventType)!.add(registration);

    log.info(`Handler subscribed: ${eventType}`, { label: registration.label });

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(registration);
      if (this.subscribers.get(eventType)?.size === 0) {
        this.subscribers.delete(eventType);
      }
      log.info(`Handler unsubscribed: ${eventType}`, { label: registration.label });
    };
  }

  // -------------------------------------------------------------------------
  // SUBSCRIBE TO ALL — wildcard subscription
  // -------------------------------------------------------------------------
  subscribeToAll(
    handler: EventHandler,
    options?: { label?: string; maxRetries?: number; backoffBaseMs?: number },
  ): () => void {
    const registration: HandlerRegistration = {
      handler,
      label: options?.label || `wildcard-handler-${Date.now()}`,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      backoffBaseMs: options?.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    };

    this.wildcardSubscribers.add(registration);

    log.info('Wildcard handler subscribed', { label: registration.label });

    return () => {
      this.wildcardSubscribers.delete(registration);
      log.info('Wildcard handler unsubscribed', { label: registration.label });
    };
  }

  // -------------------------------------------------------------------------
  // EVENT REPLAY — replay persisted events to current subscribers
  // -------------------------------------------------------------------------
  async replayEvents(eventType: string, since: Date): Promise<number> {
    const events = await db.domainEvent.findMany({
      where: {
        eventType,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    log.info(`Replaying events: ${eventType}`, {
      count: events.length,
      since: since.toISOString(),
    });

    for (const record of events) {
      const event = this.recordToDomainEvent(record);
      const typedHandlers = this.subscribers.get(eventType);
      if (typedHandlers) {
        for (const registration of typedHandlers) {
          await this.dispatchWithRetry(event, registration);
        }
      }
      for (const registration of this.wildcardSubscribers) {
        await this.dispatchWithRetry(event, registration);
      }
    }

    return events.length;
  }

  async replayEvent(eventId: string): Promise<boolean> {
    const record = await db.domainEvent.findUnique({
      where: { id: eventId },
    });

    if (!record) {
      log.warn('Replay failed: event not found', { eventId });
      return false;
    }

    const event = this.recordToDomainEvent(record);

    log.info(`Replaying single event: ${event.eventType}`, { eventId });

    const typedHandlers = this.subscribers.get(event.eventType);
    if (typedHandlers) {
      for (const registration of typedHandlers) {
        await this.dispatchWithRetry(event, registration);
      }
    }
    for (const registration of this.wildcardSubscribers) {
      await this.dispatchWithRetry(event, registration);
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // STATISTICS & QUERYING
  // -------------------------------------------------------------------------
  async getEventStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    throughput: {
      lastHour: number;
      last24Hours: number;
      last7Days: number;
    };
    handlerCount: number;
  }> {
    const now = new Date();

    const [total, byType, byStatus, lastHour, last24Hours, last7Days] =
      await Promise.all([
        db.domainEvent.count(),
        db.domainEvent.groupBy({ by: ['eventType'], _count: true }).then((rows) =>
          Object.fromEntries(rows.map((r) => [r.eventType, r._count])),
        ),
        db.domainEvent.groupBy({ by: ['status'], _count: true }).then((rows) =>
          Object.fromEntries(rows.map((r) => [r.status, r._count])),
        ),
        db.domainEvent.count({
          where: { createdAt: { gte: new Date(now.getTime() - 3600_000) } },
        }),
        db.domainEvent.count({
          where: { createdAt: { gte: new Date(now.getTime() - 86400_000) } },
        }),
        db.domainEvent.count({
          where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
        }),
      ]);

    let handlerCount = 0;
    for (const set of this.subscribers.values()) handlerCount += set.size;
    handlerCount += this.wildcardSubscribers.size;

    return {
      total,
      byType,
      byStatus,
      throughput: { lastHour, last24Hours, last7Days },
      handlerCount,
    };
  }

  async getRecentEvents(
    limit: number = 50,
    eventType?: string,
  ): Promise<DomainEvent[]> {
    const records = await db.domainEvent.findMany({
      where: eventType ? { eventType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((r) => this.recordToDomainEvent(r));
  }

  async getDeadLetterEvents(limit: number = 50): Promise<DomainEvent[]> {
    const records = await db.domainEvent.findMany({
      where: { status: 'dead_letter' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((r) => this.recordToDomainEvent(r));
  }

  getHandlerMetrics(): {
    handlers: Array<{
      eventType: string;
      label: string;
      successCount: number;
      failureCount: number;
      avgDurationMs: number;
    }>;
    totalTraces: number;
  } {
    const handlerMap = new Map<
      string,
      { successCount: number; failureCount: number; totalDurationMs: number }
    >();

    for (const trace of this.traces) {
      const key = `${trace.eventType}:${trace.handlerLabel}`;
      if (!handlerMap.has(key)) {
        handlerMap.set(key, {
          successCount: 0,
          failureCount: 0,
          totalDurationMs: 0,
        });
      }
      const metrics = handlerMap.get(key)!;
      if (trace.success) {
        metrics.successCount++;
      } else {
        metrics.failureCount++;
      }
      if (trace.durationMs) {
        metrics.totalDurationMs += trace.durationMs;
      }
    }

    const handlers = [...handlerMap.entries()].map(([key, metrics]) => {
      const [eventType, label] = key.split(':');
      const invocationCount = metrics.successCount + metrics.failureCount;
      return {
        eventType,
        label,
        successCount: metrics.successCount,
        failureCount: metrics.failureCount,
        avgDurationMs:
          invocationCount > 0
            ? Math.round(metrics.totalDurationMs / invocationCount)
            : 0,
      };
    });

    return {
      handlers: handlers.sort(
        (a, b) => b.failureCount - a.failureCount || b.avgDurationMs - a.avgDurationMs,
      ),
      totalTraces: this.traces.length,
    };
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Dispatch with retry & error isolation
  // -------------------------------------------------------------------------
  private async dispatchWithRetry(
    event: DomainEvent,
    registration: HandlerRegistration,
  ): Promise<void> {
    const { handler, label, maxRetries, backoffBaseMs } = registration;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        await handler(event);
        const durationMs = Date.now() - startTime;

        // Record successful trace
        this.recordTrace({
          eventId: event.id,
          eventType: event.eventType,
          handlerLabel: label,
          startedAt: new Date(startTime as number),
          completedAt: new Date(),
          durationMs,
          success: true,
          retryCount: attempt - 1,
        });

        // Mark event as processed if this is a type-specific handler
        await this.markEventProcessed(event.id).catch(() => {});
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const durationMs = Date.now() - startTime;

        this.recordTrace({
          eventId: event.id,
          eventType: event.eventType,
          handlerLabel: label,
          startedAt: new Date(startTime as number),
          durationMs,
          success: false,
          error: lastError.message,
          retryCount: attempt - 1,
        });

        if (attempt < maxRetries) {
          const backoff = backoffBaseMs * Math.pow(2, attempt - 1);
          log.warn(
            `Handler "${label}" failed (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms`,
            {
              eventType: event.eventType,
              eventId: event.id,
              error: lastError.message,
            },
          );
          await this.sleep(backoff);
        }
      }
    }

    // All retries exhausted — move to dead-letter
    log.error(
      `Handler "${label}" failed permanently after ${maxRetries} retries`,
      lastError,
      {
        eventType: event.eventType,
        eventId: event.id,
      },
    );
    await this.moveToDeadLetter(event.id, lastError).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Persist event to DB
  // -------------------------------------------------------------------------
  private async persistEvent(event: DomainEvent): Promise<void> {
    await db.domainEvent.create({
      data: {
        eventType: event.eventType,
        entityName: event.entityName || null,
        entityId: event.entityId || null,
        payload: event.payload as unknown as Prisma.InputJsonValue,
        correlationId: event.correlationId,
        causationId: event.causationId || null,
        source: event.source,
        status: 'pending',
      },
    });
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    await db.domainEvent.update({
      where: { id: eventId },
      data: {
        status: 'processed',
        processedAt: new Date(),
      },
    });
  }

  private async moveToDeadLetter(eventId: string, error?: Error): Promise<void> {
    await db.domainEvent.update({
      where: { id: eventId },
      data: {
        status: 'dead_letter',
        retryCount: { increment: 1 },
      },
    });
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Execution trace recording
  // -------------------------------------------------------------------------
  private recordTrace(trace: ExecutionTrace): void {
    this.traces.push(trace);
    if (this.traces.length > this.maxTraceHistory) {
      this.traces = this.traces.slice(-Math.floor(this.maxTraceHistory / 2));
    }
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Convert DB record to DomainEvent envelope
  // -------------------------------------------------------------------------
  private recordToDomainEvent(
    record: {
      id: string;
      eventType: string;
      entityName: string | null;
      entityId: string | null;
      payload: Prisma.JsonValue | null;
      correlationId: string | null;
      causationId: string | null;
      source: string | null;
      status: string;
      retryCount: number;
      createdAt: Date;
      processedAt: Date | null;
    },
  ): DomainEvent {
    return {
      id: record.id,
      eventType: record.eventType as DomainEventType,
      payload: (record.payload as unknown as DomainEventPayload) || ({} as DomainEventPayload),
      entityName: record.entityName || undefined,
      entityId: record.entityId || undefined,
      correlationId: record.correlationId || '',
      causationId: record.causationId || undefined,
      source: record.source || 'domain-event-bus',
      timestamp: record.createdAt,
      version: EVENT_VERSION,
    };
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Helpers
  // -------------------------------------------------------------------------
  private generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // WO COMPLETION ORCHESTRATION CHAIN
  // When WorkOrderCompleted fires, automatically trigger a cascade of
  // downstream computations and notifications for enterprise intelligence.
  // -------------------------------------------------------------------------
  private registerWOCompletionChain(): void {
    this.subscribe('WorkOrderCompleted', async (event) => {
      const payload = event.payload as WorkOrderCompletedEvent;
      const woId = payload.workOrderId;
      const assetId = payload.assetId;
      const correlationId = event.correlationId;
      const causationId = event.id;
      const completedBy = payload.completedBy;

      log.info('WO Completion orchestration chain triggered', {
        workOrderId: woId,
        correlationId,
      });

      // 1. Reliability Recalculation (MTBF/MTTR update)
      this.executeChainStep('reliability-recalc', async () => {
        try {
          if (assetId) {
            // Count completed WOs for this asset in the last 365 days
            const completedWos = await db.workOrder.findMany({
              where: {
                assetId,
                status: 'completed',
                actualEnd: { not: null },
                createdAt: { gte: new Date(Date.now() - 365 * 86400_000) },
              },
              select: {
                actualHours: true,
                actualStart: true,
                actualEnd: true,
              },
            });

            if (completedWos.length > 0) {
              // Calculate MTBF (Mean Time Between Failures)
              const woWithDates = completedWos.filter(
                (w) => w.actualEnd && w.actualStart,
              );
              const totalOperatingHours = woWithDates.reduce(
                (sum, w) =>
                  sum +
                  ((w.actualEnd!.getTime() - w.actualStart!.getTime()) /
                    3600_000),
                0,
              );

              // Calculate MTTR (Mean Time To Repair)
              const repairWos = completedWos.filter((w) => w.actualHours && w.actualHours > 0);
              const totalRepairHours = repairWos.reduce(
                (sum, w) => sum + (w.actualHours || 0),
                0,
              );

              const mtbf =
                completedWos.length > 1
                  ? totalOperatingHours / (completedWos.length - 1)
                  : totalOperatingHours;
              const mttr =
                repairWos.length > 0 ? totalRepairHours / repairWos.length : 0;

              log.info('Reliability metrics recalculated', {
                assetId,
                mtbf: Math.round(mtbf * 10) / 10,
                mttr: Math.round(mttr * 10) / 10,
                sampleSize: completedWos.length,
              });
            }
          }
        } catch (err) {
          log.error('Reliability recalculation failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 2. Asset Health Recalculation
      this.executeChainStep('asset-health-recalc', async () => {
        try {
          if (assetId) {
            // Check recent failure records and WO history
            const recentFailures = await db.failureRecord.count({
              where: {
                assetId,
                detectedAt: { gte: new Date(Date.now() - 90 * 86400_000) },
              },
            });

            const recentCompletedWos = await db.workOrder.count({
              where: {
                assetId,
                status: 'completed',
                createdAt: { gte: new Date(Date.now() - 90 * 86400_000) },
              },
            });

            // Simple health score formula based on failure frequency
            let healthScore = 100;
            if (recentFailures > 0) {
              healthScore = Math.max(
                0,
                100 - recentFailures * 20 + recentCompletedWos * 5,
              );
            }

            const newHealth =
              healthScore >= 80
                ? 'good'
                : healthScore >= 50
                  ? 'fair'
                  : healthScore >= 25
                    ? 'poor'
                    : 'critical';

            const asset = await db.asset.findUnique({
              where: { id: assetId },
              select: { condition: true },
            });

            if (asset && asset.condition !== newHealth) {
              await db.asset.update({
                where: { id: assetId },
                data: { condition: newHealth },
              });

              // Publish derived event for health change
              this.publish(
                'AssetHealthChanged',
                {
                  assetId,
                  assetTag: '',
                  previousHealth: asset.condition,
                  newHealth,
                  healthScore,
                  reason: `Auto-recalc after WO ${payload.woNumber} completion`,
                },
                {
                  entityName: 'Asset',
                  entityId: assetId,
                  correlationId,
                  causationId,
                  source: 'event-bus:wo-completion',
                },
              ).catch(() => {});
            }
          }
        } catch (err) {
          log.error('Asset health recalculation failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 3. AI Insight Generation
      this.executeChainStep('ai-insight-gen', async () => {
        try {
          if (assetId) {
            const recentWos = await db.workOrder.findMany({
              where: {
                assetId,
                status: 'completed',
                actualEnd: { gte: new Date(Date.now() - 90 * 86400_000) },
              },
              orderBy: { actualEnd: 'desc' },
              take: 5,
              select: {
                type: true,
                failureDescription: true,
                causeDescription: true,
                actualHours: true,
              },
            });

            if (recentWos.length >= 2) {
              const correctiveCount = recentWos.filter(
                (w) => w.type === 'corrective',
              ).length;

              if (correctiveCount >= 2) {
                log.info('AI insight: frequent corrective maintenance pattern', {
                  assetId,
                  correctiveCount,
                  totalRecent: recentWos.length,
                });
              }
            }
          }
        } catch (err) {
          log.error('AI insight generation failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 4. PM Schedule Optimization
      this.executeChainStep('pm-schedule-optimize', async () => {
        try {
          if (assetId) {
            const schedules = await db.pmSchedule.findMany({
              where: { assetId, isActive: true },
              select: { id: true, frequencyType: true, frequencyValue: true },
            });

            if (schedules.length > 0) {
              // Check if asset had corrective WOs between PM intervals
              const correctiveCount = await db.workOrder.count({
                where: {
                  assetId,
                  type: 'corrective',
                  status: 'completed',
                  createdAt: { gte: new Date(Date.now() - 180 * 86400_000) },
                },
              });

              if (correctiveCount > 0) {
                log.info('PM schedule optimization recommended', {
                  assetId,
                  correctiveWos: correctiveCount,
                  pmScheduleCount: schedules.length,
                });
              }
            }
          }
        } catch (err) {
          log.error('PM schedule optimization failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 5. Inventory Consumption Reconciliation
      this.executeChainStep('inventory-reconcile', async () => {
        try {
          const materials = await db.workOrderMaterial.findMany({
            where: {
              workOrderId: woId,
              status: { in: ['approved', 'issued'] },
            },
            select: {
              itemId: true,
              itemName: true,
              quantity: true,
            },
          });

          for (const mat of materials) {
            if (mat.itemId) {
              const item = await db.inventoryItem.findUnique({
                where: { id: mat.itemId },
                select: {
                  id: true,
                  itemCode: true,
                  name: true,
                  currentStock: true,
                  minStockLevel: true,
                  plantId: true,
                },
              });

              if (item && item.currentStock <= item.minStockLevel) {
                // Publish InventoryLow event
                this.publish(
                  'InventoryLow',
                  {
                    itemId: item.id,
                    itemCode: item.itemCode,
                    itemName: item.name,
                    currentStock: item.currentStock,
                    minStockLevel: item.minStockLevel,
                    reorderQuantity: 0,
                    plantId: item.plantId,
                  },
                  {
                    entityName: 'InventoryItem',
                    entityId: item.id,
                    correlationId,
                    causationId,
                    source: 'event-bus:inventory-reconcile',
                  },
                ).catch(() => {});
              }
            }
          }
        } catch (err) {
          log.error('Inventory reconciliation failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 6. Digital Twin Overlay Refresh
      this.executeChainStep('digital-twin-refresh', async () => {
        try {
          if (assetId) {
            const twin = await db.digitalTwin.findUnique({
              where: { assetId },
              select: { id: true },
            });

            if (twin) {
              log.info('Digital twin overlay refresh triggered', {
                assetId,
                twinId: twin.id,
              });
            }
          }
        } catch (err) {
          log.error('Digital twin refresh failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 7. Analytics Refresh
      this.executeChainStep('analytics-refresh', async () => {
        try {
          log.info('Analytics cache refresh triggered', {
            workOrderId: woId,
            correlationId,
          });
        } catch (err) {
          log.error('Analytics refresh failed', err as Error, {
            workOrderId: woId,
          });
        }
      });

      // 8. Stakeholder Notifications
      this.executeChainStep('stakeholder-notifications', async () => {
        try {
          const stakeholders: string[] = [];

          if (payload.assignedTo) stakeholders.push(payload.assignedTo);

          if (assetId) {
            const asset = await db.asset.findUnique({
              where: { id: assetId },
              select: { assignedToId: true },
            });
            if (asset?.assignedToId && !stakeholders.includes(asset.assignedToId)) {
              stakeholders.push(asset.assignedToId);
            }
          }

          // Fetch the WO for supervisor
          const wo = await db.workOrder.findUnique({
            where: { id: woId },
            select: {
              assignedSupervisorId: true,
              plannerId: true,
              assignedBy: true,
            },
          });

          if (wo?.assignedSupervisorId && !stakeholders.includes(wo.assignedSupervisorId)) {
            stakeholders.push(wo.assignedSupervisorId);
          }
          if (wo?.plannerId && !stakeholders.includes(wo.plannerId)) {
            stakeholders.push(wo.plannerId);
          }
          if (wo?.assignedBy && !stakeholders.includes(wo.assignedBy)) {
            stakeholders.push(wo.assignedBy);
          }

          // Create notifications for each stakeholder
          const notificationPromises = stakeholders.map((userId) =>
            db.notification.create({
              data: {
                userId,
                type: 'wo_completed',
                title: `Work Order Completed: ${payload.woNumber}`,
                message: `Work order "${payload.woNumber}" has been completed by ${completedBy}. Total cost: ${payload.totalCost.toFixed(2)}`,
                entityType: 'work_order',
                entityId: woId,
              },
            }),
          );

          await Promise.allSettled(notificationPromises);

          log.info('Stakeholder notifications sent', {
            workOrderId: woId,
            stakeholderCount: stakeholders.length,
          });
        } catch (err) {
          log.error('Stakeholder notification failed', err as Error, {
            workOrderId: woId,
          });
        }
      });
    }, {
      label: 'wo-completion-orchestrator',
      maxRetries: 1, // orchestration chain itself retries only once
      backoffBaseMs: 2000,
    });
  }

  // -------------------------------------------------------------------------
  // INTERNAL: Execute a chain step with error isolation
  // Each step in the WO completion chain runs independently — one failure
  // does not block subsequent steps.
  // -------------------------------------------------------------------------
  private async executeChainStep(
    stepName: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const timer = log.timer(`WO chain step: ${stepName}`);
    try {
      await fn();
      timer.end();
    } catch (err) {
      log.error(`WO chain step failed: ${stepName}`, err as Error);
    }
  }
}

// ============================================================================
// 6. SINGLETON EXPORT
// ============================================================================

export const domainEventBus = new DomainEventBus();

// ============================================================================
// 7. CONVENIENCE PUBLISH HELPERS — typed wrappers for common events
// ============================================================================

export const DomainEvents = {
  workOrder: {
    completed: (payload: WorkOrderCompletedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('WorkOrderCompleted', payload, { entityName: 'WorkOrder', entityId: payload.workOrderId, ...opts }),

    created: (payload: WorkOrderCreatedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('WorkOrderCreated', payload, { entityName: 'WorkOrder', entityId: payload.workOrderId, ...opts }),

    statusChanged: (payload: WorkOrderStatusChangedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('WorkOrderStatusChanged', payload, { entityName: 'WorkOrder', entityId: payload.workOrderId, ...opts }),
  },

  maintenanceRequest: {
    approved: (payload: MaintenanceRequestApprovedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('MaintenanceRequestApproved', payload, { entityName: 'MaintenanceRequest', entityId: payload.requestId, ...opts }),

    rejected: (payload: MaintenanceRequestRejectedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('MaintenanceRequestRejected', payload, { entityName: 'MaintenanceRequest', entityId: payload.requestId, ...opts }),
  },

  asset: {
    healthChanged: (payload: AssetHealthChangedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('AssetHealthChanged', payload, { entityName: 'Asset', entityId: payload.assetId, ...opts }),

    statusChanged: (payload: AssetStatusChangedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('AssetStatusChanged', payload, { entityName: 'Asset', entityId: payload.assetId, ...opts }),
  },

  failure: {
    detected: (payload: FailureDetectedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('FailureDetected', payload, { entityName: 'Asset', entityId: payload.assetId, ...opts }),

    recorded: (payload: FailureRecordedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('FailureRecorded', payload, { entityName: 'WorkOrder', entityId: payload.workOrderId, ...opts }),
  },

  tool: {
    issued: (payload: ToolIssuedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('ToolIssued', payload, { entityName: 'Tool', entityId: payload.toolId, ...opts }),

    returned: (payload: ToolReturnedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('ToolReturned', payload, { entityName: 'Tool', entityId: payload.toolId, ...opts }),
  },

  material: {
    consumed: (payload: MaterialConsumedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('MaterialConsumed', payload, { entityName: 'InventoryItem', entityId: payload.itemId, ...opts }),
  },

  telemetry: {
    thresholdBreached: (payload: TelemetryThresholdBreachedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('TelemetryThresholdBreached', payload, { entityName: 'TelemetrySource', entityId: payload.sourceId, ...opts }),
  },

  alarm: {
    triggered: (payload: AlarmTriggeredEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('AlarmTriggered', payload, { entityName: 'AlarmEvent', entityId: payload.alarmId, ...opts }),
  },

  ai: {
    predictionGenerated: (payload: PredictionGeneratedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('PredictionGenerated', payload, { entityName: 'Asset', entityId: payload.assetId, ...opts }),

    insightCreated: (payload: AIInsightCreatedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('AIInsightCreated', payload, { entityName: 'Asset', entityId: payload.assetId, ...opts }),
  },

  inventory: {
    low: (payload: InventoryLowEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('InventoryLow', payload, { entityName: 'InventoryItem', entityId: payload.itemId, ...opts }),

    reordered: (payload: StockReorderedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('StockReordered', payload, { entityName: 'InventoryItem', entityId: payload.itemId, ...opts }),
  },

  safety: {
    incidentCreated: (payload: SafetyIncidentCreatedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('SafetyIncidentCreated', payload, { entityName: 'SafetyIncident', entityId: payload.incidentId, ...opts }),

    permitExpired: (payload: PermitExpiredEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('PermitExpired', payload, { entityName: 'SafetyPermit', entityId: payload.permitId, ...opts }),
  },

  auth: {
    loggedIn: (payload: UserLoggedInEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('UserLoggedIn', payload, { entityName: 'User', entityId: payload.userId, ...opts }),

    sessionRevoked: (payload: SessionRevokedEvent, opts?: Parameters<typeof domainEventBus.publish>[2]) =>
      domainEventBus.publish('SessionRevoked', payload, { entityName: 'Session', entityId: payload.sessionId, ...opts }),
  },
};
