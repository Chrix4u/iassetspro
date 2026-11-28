import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// ============================================================================
// GET /api/user/preferences — Get current user's preferences
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { preferences: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Parse preferences JSON or return defaults
    let preferences: Record<string, any> = {};
    if (user.preferences) {
      try {
        preferences = typeof user.preferences === 'string'
          ? JSON.parse(user.preferences)
          : user.preferences;
      } catch {
        preferences = {};
      }
    }

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch preferences';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// PUT /api/user/preferences — Update current user's preferences
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { display, notifications, dateTime } = body;

    // Build preferences object with validation
    const preferences: Record<string, any> = {};

    // Display preferences
    if (display) {
      preferences.display = {
        defaultPage: typeof display.defaultPage === 'string' ? display.defaultPage : 'dashboard',
        itemsPerPage: [10, 25, 50, 100].includes(display.itemsPerPage) ? display.itemsPerPage : 25,
        compactMode: typeof display.compactMode === 'boolean' ? display.compactMode : false,
      };
    }

    // Notification preferences
    if (notifications) {
      preferences.notifications = {
        soundEnabled: typeof notifications.soundEnabled === 'boolean' ? notifications.soundEnabled : true,
        desktopNotifications: typeof notifications.desktopNotifications === 'boolean' ? notifications.desktopNotifications : false,
      };
    }

    // Date/Time preferences
    if (dateTime) {
      const validFormats = ['DD/MM/YYYY', 'DD-MM-YYYY'];
      preferences.dateTime = {
        dateFormat: validFormats.includes(dateTime.dateFormat) ? dateTime.dateFormat : 'DD/MM/YYYY',
        timezone: typeof dateTime.timezone === 'string' ? dateTime.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }

    await db.user.update({
      where: { id: session.userId },
      data: {
        preferences: preferences as any,
      },
    });

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update preferences';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
