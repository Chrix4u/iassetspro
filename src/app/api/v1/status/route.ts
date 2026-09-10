import { NextResponse } from 'next/server';

// GET /api/v1/status — API version info and infrastructure status
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      version: 'v1',
      apiVersion: '1.0.0',
      platform: 'iAssetsPro Enterprise',
      infrastructure: {
        redis: { status: process.env.REDIS_URL ? 'connected' : 'unavailable', type: 'optional' },
        database: { type: process.env.DATABASE_URL?.includes('mysql') ? 'mariadb' : 'sqlite', status: 'connected' },
        storage: { type: process.env.S3_ENDPOINT ? 's3' : 'local', status: 'available' },
        search: { type: 'in-memory', status: 'available' },
      },
      endpoints: {
        search: '/api/search',
        searchSuggest: '/api/search/suggest',
        timeSeries: '/api/telemetry',
        files: '/api/attachments',
        queues: '/api/notifications',
        health: '/api/health',
        digitalTwins: '/api/v1/digital-twins',
      },
      timestamp: new Date().toISOString(),
    },
  });
}
