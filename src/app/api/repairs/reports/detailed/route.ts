import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlant, applyPlantScope } from '@/lib/plant-scope';
import * as XLSX from 'xlsx';

// GET /api/repairs/reports/detailed — Machine + Parts repair report
// Query params: dateFrom, dateTo, status, type, plantId, format (json|xlsx), page, limit
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'reports.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.view required' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const requestedPlantId = searchParams.get('plantId');
    const departmentId = searchParams.get('departmentId');
    const format = searchParams.get('format') || 'json';
    if (format === 'xlsx' && !hasPermission(session, 'reports.export') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions: reports.export required' }, { status: 403 });
    }

    // Pagination params (used for JSON format; XLSX always fetches full filtered set)
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '50', 10) || 50));

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    } else {
      where.type = { in: ['corrective', 'emergency', 'predictive'] };
    }

    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['completed', 'verified', 'closed'] };
    }
    if (departmentId) {
      where.departmentId = departmentId;
    }

    // Apply plant scope before any report query. An explicit X-Plant-ID wins over
    // query-string selection; a query-string plant must still belong to the caller.
    // With neither selected, filter to ALL plants the caller is assigned to.
    if (plantScope.isScoped && plantScope.plantId) {
      if (requestedPlantId && requestedPlantId !== plantScope.plantId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      where.plantId = plantScope.plantId;
    } else if (requestedPlantId) {
      if (!canAccessPlant(plantScope, requestedPlantId)) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      where.plantId = requestedPlantId;
    } else {
      applyPlantScope(where, plantScope);
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.createdAt = dateFilter;
    }

    const filterWhere = Object.keys(where).length > 0 ? where : undefined;
    const total = await db.workOrder.count({ where: filterWhere });
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // JSON is paginated for interactive use. XLSX intentionally exports the
    // complete filtered dataset; silently truncating at 100 WOs produced
    // incomplete management reports and incorrect totals.
    const usePagination = format !== 'xlsx';

    // WorkOrder stores assetId/assetName as scalar fields and has no Prisma asset
    // relation. Fetch WOs first, then resolve referenced assets explicitly in bulk.
    // Keep pagination as an explicit branch so Prisma does not infer an invalid
    // union where skip/take are simultaneously required and optional.
    const baseQuery = {
      where: filterWhere,
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        workOrderComponents: {
          include: {
            componentRegistry: {
              include: {
                asset: { select: { id: true, name: true } },
                sparePartLinks: {
                  include: {
                    inventoryItem: { select: { id: true, itemCode: true, name: true, currentStock: true, unitCost: true } },
                  },
                },
              },
            },
          },
        },
        repairCompletion: {
          select: {
            findings: true,
            rootCause: true,
            correctiveAction: true,
            totalLaborHours: true,
            totalMaterialCost: true,
            totalDowntimeMinutes: true,
            completionNotes: true,
          },
        },
        repairMaterialRequests: {
          include: {
            item: { select: { itemCode: true, name: true } },
            componentRegistry: { select: { id: true, name: true, componentCode: true } },
          },
        },
        failureRecords: {
          select: {
            failureMode: true,
            failureCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    };

    const workOrders = usePagination
      ? await db.workOrder.findMany({
          ...baseQuery,
          skip: (page - 1) * limit,
          take: limit,
        })
      : await db.workOrder.findMany(baseQuery);

    const assetIds = [
      ...new Set(
        workOrders
          .map((wo) => wo.assetId)
          .filter((assetId): assetId is string => Boolean(assetId)),
      ),
    ];
    const assets = assetIds.length > 0
      ? await db.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, name: true, assetTag: true, serialNumber: true },
        })
      : [];
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

    const componentCatalog = assetIds.length > 0
      ? await db.componentRegistry.findMany({
          where: { assetId: { in: assetIds } },
          select: { id: true, name: true, componentCode: true, parentId: true, assetId: true },
        })
      : [];
    const componentMap = new Map(componentCatalog.map((component) => [component.id, component]));
    const componentPath = (componentId: string): string => {
      const chain: string[] = [];
      const seen = new Set<string>();
      let current = componentMap.get(componentId);
      while (current && !seen.has(current.id) && chain.length < 16) {
        seen.add(current.id);
        chain.unshift(current.name);
        current = current.parentId ? componentMap.get(current.parentId) : undefined;
      }
      return chain.join(' → ');
    };

    const rows: Record<string, unknown>[] = [];

    for (const wo of workOrders) {
      const asset = wo.assetId ? assetMap.get(wo.assetId) : undefined;
      const components = wo.workOrderComponents;
      const completion = wo.repairCompletion;
      const materials = wo.repairMaterialRequests;
      const failures = wo.failureRecords;

      if (components.length === 0) {
        rows.push({
          'WO Number': wo.woNumber,
          'Machine Name': asset?.name || wo.assetName || 'N/A',
          'Machine Tag': asset?.assetTag || 'N/A',
          'Serial Number': asset?.serialNumber || 'N/A',
          'Component/Part': '(No component specified)',
          'Component Hierarchy': '',
          'Component Code': '',
          'Component Type': '',
          'Component Criticality': '',
          'WO Type': wo.type,
          'Priority': wo.priority,
          'Status': wo.status,
          'Assigned To': wo.assignee?.fullName || 'N/A',
          'Failure Description': wo.failureDescription || '',
          'Failure Mode': failures.map((f) => f.failureMode).join(', ') || '',
          'Root Cause': completion?.rootCause || '',
          'Corrective Action': completion?.correctiveAction || '',
          'Findings': completion?.findings || '',
          'Materials Used': materials.map((m) => `${m.itemName} (Qty: ${m.quantityIssued})`).join('; ') || '',
          'Component Material Cost': '',
          'WO Material Cost (Machine Total)': wo.partsCost,
          'Labor Hours': completion?.totalLaborHours ?? wo.actualHours ?? 0,
          'Downtime (mins)': completion?.totalDowntimeMinutes ?? 0,
          'WO Total Cost (Machine Total)': wo.totalCost,
          'Cost Allocation Note': 'No exact component specified; cost remains at machine/work-order level',
          'Started': wo.actualStart?.toISOString().split('T')[0] || '',
          'Completed': wo.actualEnd?.toISOString().split('T')[0] || '',
          'Completion Notes': completion?.completionNotes || '',
        });
      } else {
        for (const woc of components) {
          const comp = woc.componentRegistry;
          const compMaterials = materials.filter(
            (m) => m.componentRegistryId === comp.id
          );
          const componentMaterialCost = compMaterials.reduce((sum, material) => {
            const usedQuantity = material.consumedQty ?? material.quantityIssued ?? 0;
            return sum + (usedQuantity * (material.unitCost ?? 0));
          }, 0);

          rows.push({
            'WO Number': wo.woNumber,
            'Machine Name': asset?.name || wo.assetName || 'N/A',
            'Machine Tag': asset?.assetTag || 'N/A',
            'Serial Number': asset?.serialNumber || 'N/A',
            'Component/Part': comp.name,
            'Component Hierarchy': componentPath(comp.id),
            'Component Code': comp.componentCode,
            'Component Type': comp.componentType,
            'Component Criticality': comp.criticality,
            'WO Type': wo.type,
            'Priority': wo.priority,
            'Status': wo.status,
            'Assigned To': wo.assignee?.fullName || 'N/A',
            'Failure Description': wo.failureDescription || '',
            'Failure Mode': failures.map((f) => f.failureMode).join(', ') || '',
            'Root Cause': completion?.rootCause || '',
            'Corrective Action': completion?.correctiveAction || '',
            'Findings': completion?.findings || '',
            'Materials Used': compMaterials
              .map((m) => `${m.itemName} (Qty: ${m.consumedQty ?? m.quantityIssued})`)
              .join('; ') || '',
            'Component Material Cost': Number(componentMaterialCost.toFixed(2)),
            'WO Material Cost (Machine Total)': wo.partsCost,
            'Labor Hours': completion?.totalLaborHours ?? wo.actualHours ?? 0,
            'Downtime (mins)': completion?.totalDowntimeMinutes ?? 0,
            'WO Total Cost (Machine Total)': wo.totalCost,
            'Cost Allocation Note': components.length > 1
              ? 'WO labor/downtime/total cost is machine-level and is intentionally not allocated across components'
              : 'Single affected component; WO totals remain machine-level for financial roll-up',
            'Started': wo.actualStart?.toISOString().split('T')[0] || '',
            'Completed': wo.actualEnd?.toISOString().split('T')[0] || '',
            'Completion Notes': woc.notes || completion?.completionNotes || '',
          });
        }
      }
    }

    const componentSummaryMap = new Map<string, {
      machineName: string;
      machineTag: string;
      componentName: string;
      componentHierarchy: string;
      componentCode: string;
      workOrderIds: Set<string>;
      materialCost: number;
      lastRepair: string;
    }>();

    for (const wo of workOrders) {
      const asset = wo.assetId ? assetMap.get(wo.assetId) : undefined;
      for (const woc of wo.workOrderComponents) {
        const comp = woc.componentRegistry;
        const componentMaterials = wo.repairMaterialRequests.filter((material) => material.componentRegistryId === comp.id);
        const materialCost = componentMaterials.reduce((sum, material) => {
          const usedQuantity = material.consumedQty ?? material.quantityIssued ?? 0;
          return sum + (usedQuantity * (material.unitCost ?? 0));
        }, 0);
        const current = componentSummaryMap.get(comp.id) || {
          machineName: asset?.name || wo.assetName || 'N/A',
          machineTag: asset?.assetTag || 'N/A',
          componentName: comp.name,
          componentHierarchy: componentPath(comp.id),
          componentCode: comp.componentCode,
          workOrderIds: new Set<string>(),
          materialCost: 0,
          lastRepair: '',
        };
        current.workOrderIds.add(wo.id);
        current.materialCost += materialCost;
        const completed = wo.actualEnd?.toISOString().split('T')[0] || wo.createdAt.toISOString().split('T')[0];
        if (!current.lastRepair || completed > current.lastRepair) current.lastRepair = completed;
        componentSummaryMap.set(comp.id, current);
      }
    }

    const componentSummaryRows = [...componentSummaryMap.values()]
      .map((entry) => ({
        'Machine Name': entry.machineName,
        'Machine Tag': entry.machineTag,
        'Component/Part': entry.componentName,
        'Component Hierarchy': entry.componentHierarchy,
        'Component Code': entry.componentCode,
        'Repair WO Count': entry.workOrderIds.size,
        'Component Material Cost': Number(entry.materialCost.toFixed(2)),
        'Last Repair': entry.lastRepair,
      }))
      .sort((a, b) => Number(b['Repair WO Count']) - Number(a['Repair WO Count']));

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data: rows,
        componentSummary: componentSummaryRows,
        summary: {
          totalWorkOrders: total,
          workOrdersOnPage: workOrders.length,
          totalRowsOnPage: rows.length,
          workOrdersWithComponentsOnPage: workOrders.filter((wo) => wo.workOrderComponents.length > 0).length,
          workOrdersWithoutComponentsOnPage: workOrders.filter((wo) => wo.workOrderComponents.length === 0).length,
        },
        pagination: { page, limit, total, totalPages },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length + 2, 15),
    }));
    ws['!cols'] = colWidths;

    const summaryData = [
      { 'Metric': 'Total Work Orders', 'Value': workOrders.length },
      { 'Metric': 'WOs with Components Specified', 'Value': workOrders.filter((wo) => wo.workOrderComponents.length > 0).length },
      { 'Metric': 'WOs without Components', 'Value': workOrders.filter((wo) => wo.workOrderComponents.length === 0).length },
      { 'Metric': 'Total Report Rows', 'Value': rows.length },
      { 'Metric': 'Total Material Cost', 'Value': workOrders.reduce((sum, wo) => sum + wo.partsCost, 0) },
      { 'Metric': 'Total Labor Hours', 'Value': workOrders.reduce((sum, wo) => sum + (wo.repairCompletion?.totalLaborHours ?? wo.actualHours ?? 0), 0) },
      { 'Metric': 'Total Work Order Cost', 'Value': workOrders.reduce((sum, wo) => sum + (wo.totalCost ?? 0), 0) },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Repair Details');
    if (componentSummaryRows.length > 0) {
      const wsComponents = XLSX.utils.json_to_sheet(componentSummaryRows);
      wsComponents['!cols'] = Object.keys(componentSummaryRows[0]).map((key) => ({ wch: Math.max(key.length + 2, 18) }));
      XLSX.utils.book_append_sheet(wb, wsComponents, 'Component Summary');
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=\"repair-details-${new Date().toISOString().split('T')[0]}.xlsx\"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
