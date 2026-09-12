import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import {
  requestRepairRework,
  type ReworkSessionContext,
  type ReworkAuditContext,
} from '@/services/workOrderRework.service';
import {
  verifyRepairWorkOrder,
  type VerificationSessionContext,
  type VerificationAuditContext,
} from '@/services/workOrderVerification.service';
import { extractAuditContext } from '@/lib/audit-helpers';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const evidence = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return evidence.length > 0 ? evidence : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    if (!hasPermission(session, 'work_orders.verify') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const auditCtx = extractAuditContext(request);

    if (optionalString(body.action) === 'rework') {
      const result = await requestRepairRework(
        id,
        session as ReworkSessionContext,
        {
          reason: optionalString(body.reason) || '',
          category: optionalString(body.category),
          evidence: optionalEvidence(body.evidence),
          notes: optionalString(body.notes),
          auditCtx: auditCtx as ReworkAuditContext,
        },
      );

      if (!result.success) {
        const status = result.error === 'Work order not found' ? 404 : 400;
        return NextResponse.json({ success: false, error: result.error }, { status });
      }

      return NextResponse.json({ success: true, data: result.data });
    }

    const qualityRating = typeof body.qualityRating === 'number' && Number.isFinite(body.qualityRating)
      ? body.qualityRating
      : undefined;
    const checklistPassed = typeof body.checklistPassed === 'boolean'
      ? body.checklistPassed
      : undefined;

    const result = await verifyRepairWorkOrder(
      id,
      session as VerificationSessionContext,
      {
        notes: optionalString(body.notes),
        qualityRating,
        checklistPassed,
        auditCtx: auditCtx as VerificationAuditContext,
      },
    );

    if (!result.success) {
      const status = result.error === 'Work order not found'
        ? 404
        : result.conflict
          ? 409
          : result.readiness
            ? 422
            : 400;
      return NextResponse.json({
        success: false,
        error: result.error,
        ...(result.readiness
          ? { blockers: result.readiness.blockers, warnings: result.readiness.warnings }
          : {}),
      }, { status });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      ...(result.idempotent ? { idempotent: true } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to verify work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
