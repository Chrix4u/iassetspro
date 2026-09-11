import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  respondToWorkOrderAssignment,
  type AssignmentResponseDecision,
} from '@/services/workOrderAssignmentResponse.service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const decision = body.response;
    if (decision !== 'accepted' && decision !== 'declined') {
      return NextResponse.json({ success: false, error: "response must be 'accepted' or 'declined'" }, { status: 400 });
    }

    const result = await respondToWorkOrderAssignment(
      id,
      decision as AssignmentResponseDecision,
      { userId: session.userId, fullName: session.fullName },
      {
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        auditCtx: extractAuditContext(request),
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.statusCode });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record assignment response';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
