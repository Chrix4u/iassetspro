import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { getPmPortfolioCompliance } from '@/services/pm/pmPortfolioCompliance.service';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const plantId = String(searchParams.get('plantId') || '').trim();
    if (!plantId) {
      return NextResponse.json({ success: false, error: 'Plant is required' }, { status: 400 });
    }

    const plant = await db.plant.findUnique({
      where: { id: plantId },
      select: { id: true },
    });
    if (!plant) {
      return NextResponse.json({ success: false, error: 'Plant not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(scope, plant.id)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const departmentId = String(searchParams.get('departmentId') || '').trim() || undefined;
    const windowDays = Number(searchParams.get('windowDays') || 30);
    const data = await getPmPortfolioCompliance({
      client: db,
      plantId,
      departmentId,
      windowDays,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load PM portfolio compliance',
      },
      { status: 500 },
    );
  }
}
