import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

// Helper: generate tool code TL-NNNN
async function generateToolCode(): Promise<string> {
  const latest = await db.tool.findFirst({
    orderBy: { toolCode: 'desc' },
    select: { toolCode: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.toolCode.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `TL-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const isLookup = mode === 'lookup';

    // Tool Registry is a custody/administration workspace. Repair execution
    // users receive only a constrained lookup shape for selectors and requests.
    const canUseToolWorkspace = isAdmin(session) || hasAnyPermission(session, [
      'tools.manage',
      'tools.create',
      'tools.update',
      'tools.delete',
    ]);
    const canLookupForWork = isAdmin(session) || hasAnyPermission(session, [
      'tools.view',
      'repair_tool_requests.create',
      'repair_tool_requests.update',
      'repair_tool_transfers.create',
      'damaged_tool_reports.create',
      'work_orders.create',
      'work_orders.update',
    ]);

    if (isLookup ? !canLookupForWork && !canUseToolWorkspace : !canUseToolWorkspace) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    const plantFilter = getPlantFilterWhere(plantScope);

    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const condition = searchParams.get('condition');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (category) where.category = category;
    if (condition) where.condition = condition;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { toolCode: { contains: search } },
        { serialNumber: { contains: search } },
        { location: { contains: search } },
        { manufacturer: { contains: search } },
        { model: { contains: search } },
      ];
    }

    Object.assign(where, plantFilter);

    const [tools, total] = await Promise.all([
      db.tool.findMany({
        where: Object.keys(where).length > 1 || where.OR ? where : undefined,
        ...(isLookup
          ? {
              select: {
                id: true,
                toolCode: true,
                name: true,
                category: true,
                status: true,
                condition: true,
                quantity: true,
                assignedToId: true,
                plantId: true,
              },
            }
          : {
              include: {
                assignedTo: { select: { id: true, fullName: true, username: true } },
                createdBy: { select: { id: true, fullName: true, username: true } },
                _count: { select: { transactions: true } },
              },
            }),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.tool.count({
        where: Object.keys(where).length > 1 || where.OR ? where : { isActive: true },
      }),
    ]);

    if (isLookup) {
      return NextResponse.json({
        success: true,
        data: tools,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // Full Tool Registry only: calculate workspace KPI counts.
    const [totalCount, availableCount, checkedOutCount, inRepairCount, retiredCount] = await Promise.all([
      db.tool.count({ where: { isActive: true, ...plantFilter } }),
      db.tool.count({ where: { isActive: true, status: 'available', ...plantFilter } }),
      db.tool.count({ where: { isActive: true, status: 'checked_out', ...plantFilter } }),
      db.tool.count({ where: { isActive: true, status: 'in_repair', ...plantFilter } }),
      db.tool.count({ where: { isActive: true, status: 'retired', ...plantFilter } }),
    ]);

    return NextResponse.json({
      success: true,
      data: tools,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      kpis: {
        total: totalCount,
        available: availableCount,
        checkedOut: checkedOutCount,
        inRepair: inRepairCount,
        retired: retiredCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tools';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'tools.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);

    const body = await request.json();
    const {
      name,
      description,
      category,
      serialNumber,
      condition,
      status,
      location,
      purchaseDate,
      purchaseCost,
      currentValue,
      manufacturer,
      model,
      assignedToId,
      quantity,
    } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: 'Tool name is required' }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json({ success: false, error: 'Category is required' }, { status: 400 });
    }

    const toolCode = await generateToolCode();

    const tool = await db.tool.create({
      data: {
        toolCode,
        name,
        description: description || null,
        category,
        serialNumber: serialNumber || null,
        condition: condition || 'good',
        status: status || 'available',
        location: location || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchaseCost: purchaseCost || null,
        currentValue: currentValue || null,
        manufacturer: manufacturer || null,
        model: model || null,
        assignedToId: assignedToId || null,
        quantity: quantity || 1,
        createdById: session.userId,
        plantId: body.plantId || plantScope?.plantId || null,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'tool',
        entityId: tool.id,
        newValues: JSON.stringify({ toolCode, name, category }),
      },
    });

    return NextResponse.json({ success: true, data: tool }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create tool';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
