import { afterEach, describe, expect, it } from 'vitest';
import { getSession, sessionCache } from '@/lib/auth';

describe('proxy-to-route session forwarding', () => {
  afterEach(() => {
    sessionCache.clear();
  });

  it('reconstructs a valid session when the route worker cache is cold', () => {
    const request = new Request('http://localhost/api/tools?mode=lookup', {
      headers: {
        authorization: 'Bearer cold-worker-token',
        'x-session-verified': '1',
        'x-session-user-id': 'tech-1',
        'x-session-username': encodeURIComponent('tech1'),
        'x-session-full-name': encodeURIComponent('Kofi Technician'),
        'x-session-roles': 'maintenance_technician',
        'x-session-permissions': 'tools.view,repair_tool_requests.create,work_orders.start',
        'x-session-created-at': '2026-09-22T00:00:00.000Z',
      },
    });

    const session = getSession(request);

    expect(session).toMatchObject({
      userId: 'tech-1',
      username: 'tech1',
      fullName: 'Kofi Technician',
      roles: ['maintenance_technician'],
      permissions: ['tools.view', 'repair_tool_requests.create', 'work_orders.start'],
    });
    expect(sessionCache.get('cold-worker-token')?.data.userId).toBe('tech-1');
  });

  it('does not trust forwarded identity headers without the verified proxy marker', () => {
    const request = new Request('http://localhost/api/tools?mode=lookup', {
      headers: {
        authorization: 'Bearer unverified-token',
        'x-session-user-id': 'tech-1',
        'x-session-roles': 'maintenance_technician',
        'x-session-permissions': 'tools.view',
      },
    });

    expect(getSession(request)).toBeNull();
  });

  it('still requires a bearer token even when proxy headers are present', () => {
    const request = new Request('http://localhost/api/tools?mode=lookup', {
      headers: {
        'x-session-verified': '1',
        'x-session-user-id': 'tech-1',
        'x-session-roles': 'maintenance_technician',
        'x-session-permissions': 'tools.view',
      },
    });

    expect(getSession(request)).toBeNull();
  });
});
