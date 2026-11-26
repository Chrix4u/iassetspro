import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPlantScope, getPlantFilterWhere } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    const pf = getPlantFilterWhere(plantScope);
    // Alerts, readings and rules inherit plant ownership through their device.
    const deviceScope = Object.keys(pf).length ? { device: pf } : {};

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Device counts by status
    const [totalDevices, onlineDevices, offlineDevices, warningDevices, errorDevices] = await Promise.all([
      db.iotDevice.count({ where: { ...pf, isActive: true } }),
      db.iotDevice.count({ where: { ...pf, isActive: true, status: 'online' } }),
      db.iotDevice.count({ where: { ...pf, isActive: true, status: 'offline' } }),
      db.iotDevice.count({ where: { ...pf, isActive: true, status: 'warning' } }),
      db.iotDevice.count({ where: { ...pf, isActive: true, status: 'error' } }),
    ]);

    // Alerts today and recent
    const [alertsToday, activeAlerts, criticalAlerts] = await Promise.all([
      db.iotAlert.count({
        where: { ...deviceScope, createdAt: { gte: todayStart } },
      }),
      db.iotAlert.count({
        where: { ...deviceScope, status: 'active' },
      }),
      db.iotAlert.count({
        where: { ...deviceScope, severity: 'critical', status: 'active' },
      }),
    ]);

    // Recent alerts (last 20)
    const recentAlerts = await db.iotAlert.findMany({
      where: { ...deviceScope, status: 'active' },
      include: {
        device: { select: { id: true, name: true, deviceCode: true } },
        rule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Devices needing attention (warning or error status)
    const attentionDevices = await db.iotDevice.findMany({
      where: {
        ...pf,
        isActive: true,
        status: { in: ['warning', 'error'] },
      },
      include: {
        _count: { select: { alerts: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // Active sensors count (type = 'sensor' and online)
    const activeSensors = await db.iotDevice.count({
      where: { ...pf, isActive: true, type: 'sensor', status: 'online' },
    });

    // Total readings today
    const readingsToday = await db.iotReading.count({
      where: { ...deviceScope, timestamp: { gte: todayStart } },
    });

    // Active rules
    const activeRules = await db.iotAlertRule.count({
      where: { ...deviceScope, isActive: true },
    });

    // Get devices with latest readings for live sensor data
    const devicesWithReadings = await db.iotDevice.findMany({
      where: {
        ...pf,
        isActive: true,
        type: 'sensor',
      },
      include: {
        readings: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
        rules: {
          where: { isActive: true },
          orderBy: { threshold: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        devices: {
          total: totalDevices,
          online: onlineDevices,
          offline: offlineDevices,
          warning: warningDevices,
          error: errorDevices,
          alerting: warningDevices + errorDevices,
          activeSensors,
        },
        alerts: {
          today: alertsToday,
          active: activeAlerts,
          critical: criticalAlerts,
          recent: recentAlerts,
        },
        readingsToday,
        activeRules,
        attentionDevices,
        devicesWithReadings,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load monitoring summary';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
