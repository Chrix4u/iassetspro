import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder } from '@/services/workOrderAccess.service';

/**
 * GET /api/work-orders/[id]/team-candidates?search=...&trade=...
 *
 * Work-order-scoped execution directory. It returns only active maintenance
 * technicians who can work in this WO's plant and excludes people already on
 * the execution roster.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        assignedBy: true,
        plannerId: true,
        isLocked: true,
        status: true,
        teamMembers: { select: { userId: true } },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json(
        { success: false, error: 'Operational work order must have a plant' },
        { status: 400 },
      );
    }
    if (wo.isLocked || ['verified', 'closed', 'cancelled'].includes(wo.status)) {
      return NextResponse.json(
        { success: false, error: 'Team membership cannot be changed for this work order' },
        { status: 409 },
      );
    }

    const hasAssignmentPermission =
      isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician']);
    const canAssignTeam =
      hasAssignmentPermission &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    if (!canAssignTeam) {
      return NextResponse.json(
        { success: false, error: 'You do not have accountable assignment authority for this work order' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const requestedTrade = searchParams.get('trade')?.trim() || '';

    const excludedIds = new Set<string>();
    if (wo.assignedTo) excludedIds.add(wo.assignedTo);
    if (wo.teamLeaderId) excludedIds.add(wo.teamLeaderId);
    for (const member of wo.teamMembers) excludedIds.add(member.userId);

    const users = await db.user.findMany({
      where: {
        status: 'active',
        ...(excludedIds.size > 0 ? { id: { notIn: [...excludedIds] } } : {}),
        plantAccess: { some: { plantId: wo.plantId } },
        userRoles: {
          some: {
            role: { slug: 'maintenance_technician' },
          },
        },
        ...(search
          ? {
              OR: [
                { fullName: { contains: search } },
                { staffId: { contains: search } },
                { username: { contains: search } },
                { primaryTrade: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        staffId: true,
        username: true,
        department: true,
        primaryTrade: true,
        userSkills: {
          select: {
            proficiencyLevel: true,
            trade: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });

    const normalizedTrade = requestedTrade.toLowerCase();
    const eligible = users
      .filter((user) => {
        if (!normalizedTrade) return true;
        const labels = [
          user.primaryTrade,
          ...user.userSkills.flatMap((skill) => [skill.trade.name, skill.trade.code]),
        ]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());
        return labels.includes(normalizedTrade);
      })
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        staffId: user.staffId,
        username: user.username,
        department: user.department,
        primaryTrade: user.primaryTrade,
        skills: user.userSkills.map((skill) => ({
          name: skill.trade.name,
          code: skill.trade.code,
          proficiency: skill.proficiencyLevel,
        })),
      }));

    return NextResponse.json({
      success: true,
      data: eligible,
      meta: {
        plantId: wo.plantId,
        requestedTrade: requestedTrade || null,
        excludedAssignedUsers: excludedIds.size,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load eligible team candidates';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
