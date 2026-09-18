import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';

const CONFIG_KEY = 'rwop_work_order_defaults';

type WorkOrderDefaults = {
  safetyNotes: string;
  ppeRequired: string;
  notes: string;
};

const EMPTY_DEFAULTS: WorkOrderDefaults = {
  safetyNotes: '',
  ppeRequired: '',
  notes: '',
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeDefaults(value: unknown): WorkOrderDefaults {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    safetyNotes: cleanText(source.safetyNotes, 4000),
    ppeRequired: cleanText(source.ppeRequired, 1000),
    notes: cleanText(source.notes, 4000),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const row = await db.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (!row) {
      return NextResponse.json({ success: true, data: EMPTY_DEFAULTS });
    }

    let parsed: unknown = {};
    try {
      parsed = JSON.parse(row.config);
    } catch {
      parsed = {};
    }

    return NextResponse.json({ success: true, data: normalizeDefaults(parsed) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work order defaults';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const defaults = normalizeDefaults(await request.json());
    const existing = await db.systemConfig.findUnique({ where: { key: CONFIG_KEY } });

    await db.$transaction([
      db.systemConfig.upsert({
        where: { key: CONFIG_KEY },
        update: { config: JSON.stringify(defaults) },
        create: { key: CONFIG_KEY, config: JSON.stringify(defaults) },
      }),
      db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'system_config',
          entityId: CONFIG_KEY,
          oldValues: existing?.config ?? null,
          newValues: JSON.stringify(defaults),
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: defaults });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save work order defaults';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
