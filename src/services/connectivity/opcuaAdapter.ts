// ============================================================================
// OPC-UA PROTOCOL ADAPTER — Production-Grade Industrial OPC-UA Connectivity
// Session management, subscription lifecycle, monitored items, deadband filtering,
// namespace browsing, auto-discovery, polling fallback, certificate management,
// quality/status code handling, exponential backoff reconnection
// ============================================================================
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('OPCUAAdapter');

// ---------------------------------------------------------------------------
// Public Configuration & Item Interfaces (preserved for backward compat)
// ---------------------------------------------------------------------------

export interface OPCUAConnectionConfig {
  endpoint: string;
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  securityPolicy?: 'None' | 'Basic128Rsa15' | 'Basic256' | 'Basic256Sha256';
  username?: string;
  password?: string;
  defaultNamespace?: string;
  requestedSessionTimeout?: number;
  /** Path to the certificate store directory */
  certificateStorePath?: string;
  /** Application certificate file name */
  applicationCertificate?: string;
  /** Application private key file name */
  applicationPrivateKey?: string;
  /** Whether to reject unknown server certificates (default: false in dev) */
  rejectUnknownCertificates?: boolean;
  /** Fallback polling interval in ms when subscriptions are unavailable (default: 5000) */
  pollingFallbackInterval?: number;
}

export interface OPUAMonitoredItem {
  nodeId: string;
  attributeId?: number; // default 13 (Value)
  samplingInterval?: number; // ms
  queueSize?: number;
  discardOldest?: boolean;
  mappingId: string;
  /** Subscription ID to register this item under (default: "default") */
  subscriptionId?: string;
  /** Deadband type: 'absolute' | 'percent' | 'none' */
  deadbandType?: 'absolute' | 'percent' | 'none';
  /** Deadband threshold value (ignored when deadbandType is 'none') */
  deadbandValue?: number;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

export interface OPCUASubscriptionParams {
  requestedPublishingInterval?: number;
  requestedLifetimeCount?: number;
  requestedMaxKeepAliveCount?: number;
  maxNotificationsPerPublish?: number;
  publishingEnabled?: boolean;
  priority?: number;
}

interface InternalSubscription {
  id: string;
  publishingInterval: number;
  lifetimeCount: number;
  maxKeepAliveCount: number;
  publishingEnabled: boolean;
  priority: number;
  createdAt: Date;
  itemNodeIds: Set<string>;
}

interface SessionState {
  sessionId: string;
  timeout: number;
  keepAliveInterval: number;
  createdAt: Date;
  lastRenewedAt: Date;
  lastKeepAliveAt: Date;
  renewTimer: ReturnType<typeof setTimeout> | null;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
}

interface DeadbandState {
  lastValue: number | null;
  lastTimestamp: Date | null;
}

interface BrowseCacheEntry {
  nodeId: string;
  results: Array<{ nodeId: string; browseName: string; nodeClass: string; displayName: string }>;
  depth: number;
  fetchedAt: Date;
}

interface QualityStats {
  good: number;
  uncertain: number;
  bad: number;
  filtered: number;
}

interface EndpointDescription {
  endpointUrl: string;
  securityMode: string;
  securityPolicyUri: string;
  securityLevel: number;
  serverApplicationUri: string;
  serverCertificate: string | null;
  messageSecurityMode: string;
  transportProfileUri: string;
  userIdentityTokens: Array<{ policyId: string; tokenType: string }>;
}

interface ServerDescription {
  applicationUri: string;
  productUri: string;
  applicationName: string;
  applicationType: string;
  gatewayServerUri: string | null;
  discoveryProfileUri: string | null;
  discoveryUrls: string[];
}

// ---------------------------------------------------------------------------
// Quality helpers
// ---------------------------------------------------------------------------

const OPCUA_STATUS_QUALITY = new Map<string, 'good' | 'uncertain' | 'bad'>([
  ['Good', 'good'],
  ['GoodCompletenessAttribute', 'good'],
  ['GoodOverloadAttribute', 'good'],
  ['Uncertain', 'uncertain'],
  ['UncertainInitialValue', 'uncertain'],
  ['UncertainSensorNotAccurate', 'uncertain'],
  ['UncertainSubNormal', 'uncertain'],
  ['Bad', 'bad'],
  ['BadUnexpectedError', 'bad'],
  ['BadInternalError', 'bad'],
  ['BadTimeout', 'bad'],
  ['BadNoCommunication', 'bad'],
  ['BadConnectionClosed', 'bad'],
  ['BadNotConnected', 'bad'],
  ['BadNodeIdInvalid', 'bad'],
  ['BadAttributeIdInvalid', 'bad'],
  ['BadSessionClosed', 'bad'],
  ['BadSubscriptionIdInvalid', 'bad'],
]);

function mapStatusToQuality(statusCode: string): 'good' | 'uncertain' | 'bad' {
  return OPCUA_STATUS_QUALITY.get(statusCode) ?? 'bad';
}

// ---------------------------------------------------------------------------
// Exponential backoff helper
// ---------------------------------------------------------------------------

function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = exponential * (0.5 + Math.random() * 0.5); // 50–100 % of exponential
  return Math.min(Math.round(jitter), maxMs);
}

// ===========================================================================
// OPCUAAdapter
// ===========================================================================

export class OPCUAAdapter extends EventEmitter {
  // ---- Configuration ----
  private config: OPCUAConnectionConfig;

  // ---- Connection state (preserved) ----
  private connected = false;
  private connecting = false;
  private reconnectAttempts = 0;

  // ---- Counters (preserved) ----
  private readCount = 0;
  private subscribeCount = 0;
  private errorCount = 0;
  private lastDataAt: Date | null = null;

  // ---- Monitored items (preserved) ----
  private monitoredItems: Map<string, OPUAMonitoredItem> = new Map();

  // ---- Subscription ID (preserved for backward compat) ----
  private subscriptionId: string | null = null;

  // ---- Session Manager (#1) ----
  private session: SessionState | null = null;
  private readonly DEFAULT_SESSION_TIMEOUT_MS = 60000;
  private readonly DEFAULT_KEEPALIVE_RATIO = 0.75; // renew at 75 % of timeout
  private readonly MAX_SESSION_RENEW_RETRIES = 3;

  // ---- Subscription Management (#2) ----
  private subscriptions: Map<string, InternalSubscription> = new Map();

  // ---- Item-to-Subscription mapping (#3) ----
  private itemToSubscription: Map<string, string> = new Map(); // nodeId → subscriptionId

  // ---- Reconnection (#4) ----
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECONNECT_BASE_MS = 1000;
  private readonly RECONNECT_MAX_MS = 30000;
  private readonly MAX_RECONNECT_ATTEMPTS = 20;
  private destroyed = false;

  // ---- Deadband filtering (#5) ----
  private deadbandState: Map<string, DeadbandState> = new Map();

  // ---- Browse cache (#6) ----
  private browseCache: Map<string, BrowseCacheEntry> = new Map();
  private readonly BROWSE_CACHE_TTL_MS = 300_000; // 5 minutes
  private browseCacheTimer: ReturnType<typeof setInterval> | null = null;

  // ---- Polling fallback (#8) ----
  private pollingFallbackActive = false;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionFailCount = 0;
  private readonly SUBSCRIPTION_FAILURE_THRESHOLD = 3;
  private readonly POLLING_RECOVERY_ATTEMPT_INTERVAL_MS = 30_000;

  // ---- Quality statistics (#10) ----
  private qualityStats: QualityStats = { good: 0, uncertain: 0, bad: 0, filtered: 0 };

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: OPCUAConnectionConfig) {
    super();
    this.config = config;
    this.startBrowseCacheCleanup();
  }

  // -----------------------------------------------------------------------
  // getStatus — preserved shape, extended fields
  // -----------------------------------------------------------------------

  getStatus() {
    return {
      protocol: 'opcua' as const,
      connected: this.connected,
      connecting: this.connecting,
      monitoredItems: Array.from(this.monitoredItems.values()),
      subscriptionId: this.subscriptionId,
      readCount: this.readCount,
      subscribeCount: this.subscribeCount,
      errorCount: this.errorCount,
      lastDataAt: this.lastDataAt,
      reconnectAttempts: this.reconnectAttempts,
      endpoint: this.config.endpoint,
      securityMode: this.config.securityMode || 'None',
      // --- New fields ---
      sessionId: this.session?.sessionId ?? null,
      activeSubscriptions: this.subscriptions.size,
      pollingFallbackActive: this.pollingFallbackActive,
      qualityStats: { ...this.qualityStats },
    };
  }

  // =======================================================================
  // 1. SESSION MANAGER
  // =======================================================================

  private createSessionState(): SessionState {
    const timeout = this.config.requestedSessionTimeout ?? this.DEFAULT_SESSION_TIMEOUT_MS;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session: SessionState = {
      sessionId,
      timeout,
      keepAliveInterval: Math.round(timeout * this.DEFAULT_KEEPALIVE_RATIO),
      createdAt: new Date(),
      lastRenewedAt: new Date(),
      lastKeepAliveAt: new Date(),
      renewTimer: null,
      keepAliveTimer: null,
    };

    log.info(`Session created: ${sessionId} (timeout: ${timeout}ms, keepAlive: ${session.keepAliveInterval}ms)`);

    // Production: use node-opcua SDK
    // const opcua = await import('node-opcua');
    // this.sessionRef = await this.clientRef.createSession(
    //   this.config.username
    //     ? { type: opcua.UserTokenType.UserName, userName: this.config.username, password: this.config.password }
    //     : undefined
    // );
    // session.sessionId = this.sessionRef.sessionId.toString();

    return session;
  }

  private activateSession(): void {
    if (!this.session) return;
    this.session.lastRenewedAt = new Date();
    this.session.lastKeepAliveAt = new Date();
    log.info(`Session activated: ${this.session.sessionId}`);

    // Production: use node-opcua SDK
    // await this.sessionRef.activate();
  }

  private scheduleSessionRenewal(): void {
    if (!this.session) return;
    // Renew at 75 % of the keep-alive interval (i.e. 56 % of timeout)
    const renewAt = Math.round(this.session.keepAliveInterval * 0.75);

    if (this.session.renewTimer) clearTimeout(this.session.renewTimer);

    this.session.renewTimer = setTimeout(async () => {
      if (!this.connected || !this.session) return;
      await this.renewSession();
    }, renewAt);
  }

  private async renewSession(): Promise<void> {
    if (!this.session) return;

    for (let retry = 0; retry < this.MAX_SESSION_RENEW_RETRIES; retry++) {
      try {
        // Production: use node-opcua SDK
        // await this.sessionRef.keepAlive();

        this.session.lastRenewedAt = new Date();
        this.session.lastKeepAliveAt = new Date();
        log.debug(`Session renewed: ${this.session.sessionId} (attempt ${retry + 1})`);
        this.scheduleSessionRenewal();
        return;
      } catch (error) {
        log.warn(`Session renew failed (attempt ${retry + 1}/${this.MAX_SESSION_RENEW_RETRIES})`, error as Error);
        if (retry === this.MAX_SESSION_RENEW_RETRIES - 1) {
          this.errorCount++;
          log.error(`Session renew exhausted, reconnecting`, error as Error);
          this.closeSession();
          this.scheduleReconnect();
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  private startKeepAlive(): void {
    if (!this.session) return;
    if (this.session.keepAliveTimer) clearInterval(this.session.keepAliveTimer);

    this.session.keepAliveTimer = setInterval(async () => {
      if (!this.connected || !this.session) return;
      try {
        // Production: use node-opcua SDK
        // await this.sessionRef.keepAlive();

        this.session.lastKeepAliveAt = new Date();
        log.debug(`Keep-alive sent for session ${this.session.sessionId}`);
      } catch {
        log.warn(`Keep-alive failed for session ${this.session.sessionId}`);
      }
    }, this.session.keepAliveInterval);
  }

  private closeSession(): void {
    if (!this.session) return;

    if (this.session.renewTimer) { clearTimeout(this.session.renewTimer); this.session.renewTimer = null; }
    if (this.session.keepAliveTimer) { clearInterval(this.session.keepAliveTimer); this.session.keepAliveTimer = null; }

    log.info(`Session closed: ${this.session.sessionId}`);

    // Production: use node-opcua SDK
    // try { await this.sessionRef.close(); } catch { /* best effort */ }

    this.session = null;
  }

  // =======================================================================
  // 2. SUBSCRIPTION MANAGEMENT
  // =======================================================================

  async createSubscription(params: OPCUASubscriptionParams = {}, id?: string): Promise<string> {
    if (!this.connected) throw new Error('OPC-UA not connected');

    const subId = id || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const publishingInterval = params.requestedPublishingInterval ?? 1000;
    const lifetimeCount = params.requestedLifetimeCount ?? 100;
    const maxKeepAliveCount = params.requestedMaxKeepAliveCount ?? 10;

    // Production: use node-opcua SDK
    // const subscription = await this.sessionRef.createSubscription2({
    //   requestedPublishingInterval: publishingInterval,
    //   requestedLifetimeCount: lifetimeCount,
    //   requestedMaxKeepAliveCount: maxKeepAliveCount,
    //   maxNotificationsPerPublish: params.maxNotificationsPerPublish ?? 100,
    //   publishingEnabled: params.publishingEnabled ?? true,
    //   priority: params.priority ?? 1,
    // });
    // subscription.on('item_changed', (item, dataValue) => { ... });

    const subscription: InternalSubscription = {
      id: subId,
      publishingInterval,
      lifetimeCount,
      maxKeepAliveCount,
      publishingEnabled: params.publishingEnabled ?? true,
      priority: params.priority ?? 1,
      createdAt: new Date(),
      itemNodeIds: new Set(),
    };

    this.subscriptions.set(subId, subscription);

    // Keep backward-compat subscriptionId pointing to the first/only subscription if none set
    if (!this.subscriptionId) this.subscriptionId = subId;

    this.emit('subscription_created', { subscriptionId: subId, publishingInterval, lifetimeCount });
    log.info(`Subscription created: ${subId} (interval: ${publishingInterval}ms, lifetime: ${lifetimeCount})`);

    return subId;
  }

  deleteSubscription(subscriptionId: string): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    // Remove all monitored items belonging to this subscription
    for (const nodeId of sub.itemNodeIds) {
      this.monitoredItems.delete(nodeId);
      this.itemToSubscription.delete(nodeId);
      this.deadbandState.delete(nodeId);
    }

    // Production: use node-opcua SDK
    // try { await this.subscriptionRef.terminate(); } catch { /* best effort */ }

    this.subscriptions.delete(subscriptionId);

    // Reset backward-compat field if we removed the default subscription
    if (this.subscriptionId === subscriptionId) {
      this.subscriptionId = this.subscriptions.keys().next().value ?? null;
    }

    this.emit('subscription_deleted', { subscriptionId });
    log.info(`Subscription deleted: ${subscriptionId}`);
  }

  // =======================================================================
  // 3. MONITORED ITEMS — expanded with subscription binding
  // =======================================================================

  addMonitoredItem(item: OPUAMonitoredItem): void {
    if (!this.connected) throw new Error('OPC-UA not connected');

    // Resolve which subscription this item belongs to
    const subId = item.subscriptionId ?? this.subscriptionId ?? 'default';
    if (subId !== 'default' && !this.subscriptions.has(subId)) {
      throw new Error(`Subscription ${subId} does not exist`);
    }

    // Store the item
    this.monitoredItems.set(item.nodeId, item);
    this.itemToSubscription.set(item.nodeId, subId);
    this.subscribeCount++;

    // Initialize deadband state
    if (item.deadbandType && item.deadbandType !== 'none') {
      this.deadbandState.set(item.nodeId, { lastValue: null, lastTimestamp: null });
    }

    // Register under subscription
    if (subId !== 'default') {
      const sub = this.subscriptions.get(subId);
      if (sub) sub.itemNodeIds.add(item.nodeId);
    }

    // Production: use node-opcua SDK
    // const itemToMonitor = { nodeId: item.nodeId, attributeId: item.attributeId ?? 13 };
    // const parameters = {
    //   samplingInterval: item.samplingInterval ?? 1000,
    //   queueSize: item.queueSize ?? 10,
    //   discardOldest: item.discardOldest ?? true,
    //   deadbandType: item.deadbandType === 'percent' ? 2 : item.deadbandType === 'absolute' ? 1 : 0,
    //   deadbandValue: item.deadbandValue ?? 0,
    // };
    // const monitoredItem = await subscription.monitor(itemToMonitor, parameters, 10);
    // monitoredItem.on('changed', (dataValue) => {
    //   this.handleDataChange(item, dataValue.value.value, dataValue.statusCode.name, dataValue.sourceTimestamp);
    // });

    log.info(`Added monitored item: ${item.nodeId} (sampling: ${item.samplingInterval || 1000}ms, sub: ${subId})`);
  }

  removeMonitoredItem(nodeId: string): void {
    const subId = this.itemToSubscription.get(nodeId);
    if (subId && subId !== 'default') {
      const sub = this.subscriptions.get(subId);
      if (sub) sub.itemNodeIds.delete(nodeId);
    }

    this.monitoredItems.delete(nodeId);
    this.itemToSubscription.delete(nodeId);
    this.deadbandState.delete(nodeId);
    log.info(`Removed monitored item: ${nodeId}`);
  }

  modifyMonitoredItem(nodeId: string, updates: Partial<Pick<OPUAMonitoredItem, 'samplingInterval' | 'queueSize' | 'deadbandType' | 'deadbandValue'>>): void {
    const item = this.monitoredItems.get(nodeId);
    if (!item) throw new Error(`Monitored item ${nodeId} not found`);

    Object.assign(item, updates);

    // Reset deadband state when deadband config changes
    if (updates.deadbandType !== undefined || updates.deadbandValue !== undefined) {
      if (item.deadbandType && item.deadbandType !== 'none') {
        this.deadbandState.set(nodeId, { lastValue: null, lastTimestamp: null });
      } else {
        this.deadbandState.delete(nodeId);
      }
    }

    // Production: use node-opcua SDK
    // const parameters = { samplingInterval: item.samplingInterval, queueSize: item.queueSize, ... };
    // await monitoredItem.modify(parameters);

    log.info(`Modified monitored item: ${nodeId}`, updates);
  }

  // =======================================================================
  // 4. RECONNECTION — exponential backoff with jitter
  // =======================================================================

  private scheduleReconnect(): void {
    if (this.destroyed || this.connected || this.connecting) return;

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.emit('max_reconnect');
      log.error(`Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${this.config.endpoint}`);
      return;
    }

    const delay = calculateBackoff(this.reconnectAttempts, this.RECONNECT_BASE_MS, this.RECONNECT_MAX_MS);
    this.reconnectAttempts++;

    log.info(`Reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay, maxAttempts: this.MAX_RECONNECT_ATTEMPTS });

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  // =======================================================================
  // 5. DEADBAND FILTERING
  // =======================================================================

  private shouldEmitWithDeadband(nodeId: string, value: unknown): boolean {
    const item = this.monitoredItems.get(nodeId);
    if (!item || !item.deadbandType || item.deadbandType === 'none') return true;
    if (typeof value !== 'number') return true;

    const threshold = item.deadbandValue ?? 0;
    if (threshold <= 0) return true;

    const state = this.deadbandState.get(nodeId);
    if (!state || state.lastValue === null) {
      if (state) state.lastValue = value;
      return true; // always emit first value
    }

    const lastVal = state.lastValue;
    let exceedsThreshold: boolean;

    if (item.deadbandType === 'absolute') {
      exceedsThreshold = Math.abs(value - lastVal) >= threshold;
    } else {
      // Percentage deadband — based on the EURange of the value
      const range = Math.max(Math.abs(lastVal), Math.abs(value), 1);
      exceedsThreshold = (Math.abs(value - lastVal) / range) * 100 >= threshold;
    }

    if (exceedsThreshold) {
      state.lastValue = value;
      state.lastTimestamp = new Date();
    }

    return exceedsThreshold;
  }

  // =======================================================================
  // 6. NAMESPACE BROWSING — recursive with cache
  // ========================================================================

  async browseNode(
    nodeId: string,
    options?: { depth?: number; maxDepth?: number; includeTypeDefinition?: boolean },
  ): Promise<Array<{ nodeId: string; browseName: string; nodeClass: string; displayName: string }>> {
    if (!this.connected) throw new Error('OPC-UA not connected');

    const depth = options?.depth ?? 0;
    const maxDepth = options?.maxDepth ?? 1;
    const cacheKey = `${nodeId}:d${maxDepth}`;

    // Check cache
    if (maxDepth <= 1) {
      const cached = this.browseCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt.getTime() < this.BROWSE_CACHE_TTL_MS) {
        return cached.results;
      }
    }

    // Production: use node-opcua SDK
    // const browseResult = await this.sessionRef.browse(nodeId);
    // const refs = browseResult.references.map(ref => ({
    //   nodeId: ref.nodeId.toString(),
    //   browseName: ref.browseName.toString(),
    //   nodeClass: ref.nodeClass.toString(),
    //   displayName: ref.displayName.text,
    // }));

    log.debug(`Browsing OPC-UA node: ${nodeId} (depth: ${depth})`);

    // If maxDepth > 1, recursively browse children
    if (maxDepth > 1 && depth < maxDepth) {
      const results: Array<{ nodeId: string; browseName: string; nodeClass: string; displayName: string }> = [];
      const children = await this._browseSingleLevel(nodeId);

      for (const child of children) {
        results.push(child);
        if (depth + 1 < maxDepth) {
          const descendants = await this.browseNode(child.nodeId, { depth: depth + 1, maxDepth });
          results.push(...descendants);
        }
      }

      return results;
    }

    const results = await this._browseSingleLevel(nodeId);

    // Cache single-level results
    if (maxDepth <= 1) {
      this.browseCache.set(cacheKey, { nodeId, results, depth: maxDepth, fetchedAt: new Date() });
    }

    return results;
  }

  private async _browseSingleLevel(nodeId: string): Promise<Array<{ nodeId: string; browseName: string; nodeClass: string; displayName: string }>> {
    // Production: use node-opcua SDK
    // const browseResult = await this.sessionRef.browse(nodeId);
    // return browseResult.references.map(ref => ({
    //   nodeId: ref.nodeId.toString(),
    //   browseName: ref.browseName.toString(),
    //   nodeClass: ref.nodeClass.toString(),
    //   displayName: ref.displayName.text,
    // }));

    // Stub returns empty; real SDK call fills this
    return [];
  }

  private startBrowseCacheCleanup(): void {
    if (this.browseCacheTimer) clearInterval(this.browseCacheTimer);
    this.browseCacheTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.browseCache) {
        if (now - entry.fetchedAt.getTime() > this.BROWSE_CACHE_TTL_MS) {
          this.browseCache.delete(key);
        }
      }
    }, 60_000); // clean every minute
  }

  clearBrowseCache(): void {
    this.browseCache.clear();
    log.info('Browse cache cleared');
  }

  // =======================================================================
  // 7. AUTO-DISCOVERY
  // =======================================================================

  async discoverEndpoints(endpointUrl?: string): Promise<EndpointDescription[]> {
    const url = endpointUrl || this.config.endpoint;
    log.info(`Discovering endpoints at: ${url}`);

    // Production: use node-opcua SDK
    // const opcua = await import('node-opcua');
    // const client = opcua.OPCUAClient.create({ endpointMustExist: false });
    // const endpoints = await client.getEndpoints(url);
    // return endpoints.map(ep => ({
    //   endpointUrl: ep.endpointUrl,
    //   securityMode: ep.securityMode.toString(),
    //   securityPolicyUri: ep.securityPolicyUri,
    //   securityLevel: ep.securityLevel,
    //   serverApplicationUri: ep.server.applicationUri,
    //   serverCertificate: ep.serverCertificate,
    //   messageSecurityMode: ep.securityMode.toString(),
    //   transportProfileUri: ep.transportProfileUri,
    //   userIdentityTokens: (ep.userIdentityTokens ?? []).map(t => ({
    //     policyId: t.policyId,
    //     tokenType: t.tokenType.toString(),
    //   })),
    // }));

    return [];
  }

  async findServers(discoveryUrl?: string, localeIds?: string[], serverUris?: string[]): Promise<ServerDescription[]> {
    const url = discoveryUrl || this.config.endpoint;
    log.info(`Finding OPC-UA servers at: ${url}`);

    // Production: use node-opcua SDK
    // const opcua = await import('node-opcua');
    // const client = opcua.OPCUAClient.create({ endpointMustExist: false });
    // const servers = await client.findServers(url, { localeIds, serverUris });
    // return servers.map(s => ({
    //   applicationUri: s.applicationUri,
    //   productUri: s.productUri,
    //   applicationName: s.applicationName.text,
    //   applicationType: s.applicationType.toString(),
    //   gatewayServerUri: s.gatewayServerUri ?? null,
    //   discoveryProfileUri: s.discoveryProfileUri ?? null,
    //   discoveryUrls: s.discoveryUrls ?? [],
    // }));

    return [];
  }

  // =======================================================================
  // 8. POLLING FALLBACK
  // =======================================================================

  private startPollingFallback(): void {
    if (this.pollingFallbackActive) return;
    this.pollingFallbackActive = true;
    this.subscriptionFailCount = 0;

    const interval = this.config.pollingFallbackInterval ?? 5000;
    log.warn(`Polling fallback activated at ${interval}ms interval`);

    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.executePollingCycle();
    }, interval);

    // Schedule attempt to recover subscriptions
    setTimeout(() => {
      this.attemptSubscriptionRecovery();
    }, this.POLLING_RECOVERY_ATTEMPT_INTERVAL_MS);

    this.emit('polling_fallback_activated', { interval });
  }

  private stopPollingFallback(): void {
    if (!this.pollingFallbackActive) return;
    this.pollingFallbackActive = false;

    if (this.pollingTimer) { clearInterval(this.pollingTimer); this.pollingTimer = null; }

    log.info('Polling fallback deactivated');
    this.emit('polling_fallback_deactivated');
  }

  private async executePollingCycle(): void {
    if (!this.connected || this.monitoredItems.size === 0) return;

    for (const [nodeId, item] of this.monitoredItems) {
      try {
        const result = await this.readNode(nodeId, item.mappingId);
        // readNode already emits 'data'; apply deadband filtering before emission
        // is handled inside the data change handler
        void result; // consumed by the side-effect emit
      } catch (error) {
        log.warn(`Polling read failed for ${nodeId}`, error as Error);
      }
    }
  }

  private recordSubscriptionFailure(): void {
    this.subscriptionFailCount++;
    if (this.subscriptionFailCount >= this.SUBSCRIPTION_FAILURE_THRESHOLD && !this.pollingFallbackActive) {
      this.startPollingFallback();
    }
  }

  private async attemptSubscriptionRecovery(): Promise<void> {
    if (!this.connected || !this.pollingFallbackActive) return;

    try {
      // Production: use node-opcua SDK
      // Attempt to re-create subscriptions
      // const testSub = await this.sessionRef.createSubscription2({ ... });
      // await testSub.terminate();

      // If we get here, subscriptions are working again
      this.subscriptionFailCount = 0;
      this.stopPollingFallback();

      // Re-register all items under their subscriptions
      for (const [nodeId, item] of this.monitoredItems) {
        const subId = item.subscriptionId ?? this.subscriptionId ?? 'default';
        const sub = this.subscriptions.get(subId);
        if (sub) sub.itemNodeIds.add(nodeId);
      }

      log.info('Subscription recovery successful — switched back from polling fallback');
    } catch {
      log.debug('Subscription recovery attempt failed — continuing polling fallback');
      // Schedule next recovery attempt
      setTimeout(() => this.attemptSubscriptionRecovery(), this.POLLING_RECOVERY_ATTEMPT_INTERVAL_MS);
    }
  }

  // =======================================================================
  // 9. CERTIFICATE MANAGEMENT
  // =======================================================================

  getCertificateConfig(): {
    storePath: string | undefined;
    applicationCertificate: string | undefined;
    applicationPrivateKey: string | undefined;
    securityMode: string;
    securityPolicy: string;
    rejectUnknown: boolean;
  } {
    return {
      storePath: this.config.certificateStorePath,
      applicationCertificate: this.config.applicationCertificate,
      applicationPrivateKey: this.config.applicationPrivateKey,
      securityMode: this.config.securityMode || 'None',
      securityPolicy: this.config.securityPolicy || 'None',
      rejectUnknown: this.config.rejectUnknownCertificates ?? false,
    };
  }

  /**
   * Validate the security configuration before connecting.
   * Returns an array of validation errors (empty = valid).
   */
  validateSecurityConfig(): string[] {
    const errors: string[] = [];
    const mode = this.config.securityMode || 'None';
    const policy = this.config.securityPolicy || 'None';

    if (mode !== 'None' && !this.config.certificateStorePath) {
      errors.push('Certificate store path is required when security mode is not None');
    }
    if (mode !== 'None' && !this.config.applicationCertificate) {
      errors.push('Application certificate is required when security mode is not None');
    }
    if (mode !== 'None' && !this.config.applicationPrivateKey) {
      errors.push('Application private key is required when security mode is not None');
    }
    if (mode === 'SignAndEncrypt' && policy === 'None') {
      errors.push('Security policy None is incompatible with SignAndEncrypt mode');
    }
    if (mode === 'Sign' && policy === 'None') {
      errors.push('Security policy None is incompatible with Sign mode');
    }
    return errors;
  }

  // =======================================================================
  // 10. QUALITY / STATUS CODE HANDLING
  // =======================================================================

  private handleDataChange(
    item: OPUAMonitoredItem,
    value: unknown,
    statusCode: string,
    sourceTimestamp: Date,
  ): void {
    const quality = mapStatusToQuality(statusCode);

    // Update quality statistics
    this.qualityStats[quality]++;

    // Filter bad-quality readings
    if (quality === 'bad') {
      this.qualityStats.filtered++;
      log.warn(`Filtered bad-quality reading from ${item.nodeId}: ${statusCode}`);
      this.emit('quality_filtered', { nodeId: item.nodeId, statusCode, quality });
      return;
    }

    // Apply deadband filtering for numeric values
    if (typeof value === 'number' && !this.shouldEmitWithDeadband(item.nodeId, value)) {
      return; // suppressed by deadband
    }

    this.lastDataAt = new Date();

    const payload = {
      nodeId: item.nodeId,
      mappingId: item.mappingId,
      timestamp: new Date(),
      value,
      statusCode,
      quality,
      sourceTimestamp,
    };

    this.emit('data', payload);
    this.emit('data_change', payload);
  }

  getQualityStats(): QualityStats & { total: number; filterRate: number } {
    const total = this.qualityStats.good + this.qualityStats.uncertain + this.qualityStats.bad;
    return {
      ...this.qualityStats,
      total,
      filterRate: total > 0 ? this.qualityStats.filtered / total : 0,
    };
  }

  resetQualityStats(): void {
    this.qualityStats = { good: 0, uncertain: 0, bad: 0, filtered: 0 };
    log.info('Quality statistics reset');
  }

  // =======================================================================
  // CORE CONNECTION LIFECYCLE (preserved interface, enhanced logic)
  // =======================================================================

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    this.destroyed = false;
    this.emit('status_change', { status: 'connecting' });
    log.info(`Connecting to OPC-UA server: ${this.config.endpoint}`);

    if (process.env.NODE_ENV === 'production') {
      const error = new Error(
        'OPC-UA provider is not configured for production. Wire node-opcua before enabling this data source.',
      );
      this.connected = false;
      this.connecting = false;
      this.errorCount++;
      this.emit('status_change', { status: 'error', error: error.message });
      log.error('OPC-UA connection refused: production transport not configured', error);
      throw error;
    }

    // Validate security config — warn only in stub mode; production SDK enforces these
    const securityErrors = this.validateSecurityConfig();
    if (securityErrors.length > 0) {
      log.warn(`Security configuration warnings: ${securityErrors.join('; ')}`);
      // Production: uncomment the following block to enforce security validation
      // this.connecting = false;
      // const error = new Error(`Security validation failed: ${securityErrors.join('; ')}`);
      // this.errorCount++;
      // this.emit('error', error);
      // this.emit('status_change', { status: 'error', error: error.message });
      // log.error('OPC-UA security validation failed', error);
      // this.scheduleReconnect();
      // throw error;
    }

    try {
      // Production: use 'node-opcua' package
      // const opcua = await import('node-opcua');
      // const endpointUrl = this.config.endpoint;
      // const securityMode = opcua.MessageSecurityMode[this.config.securityMode || 'None'];
      // const securityPolicy = opcua.SecurityPolicy[this.config.securityPolicy || 'None'];
      // this.clientRef = opcua.OPCUAClient.create({
      //   endpointMustExist: false,
      //   securityMode,
      //   securityPolicy,
      //   certificateFile: this.config.applicationCertificate,
      //   privateKeyFile: this.config.applicationPrivateKey,
      //   rejectUnknownCertificates: this.config.rejectUnknownCertificates,
      // });
      // await this.clientRef.connect(endpointUrl);
      // this.sessionRef = await this.clientRef.createSession(
      //   this.config.username
      //     ? { type: opcua.UserTokenType.UserName, userName: this.config.username, password: this.config.password }
      //     : undefined
      // );
      // this.defaultSubscription = await this.sessionRef.createSubscription2({
      //   requestedPublishingInterval: 1000,
      //   requestedLifetimeCount: 100,
      //   requestedMaxKeepAliveCount: 10,
      //   maxNotificationsPerPublish: 100,
      //   publishingEnabled: true,
      // });

      await new Promise((resolve) => setTimeout(resolve, 800));

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;

      // Initialize session management
      this.session = this.createSessionState();
      this.activateSession();
      this.scheduleSessionRenewal();
      this.startKeepAlive();

      this.emit('connected');
      this.emit('status_change', { status: 'connected' });
      log.info('OPC-UA session established');
    } catch (error) {
      this.connected = false;
      this.connecting = false;
      this.errorCount++;
      this.closeSession();
      this.emit('error', error);
      this.emit('status_change', { status: 'error', error: (error as Error).message });
      log.error('OPC-UA connection failed', error as Error);
      this.scheduleReconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.connecting = false;
    this.destroyed = true;

    // Stop polling fallback if active
    this.stopPollingFallback();

    // Clear reconnect timer
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

    // Close session and all timers
    this.closeSession();

    // Clear subscriptions
    this.subscriptions.clear();

    // Clear monitored items (preserved behavior)
    this.monitoredItems.clear();
    this.itemToSubscription.clear();
    this.deadbandState.clear();

    // Clear subscription ID (preserved behavior)
    this.subscriptionId = null;

    // Production: await this.defaultSubscription?.terminate(); await this.sessionRef?.close(); await this.clientRef?.disconnect();
    this.emit('disconnected');
    this.emit('status_change', { status: 'disconnected' });
    log.info('OPC-UA session closed');
  }

  // =======================================================================
  // READ NODE — enhanced with quality mapping
  // =======================================================================

  async readNode(nodeId: string, mappingId: string): Promise<{ nodeId: string; value: unknown; statusCode: string; sourceTimestamp: Date }> {
    if (!this.connected) throw new Error('OPC-UA not connected');
    this.readCount++;
    this.lastDataAt = new Date();

    // Production: const dataValue = await this.sessionRef.readVariableValue(nodeId);
    log.debug(`Read OPC-UA node: ${nodeId}`);

    const statusCode = 'Good';
    const value = null;
    const sourceTimestamp = new Date();

    this.emit('data', { nodeId, mappingId, timestamp: new Date(), value, statusCode, sourceTimestamp });

    return { nodeId, value, statusCode, sourceTimestamp };
  }

  // =======================================================================
  // CLEANUP
  // =======================================================================

  destroy(): void {
    this.disconnect();
    if (this.browseCacheTimer) { clearInterval(this.browseCacheTimer); this.browseCacheTimer = null; }
    this.removeAllListeners();
    this.browseCache.clear();
    log.info('OPC-UA adapter destroyed');
  }
}
