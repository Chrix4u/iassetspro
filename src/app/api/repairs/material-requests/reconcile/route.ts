import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { authorizeMaterialRequestPlant } from '@/lib/plant-auth-helpers';
import {
  MaterialCustodyConflictError,
  MaterialCustodyNotFoundError,
  MaterialCustodyValidationError,
  reconcileMaterialRequest,
} from '@/services/materialCustody.service';

// POST /api/repairs/material-requests/reconcile
// Sets authoritative consumed/wasted quantities and credits only the incremental
// physical return delta. Exact replay is idempotent and creates no stock movement.
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    if (!hasPermission(session, 'repair_material_requests.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, consumedQty, wastedQty, notes } = body;
    if (!id) return NextResponse.json({ success: false, error: 'Material request ID is required' }, { status: 400 });
    if (typeof consumedQty !== 'number' || consumedQty < 0) {
      return NextResponse.json({ success: false, error: 'consumedQty must be a non-negative number' }, { status: 400 });
    }
    if (wastedQty !== undefined && wastedQty !== null && (typeof wastedQty !== 'number' || wastedQty < 0)) {
      return NextResponse.json({ success: false, error: 'wastedQty must be a non-negative number' }, { status: 400 });
    }

    const plantAuth = await authorizeMaterialRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const resolvedWastedQty = wastedQty ?? 0;
    const result = await reconcileMaterialRequest(id, session.userId, consumedQty, resolvedWastedQty, notes);
    const matReq = result.updated;
    const reconciliationRate = result.issuedQty > 0 ? (consumedQty / result.issuedQty) * 100 : 0;
    const wasteRate = result.issuedQty > 0 ? (resolvedWastedQty / result.issuedQty) * 100 : 0;

    if (!result.replay) {
      await db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'material_request_reconcile',
          entityType: 'repair_material_request',
          entityId: id,
          newValues: JSON.stringify({
            action: 'reconcile',
            status: matReq.status,
            issuedQty: result.issuedQty,
            consumedQty,
            wastedQty: resolvedWastedQty,
            previousReturned: result.existingReturned,
            targetReturned: result.targetReturned,
            additionalReturnedToStock: result.additionalReturn,
            reconciliationRate: `${reconciliationRate.toFixed(1)}%`,
            wasteRate: `${wasteRate.toFixed(1)}%`,
            itemId: matReq.itemId || null,
          }),
        },
      });

      await notifyUser(
        matReq.requestedById,
        'repair_material_request',
        'Material Reconciliation Completed',
        `${matReq.itemName} for WO ${matReq.workOrder.woNumber}: ${consumedQty} consumed, ${resolvedWastedQty} wasted, ${result.targetReturned} returned.`,
        'repair_material_request',
        id,
        `material-requests?id=${id}`,
      );

      if (matReq.workOrder.plannerId && matReq.workOrder.plannerId !== matReq.requestedById) {
        await notifyUser(
          matReq.workOrder.plannerId,
          'repair_material_request',
          'Material Reconciliation Report',
          `${matReq.itemName} for WO ${matReq.workOrder.woNumber}: ${consumedQty} consumed, ${resolvedWastedQty} wasted, ${result.targetReturned} returned`,
          'repair_material_request',
          id,
          `material-requests?id=${id}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        materialRequest: matReq,
        reconciliation: {
          materialRequestId: id,
          itemName: matReq.itemName,
          woNumber: matReq.workOrder.woNumber,
          issuedQty: result.issuedQty,
          consumedQty,
          wastedQty: resolvedWastedQty,
          returnedQty: result.targetReturned,
          previousReturnedQty: result.existingReturned,
          additionalReturnedToStock: result.additionalReturn,
          reconciliationRate: Number(reconciliationRate.toFixed(1)),
          wasteRate: Number(wasteRate.toFixed(1)),
          status: matReq.status,
          replay: result.replay,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reconcile material request';
    if (error instanceof MaterialCustodyNotFoundError) return NextResponse.json({ success: false, error: message }, { status: 404 });
    if (error instanceof MaterialCustodyValidationError) return NextResponse.json({ success: false, error: message }, { status: 400 });
    if (error instanceof MaterialCustodyConflictError) return NextResponse.json({ success: false, error: message }, { status: 409 });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
