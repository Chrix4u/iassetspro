import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const component = await db.componentRegistry.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, componentCode: true } },
        children: {
          include: {
            _count: {
              select: { children: true, failureRecords: true, sparePartLinks: true, toolRequirements: true },
            },
          },
          orderBy: { name: 'asc' },
        },
        twin: { select: { id: true, name: true, type: true, assetId: true } },
        asset: { select: { id: true, name: true, assetTag: true, status: true, criticality: true } },
        failureRecords: {
          orderBy: { detectedAt: 'desc' },
          take: 20,
        },
        sparePartLinks: {
          include: {
            inventoryItem: {
              select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true, unitCost: true },
            },
          },
        },
        toolRequirements: {
          include: {
            tool: {
              select: { id: true, name: true, toolCode: true, status: true, condition: true },
            },
          },
        },
        predictiveModels: {
          select: { id: true, modelName: true, modelType: true, trainingStatus: true, accuracy: true },
          orderBy: { createdAt: 'desc' },
        },
        predictionAlerts: {
          where: { isAcknowledged: false },
          select: { id: true, severity: true, message: true },
          take: 10,
        },
        _count: {
          select: {
            children: true,
            failureRecords: true,
            sparePartLinks: true,
            toolRequirements: true,
          },
        },
      },
    });

    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: component });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load component';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.componentRegistry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'componentType', 'manufacturer', 'modelNumber',
      'serialNumber', 'specification', 'operatingParams', 'criticality',
      'lifecycleStatus', 'installedDate', 'expectedLifeHours', 'operatingHours',
      'lastInspection', 'nextInspectionDue', 'healthScore', 'notes',
      'parentId', 'assetId', 'twinId',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (['installedDate', 'lastInspection', 'nextInspectionDue'].includes(field) && body[field] !== null) {
          updateData[field] = new Date(body[field]);
        } else if (['expectedLifeHours', 'operatingHours', 'healthScore'].includes(field)) {
          updateData[field] = parseFloat(String(body[field]));
        } else if (['specification', 'operatingParams'].includes(field)) {
          updateData[field] = typeof body[field] === 'string' ? body[field] : JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    // Validate parentId if changing. Keep the hierarchy inside one asset
    // and reject cycles such as A -> B -> C -> A.
    if (updateData.parentId && updateData.parentId !== existing.parentId) {
      if (updateData.parentId === existing.id) {
        return NextResponse.json({ success: false, error: 'Component cannot be its own parent' }, { status: 400 });
      }
      const parentId = updateData.parentId as string;
      const parent = await db.componentRegistry.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ success: false, error: 'Parent component not found' }, { status: 404 });
      }

      const targetAssetId = updateData.assetId !== undefined
        ? (updateData.assetId as string | null)
        : existing.assetId;
      if (targetAssetId && parent.assetId !== targetAssetId) {
        return NextResponse.json(
          { success: false, error: 'Parent component belongs to a different asset' },
          { status: 400 },
        );
      }

      let cursor: typeof parent | null = parent;
      const seen = new Set<string>();
      for (let depth = 0; cursor && depth < 64; depth++) {
        if (cursor.id === existing.id) {
          return NextResponse.json(
            { success: false, error: 'Parent selection would create a component hierarchy cycle' },
            { status: 400 },
          );
        }
        if (!cursor.parentId || seen.has(cursor.parentId)) break;
        seen.add(cursor.id);
        cursor = await db.componentRegistry.findUnique({ where: { id: cursor.parentId } });
      }
    }

    // Validate serialNumber uniqueness if changing
    if (updateData.serialNumber && updateData.serialNumber !== existing.serialNumber) {
      const existingSerial = await db.componentRegistry.findUnique({ where: { serialNumber: updateData.serialNumber as string } });
      if (existingSerial) {
        return NextResponse.json({ success: false, error: 'Serial number already exists' }, { status: 409 });
      }
    }

    const updated = await db.componentRegistry.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, componentCode: true } },
        twin: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        _count: {
          select: { children: true, failureRecords: true, sparePartLinks: true, toolRequirements: true },
        },
      },
    });

    await createAuditLog(
      session.userId,
      'component_registry',
      'update',
      id,
      {
        oldValues: { name: existing.name, componentType: existing.componentType, criticality: existing.criticality },
        newValues: updateData,
      },
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update component';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.componentRegistry.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Collect all descendant IDs for cascade deletion
    const getAllDescendantIds = async (parentId: string): Promise<string[]> => {
      const children = await db.componentRegistry.findMany({
        where: { parentId },
        select: { id: true },
      });
      const ids: string[] = [];
      for (const child of children) {
        ids.push(child.id);
        const childIds = await getAllDescendantIds(child.id);
        ids.push(...childIds);
      }
      return ids;
    };

    const descendantIds = await getAllDescendantIds(id);
    const allIds = [id, ...descendantIds];

    await db.componentRegistry.deleteMany({
      where: { id: { in: allIds } },
    });

    await createAuditLog(
      session.userId,
      'component_registry',
      'delete',
      id,
      {
        oldValues: { componentCode: existing.componentCode, name: existing.name },
        newValues: { deleted: true, cascadeCount: descendantIds.length },
      },
    );

    return NextResponse.json({ success: true, data: { deleted: true, cascadeDeleted: descendantIds.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete component';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
