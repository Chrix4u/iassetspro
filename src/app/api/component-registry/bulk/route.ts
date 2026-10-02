import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canCreateComponentHierarchy } from '@/lib/component-registry-permissions';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';

const TYPES = new Set(['assembly', 'subassembly', 'component', 'part', 'auxiliary', 'instrument']);
const CRITICALITIES = new Set(['low', 'medium', 'high', 'critical']);

type BulkRow = {
  componentCode?: string;
  name?: string;
  componentType?: string;
  parentCode?: string | null;
  criticality?: string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  description?: string | null;
};

type NormalizedRow = {
  componentCode: string;
  name: string;
  componentType: string;
  parentCode: string;
  criticality: string;
  manufacturer: string | null;
  modelNumber: string | null;
  description: string | null;
};

function normalizeRow(row: BulkRow): NormalizedRow {
  return {
    componentCode: String(row.componentCode || '').trim(),
    name: String(row.name || '').trim(),
    componentType: String(row.componentType || 'component').trim().toLowerCase(),
    parentCode: String(row.parentCode || '').trim(),
    criticality: String(row.criticality || 'medium').trim().toLowerCase(),
    manufacturer: row.manufacturer ? String(row.manufacturer).trim() : null,
    modelNumber: row.modelNumber ? String(row.modelNumber).trim() : null,
    description: row.description ? String(row.description).trim() : null,
  };
}

function orderRows(rows: NormalizedRow[], existingParentCodes: Set<string>) {
  const remaining = [...rows];
  const resolved = new Set(existingParentCodes);
  const ordered: NormalizedRow[] = [];

  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((row) => !row.parentCode || resolved.has(row.parentCode));
    if (readyIndex === -1) {
      throw new Error('Hierarchy contains a circular or unresolved parent relationship');
    }
    const [row] = remaining.splice(readyIndex, 1);
    ordered.push(row);
    resolved.add(row.componentCode);
  }

  return ordered;
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!canCreateComponentHierarchy(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const assetId = String(body?.assetId || '').trim();
    const incomingRows = Array.isArray(body?.rows) ? body.rows as BulkRow[] : [];

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'assetId is required' }, { status: 400 });
    }
    if (incomingRows.length < 1 || incomingRows.length > 100) {
      return NextResponse.json({ success: false, error: 'rows must contain between 1 and 100 hierarchy nodes' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true, assetTag: true, name: true },
    });
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }
    if (!canAccessPlant(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const rows = incomingRows.map(normalizeRow);
    const rowCodes = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const line = index + 1;
      if (!row.componentCode) {
        return NextResponse.json({ success: false, error: `Row ${line}: componentCode is required` }, { status: 400 });
      }
      if (!row.name) {
        return NextResponse.json({ success: false, error: `Row ${line}: name is required` }, { status: 400 });
      }
      if (!TYPES.has(row.componentType)) {
        return NextResponse.json({ success: false, error: `Row ${line}: invalid componentType` }, { status: 400 });
      }
      if (!CRITICALITIES.has(row.criticality)) {
        return NextResponse.json({ success: false, error: `Row ${line}: invalid criticality` }, { status: 400 });
      }
      if (rowCodes.has(row.componentCode)) {
        return NextResponse.json({ success: false, error: `Duplicate componentCode in batch: ${row.componentCode}` }, { status: 400 });
      }
      if (row.parentCode && row.parentCode === row.componentCode) {
        return NextResponse.json({ success: false, error: `Component cannot be its own parent: ${row.componentCode}` }, { status: 400 });
      }
      rowCodes.add(row.componentCode);
    }

    const existingConflicts = await db.componentRegistry.findMany({
      where: { componentCode: { in: [...rowCodes] } },
      select: { componentCode: true },
    });
    if (existingConflicts.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Component code already exists: ${existingConflicts.map((item) => item.componentCode).join(', ')}`,
      }, { status: 409 });
    }

    const externalParentCodes = [...new Set(
      rows
        .map((row) => row.parentCode)
        .filter((code) => code && !rowCodes.has(code)),
    )];

    const existingParents = externalParentCodes.length > 0
      ? await db.componentRegistry.findMany({
          where: {
            assetId,
            componentCode: { in: externalParentCodes },
          },
          select: { id: true, componentCode: true },
        })
      : [];

    const existingParentMap = new Map(existingParents.map((item) => [item.componentCode, item.id]));
    const missingParents = externalParentCodes.filter((code) => !existingParentMap.has(code));
    if (missingParents.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Parent component not found on this asset: ${missingParents.join(', ')}`,
      }, { status: 400 });
    }

    const ordered = orderRows(rows, new Set(existingParentMap.keys()));

    const created = await db.$transaction(async (tx) => {
      const createdIds = new Map<string, string>();
      const result: Array<{
        id: string;
        componentCode: string;
        name: string;
        componentType: string;
        parentId: string | null;
      }> = [];

      for (let index = 0; index < ordered.length; index += 1) {
        const row = ordered[index];
        const parentId = row.parentCode
          ? existingParentMap.get(row.parentCode) || createdIds.get(row.parentCode) || null
          : null;

        if (row.parentCode && !parentId) {
          throw new Error(`Parent could not be resolved for ${row.componentCode}`);
        }

        const component = await tx.componentRegistry.create({
          data: {
            assetId,
            parentId,
            twinId: null,
            componentCode: row.componentCode,
            name: row.name,
            description: row.description,
            componentType: row.componentType,
            manufacturer: row.manufacturer,
            modelNumber: row.modelNumber,
            serialNumber: null,
            specification: null,
            operatingParams: null,
            criticality: row.criticality,
            lifecycleStatus: 'operational',
            installedDate: null,
            expectedLifeHours: null,
            operatingHours: 0,
            lastInspection: null,
            nextInspectionDue: null,
            healthScore: 100,
            sortOrder: index + 1,
            notes: 'Created through frontend hierarchy commissioning import.',
          },
          select: {
            id: true,
            componentCode: true,
            name: true,
            componentType: true,
            parentId: true,
          },
        });

        createdIds.set(component.componentCode, component.id);
        result.push(component);

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            entityType: 'component_registry',
            action: 'create',
            entityId: component.id,
            newValues: JSON.stringify({
              componentCode: component.componentCode,
              name: component.name,
              componentType: component.componentType,
              assetId,
              parentId: component.parentId,
              source: 'frontend_hierarchy_bulk',
            }),
          },
        });
      }

      return result;
    });

    return NextResponse.json({
      success: true,
      data: {
        asset: { id: asset.id, assetTag: asset.assetTag, name: asset.name },
        created,
        createdCount: created.length,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Hierarchy commissioning failed';
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

    if (code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A component code was created concurrently. Refresh and retry.' }, { status: 409 });
    }

    console.error('[API /api/component-registry/bulk POST] Failed:', {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
