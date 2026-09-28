import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { evaluateMeterPmTriggers } from '@/services/pm/meterTriggerEngine';

const CRON_SECRET = process.env.PM_CRON_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    const supplied = request.headers.get('x-pm-cron-secret') || '';
    if (!session && (!CRON_SECRET || supplied !== CRON_SECRET)) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const data = await evaluateMeterPmTriggers();
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PM trigger evaluation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}