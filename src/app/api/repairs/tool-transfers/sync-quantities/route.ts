import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';

// Legacy compatibility endpoint.
// V1.4 transfer completion updates quantityTransferred atomically at the exact
// physical handover, so inferring custody from historical transfer records is
// intentionally disabled. Historical inference can mutate the wrong request
// when the same tool appears in multiple work orders.
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  if (!hasPermission(session, 'repair_tool_transfers.update') && !isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: {
      synced: 0,
      legacySyncDisabled: true,
      message: 'Transfer custody is synchronized atomically when physical handover completes.',
    },
  });
}
