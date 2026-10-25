import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { lockPmTemplateLifecycle } from '@/services/pm/templateLifecycle.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const plantId = typeof body?.plantId === 'string' ? body.plantId.trim() : '';
    if (!plantId) {
      return NextResponse.json({ success: false, error: 'Plant is required' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await lockPmTemplateLifecycle(tx, id);
      const template = await tx.pmTemplate.findUnique({
        where: { id },
        select: { id: true, title: true, plantId: true },
      });
      if (!template) return { kind: 'not_found' as const };
      if (template.plantId !== null) return { kind: 'already_owned' as const, plantId: template.plantId };

      const targetPlant = await tx.plant.findUnique({ where: { id: plantId }, select: { id: true } });
      if (!targetPlant) return { kind: 'plant_not_found' as const };

      const schedules = await tx.pmSchedule.findMany({
        where: { templateId: id },
        select: { asset: { select: { plantId: true } } },
      });
      const schedulePlantIds = [...new Set(schedules.map((schedule) => schedule.asset.plantId))];
      if (schedulePlantIds.length > 1 || (schedulePlantIds.length === 1 && schedulePlantIds[0] !== plantId)) {
        return { kind: 'conflict' as const, schedulePlantIds };
      }

      const updated = await tx.pmTemplate.update({
        where: { id, plantId: null },
        data: { plantId },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'pm_template',
          entityId: id,
          oldValues: JSON.stringify({ plantId: null }),
          newValues: JSON.stringify({ plantId, source: 'legacy_template_adoption' }),
        },
      });
      return { kind: 'assigned' as const, updated };
    });

    if (result.kind === 'not_found') {
      return NextResponse.json({ success: false, error: 'PM template not found' }, { status: 404 });
    }
    if (result.kind === 'plant_not_found') {
      return NextResponse.json({ success: false, error: 'Plant not found' }, { status: 404 });
    }
    if (result.kind === 'already_owned') {
      return NextResponse.json({ success: false, error: 'PM template already has plant ownership' }, { status: 409 });
    }
    if (result.kind === 'conflict') {
      return NextResponse.json(
        { success: false, error: 'Cannot assign PM template because existing schedules have conflicting plant ownership' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result.updated });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to assign PM template plant' },
      { status: 500 },
    );
  }
}
