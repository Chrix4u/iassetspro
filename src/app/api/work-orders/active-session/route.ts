import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';

// ============================================================================
// GET — return the current user's canonical live execution session.
//
// A session is live only when all three conditions hold:
//   1. action is start/resume,
//   2. endTime is still null,
//   3. the parent work order is still in_progress.
//
// This matches the authoritative start/resume conflict checks. Historical rows
// closed by hold/waiting/handover/completion therefore cannot keep the UI stuck
// in a false "active work" state merely because their action remains start/resume.
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const workOrderPlantFilter = getPlantFilterWhere(plantScope);
    const activeLog = await db.workOrderTimeLog.findFirst({
      where: {
        userId: session.userId,
        action: { in: ['start', 'resume'] },
        endTime: null,
        workOrder: {
          status: 'in_progress',
          ...workOrderPlantFilter,
        },
      },
      orderBy: { timestamp: 'desc' },
      include: {
        workOrder: {
          select: {
            id: true,
            woNumber: true,
            title: true,
            status: true,
          },
        },
        user: { select: { id: true, fullName: true, avatar: true } },
      },
    });

    if (!activeLog) {
      return NextResponse.json({
        success: true,
        data: { hasActive: false, session: null },
      });
    }

    const startedAt = activeLog.startTime || activeLog.timestamp;
    const elapsedMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    return NextResponse.json({
      success: true,
      data: {
        hasActive: true,
        session: {
          workOrderId: activeLog.workOrderId,
          workOrderNumber: activeLog.workOrder?.woNumber || 'N/A',
          workOrderTitle: activeLog.workOrder?.title || '',
          workOrderStatus: activeLog.workOrder?.status || '',
          action: activeLog.action,
          startedAt: startedAt.toISOString(),
          elapsedSeconds,
          elapsedMinutes,
          logId: activeLog.id,
          activityType: activeLog.activityType || 'maintenance',
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check active session';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
