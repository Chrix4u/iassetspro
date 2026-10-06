import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { resolvePmAutomationActorId } from '@/lib/pm-automation-actor';
import { evaluateMeterPmTriggers } from '@/services/pm/meterTriggerEngine';

const CRON_SECRET = process.env.PM_CRON_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    const supplied = request.headers.get('x-pm-cron-secret') || '';
    const cronAuthorized = Boolean(CRON_SECRET && supplied === CRON_SECRET);

    if (!session && !cronAuthorized) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // The cron-secret path is an explicitly trusted system-wide automation path.
    // Manual/session execution must require PM run authority and remains bounded
    // to the caller's accessible plant scope.
    if (session && !cronAuthorized && !hasPermission(session, 'pm_schedules.run') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    let plantIds: string[] | undefined;
    if (session && !cronAuthorized) {
      const plantScope = await getPlantScope(request, session);
      if (plantScope.denyAccess) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (!plantScope.isSystemWide) {
        plantIds = plantScope.isScoped && plantScope.plantId
          ? [plantScope.plantId]
          : plantScope.accessiblePlantIds;
      }
    }

    // Trusted cron must never accidentally inherit an unrelated browser actor.
    // Manual runs retain the initiating user as the audit actor.
    const actorId = await resolvePmAutomationActorId(
      cronAuthorized ? undefined : session?.userId,
    );

    const data = await evaluateMeterPmTriggers({ plantIds, actorId });
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PM trigger evaluation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
