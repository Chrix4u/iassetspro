import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const profile = await db.companyProfile.findFirst();

    if (!profile) {
      // Return sensible defaults so the frontend never gets null
      return NextResponse.json({
        success: true,
        data: {
          id: '',
          companyName: 'iAssetsPro',
          tradingName: 'iAssetsPro',
          logo: null,
          address: null,
          city: null,
          region: null,
          country: 'Ghana',
          postalCode: null,
          phone: null,
          email: null,
          website: null,
          industry: null,
          employeeCount: null,
          fiscalYearStart: 'January',
          timezone: 'Africa/Accra',
          currency: 'GHS',
          dateFormat: 'DD/MM/YYYY',
          isSetupComplete: false,
          setupCompletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load company profile';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getSession({ headers: request.headers } as Request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(session, 'system_settings.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();

    // Check if this is a setup completion transition
    const existing = await db.companyProfile.findFirst();
    const wasSetupComplete = existing?.isSetupComplete ?? false;
    const isNowSetupComplete = body.isSetupComplete === true;

    // Upsert: update if exists, create if not
    const profile = await db.companyProfile.upsert({
      where: { id: existing?.id || '__none__' },
      create: {
        companyName: body.companyName || 'iAssetsPro',
        tradingName: body.tradingName || null,
        logo: body.logo || null,
        address: body.address || null,
        city: body.city || null,
        region: body.region || null,
        country: body.country || 'Ghana',
        postalCode: body.postalCode || null,
        phone: body.phone || null,
        email: body.email || null,
        website: body.website || null,
        industry: body.industry || null,
        employeeCount: body.employeeCount || null,
        fiscalYearStart: body.fiscalYearStart || 'January',
        timezone: body.timezone || 'Africa/Accra',
        currency: body.currency || 'GHS',
        dateFormat: body.dateFormat || 'DD/MM/YYYY',
        isSetupComplete: isNowSetupComplete,
        setupCompletedAt: isNowSetupComplete ? new Date() : null,
      },
      update: {
        companyName: body.companyName,
        tradingName: body.tradingName ?? undefined,
        logo: body.logo ?? undefined,
        address: body.address ?? undefined,
        city: body.city ?? undefined,
        region: body.region ?? undefined,
        country: body.country ?? undefined,
        postalCode: body.postalCode ?? undefined,
        phone: body.phone ?? undefined,
        email: body.email ?? undefined,
        website: body.website ?? undefined,
        industry: body.industry ?? undefined,
        employeeCount: body.employeeCount ?? undefined,
        fiscalYearStart: body.fiscalYearStart ?? undefined,
        timezone: body.timezone ?? undefined,
        currency: body.currency ?? undefined,
        dateFormat: body.dateFormat ?? undefined,
        isSetupComplete: isNowSetupComplete,
        setupCompletedAt: isNowSetupComplete && !wasSetupComplete ? new Date() : (isNowSetupComplete ? (existing?.setupCompletedAt ?? new Date()) : null),
      },
    });

    return NextResponse.json({ success: true, data: profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update company profile';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
