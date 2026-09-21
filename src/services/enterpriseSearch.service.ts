// ============================================================================
// ENTERPRISE SEARCH — Global search across all entity types
// Uses in-memory inverted index with production-ready abstraction for ES/OpenSearch
// ============================================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { cache, CACHE_TTL } from '@/lib/cache';
import type { MaintenanceRequestSearchMode } from '@/lib/search-access';

const logger = createLogger('enterpriseSearch');

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  description?: string;
  entityType: string;
  highlights?: string[];
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  types?: string[]; // 'assets', 'work_orders', 'maintenance_requests', 'components', 'documents', 'inventory'
  limit?: number;
  offset?: number;
  plantId?: string;
  plantIds?: string[];
  userId?: string;
  workOrderOwnOnly?: boolean;
  maintenanceRequestMode?: MaintenanceRequestSearchMode;
  supervisedDepartmentIds?: string[];
  fuzzy?: boolean;
}

export interface SearchSuggestion {
  text: string;
  type: string;
  count: number;
}

export class EnterpriseSearchService {
  /**
   * Global search across all entity types
   */
  static async search(options: SearchOptions): Promise<{ results: SearchResult[]; total: number; took: number }> {
    const start = Date.now();
    const {
      query,
      types,
      limit = 20,
      offset = 0,
      plantId,
      plantIds,
      userId,
      workOrderOwnOnly = false,
      maintenanceRequestMode = 'all',
      supervisedDepartmentIds = [],
      fuzzy = true,
    } = options;

    const cacheKey = `search:global:${JSON.stringify(options)}`;
    
    const cached = cache.get<{ results: SearchResult[]; total: number; took: number }>(cacheKey);
    if (cached) return cached;

    const results: SearchResult[] = [];
    const searchTypes = types || ['assets', 'work_orders', 'maintenance_requests', 'components'];

    // Build search terms
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Search each entity type in parallel
    const searchPromises = searchTypes.map(async (type) => {
      try {
        switch (type) {
          case 'assets': return this.searchAssets(terms, plantId, plantIds, limit);
          case 'work_orders': return this.searchWorkOrders(
            terms,
            plantId,
            plantIds,
            limit,
            userId,
            workOrderOwnOnly,
          );
          case 'maintenance_requests': return this.searchMaintenanceRequests(
            terms,
            plantId,
            plantIds,
            limit,
            userId,
            maintenanceRequestMode,
            supervisedDepartmentIds,
          );
          case 'components': return this.searchComponents(terms, limit);
          case 'inventory': return this.searchInventory(terms, plantIds, limit);
          case 'documents': return this.searchDocuments(terms, limit);
          default: return [];
        }
      } catch (error) {
        logger.error(`Search failed for type: ${type}`, error);
        return [];
      }
    });

    const typeResults = await Promise.all(searchPromises);

    for (const typeResult of typeResults) {
      results.push(...typeResult);
    }

    // Sort by score and paginate
    results.sort((a, b) => b.score - a.score);
    const paginated = results.slice(offset, offset + limit);

    const response = {
      results: paginated,
      total: results.length,
      took: Date.now() - start,
    };

    cache.set(cacheKey, response, CACHE_TTL.SHORT);
    return response;
  }

  /**
   * Search assets
   */
  private static async searchAssets(
    terms: string[],
    plantId?: string,
    plantIds?: string[],
    limit = 10,
  ): Promise<SearchResult[]> {
    const where: Record<string, unknown> = {};

    if (plantIds !== undefined) {
      where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__';
    } else if (plantId) {
      where.plantId = plantId;
    }

    if (terms.length > 0) {
      where.OR = terms.map(term => [
        { name: { contains: term } },
        { description: { contains: term } },
        { assetTag: { contains: term } },
        { serialNumber: { contains: term } },
        { location: { contains: term } },
      ]).flat();
    }

    try {
      const assets = await db.asset.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, description: true, assetTag: true,
          categoryId: true, status: true, criticality: true, plantId: true,
        },
      });

      return assets.map(asset => ({
        id: asset.id,
        type: 'asset',
        title: asset.name,
        description: asset.description || undefined,
        entityType: 'assets',
        score: this.calculateScore(asset.name, terms),
        metadata: {
          assetTag: asset.assetTag,
          status: asset.status,
          criticality: asset.criticality,
        },
      }));
    } catch { return []; }
  }

  /**
   * Search work orders
   */
  private static async searchWorkOrders(
    terms: string[],
    plantId?: string,
    plantIds?: string[],
    limit = 10,
    userId?: string,
    ownOnly = false,
  ): Promise<SearchResult[]> {
    const where: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];

    if (plantIds !== undefined) {
      where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__';
    } else if (plantId) {
      where.plantId = plantId;
    }

    if (terms.length > 0) {
      and.push({
        OR: terms.map(term => [
          { title: { contains: term } },
          { description: { contains: term } },
          { woNumber: { contains: term } },
        ]).flat(),
      });
    }

    if (ownOnly) {
      if (!userId) return [];
      and.push({
        OR: [
          { assignedTo: userId },
          { teamLeaderId: userId },
          { teamMembers: { some: { userId } } },
        ],
      });
    }

    if (and.length > 0) where.AND = and;

    try {
      const wos = await db.workOrder.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, title: true, description: true, woNumber: true,
          status: true, priority: true, assetId: true, plantId: true,
        },
      });

      return wos.map(wo => ({
        id: wo.id,
        type: 'work_order',
        title: `${wo.woNumber || ''} — ${wo.title}`,
        description: wo.description || undefined,
        entityType: 'work_orders',
        score: this.calculateScore(`${wo.woNumber} ${wo.title}`, terms),
        metadata: { status: wo.status, priority: wo.priority },
      }));
    } catch { return []; }
  }

  /**
   * Search maintenance requests
   */
  private static async searchMaintenanceRequests(
    terms: string[],
    plantId?: string,
    plantIds?: string[],
    limit = 10,
    userId?: string,
    mode: MaintenanceRequestSearchMode = 'all',
    supervisedDepartmentIds: string[] = [],
  ): Promise<SearchResult[]> {
    const where: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];

    if (plantIds !== undefined) {
      where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__';
    } else if (plantId) {
      where.plantId = plantId;
    }

    if (terms.length > 0) {
      and.push({
        OR: terms.map(term => [
          { title: { contains: term } },
          { description: { contains: term } },
          { requestNumber: { contains: term } },
        ]).flat(),
      });
    }

    if (mode !== 'all') {
      if (!userId) return [];

      if (mode === 'own') {
        and.push({ requestedBy: userId });
      } else if (mode === 'supervisor') {
        and.push(supervisedDepartmentIds.length > 0
          ? {
              OR: [
                { supervisorId: userId },
                { departmentId: { in: supervisedDepartmentIds } },
              ],
            }
          : { supervisorId: userId });
      } else if (mode === 'technician') {
        and.push({
          OR: [
            { requestedBy: userId },
            { workOrder: { assignedTo: userId } },
          ],
        });
      }
    }

    if (and.length > 0) where.AND = and;

    try {
      const mrs = await db.maintenanceRequest.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, description: true, requestNumber: true, status: true, priority: true },
      });

      return mrs.map(mr => ({
        id: mr.id,
        type: 'maintenance_request',
        title: `${mr.requestNumber || ''} — ${mr.title}`,
        description: mr.description || undefined,
        entityType: 'maintenance_requests',
        score: this.calculateScore(`${mr.requestNumber} ${mr.title}`, terms),
        metadata: { status: mr.status, priority: mr.priority },
      }));
    } catch { return []; }
  }

  /**
   * Search components (from spatial node registry)
   */
  private static async searchComponents(terms: string[], limit = 10): Promise<SearchResult[]> {
    try {
      const components = await db.spatialNode.findMany({
        where: terms.length > 0 ? {
          OR: terms.map(term => [
            { name: { contains: term } },
            { code: { contains: term } },
            { nodeType: { contains: term } },
          ]).flat(),
        } : undefined,
        take: limit,
        orderBy: { name: 'asc' },
      });

      return components.map(c => ({
        id: c.id,
        type: 'component',
        title: c.name,
        entityType: 'components',
        score: this.calculateScore(c.name, terms),
        metadata: { nodeType: c.nodeType, code: c.code },
      }));
    } catch { return []; }
  }

  /**
   * Search inventory items
   */
  private static async searchInventory(
    terms: string[],
    plantIds?: string[],
    limit = 10,
  ): Promise<SearchResult[]> {
    try {
      const where: Record<string, unknown> = {};
      const and: Record<string, unknown>[] = [];

      if (plantIds !== undefined) {
        where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__';
      }
      if (terms.length > 0) {
        and.push({
          OR: terms.map(term => [
            { name: { contains: term } },
            { itemCode: { contains: term } },
            { description: { contains: term } },
            { category: { contains: term } },
          ]).flat(),
        });
      }
      if (and.length > 0) where.AND = and;

      const items = await db.inventoryItem.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, description: true, itemCode: true, category: true, currentStock: true, unitOfMeasure: true },
      });

      return items.map(item => ({
        id: item.id,
        type: 'inventory_item',
        title: `${item.itemCode || ''} — ${item.name}`,
        description: item.description || undefined,
        entityType: 'inventory',
        score: this.calculateScore(`${item.itemCode} ${item.name}`, terms),
        metadata: { quantity: item.currentStock, unit: item.unitOfMeasure, category: item.category },
      }));
    } catch { return []; }
  }

  /**
   * Search documents (placeholder — expand based on document model)
   */
  private static async searchDocuments(_terms: string[], _limit = 10): Promise<SearchResult[]> {
    return [];
  }

  /**
   * Calculate relevance score based on term matching
   */
  private static calculateScore(text: string, terms: string[]): number {
    const lower = text.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (lower === term) {
        score += 10; // Exact match
      } else if (lower.startsWith(term)) {
        score += 5; // Starts with
      } else if (lower.includes(term)) {
        score += 3; // Contains
      }
    }

    return score;
  }

  /**
   * Get search suggestions (autocomplete)
   */
  static async suggest(query: string, limit = 5): Promise<SearchSuggestion[]> {
    if (!query || query.length < 2) return [];

    const cacheKey = `search:suggest:${query}`;
    return cache.getOrSet(cacheKey, async () => {
      const suggestions: SearchSuggestion[] = [];
      const lowerQuery = query.toLowerCase();

      // Asset name suggestions
      try {
        const assets = await db.asset.findMany({
          where: { name: { contains: query } },
          take: 3,
          select: { name: true },
        });
        for (const a of assets) {
          if (suggestions.length >= limit) break;
          suggestions.push({ text: a.name, type: 'asset', count: 1 });
        }
      } catch { /* skip */ }

      // Work order suggestions
      try {
        const wos = await db.workOrder.findMany({
          where: { OR: [
            { title: { contains: query } },
            { woNumber: { contains: query } },
          ]},
          take: 2,
          select: { title: true, woNumber: true },
        });
        for (const wo of wos) {
          if (suggestions.length >= limit) break;
          suggestions.push({ text: `${wo.woNumber} — ${wo.title}`, type: 'work_order', count: 1 });
        }
      } catch { /* skip */ }

      return suggestions;
    }, CACHE_TTL.SHORT);
  }

  /**
   * Get recent searches for current user (from localStorage on client side)
   * This is a server-side stub; actual implementation uses user preferences
   */
  static async getRecentSearches(_userId: string): Promise<string[]> {
    return [];
  }
}
