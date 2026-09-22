import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  permission: {
    findMany: vi.fn(),
  },
  userPlant: {
    findFirst: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  getRequestSession,
  getSession,
  sessionCache,
} from '@/lib/auth';

describe('getRequestSession', () => {
  beforeEach(() => {
    sessionCache.clear();
    vi.clearAllMocks();
    mockDb.session.update.mockResolvedValue({});
    mockDb.session.delete.mockResolvedValue({});
  });

  it('self-heals a valid persisted technician session when the process cache is cold', async () => {
    const createdAt = new Date('2026-09-22T00:00:00Z');
    mockDb.session.findUnique.mockResolvedValue({
      id: 'session-1',
      token: 'persisted-tech-token',
      userId: 'tech-1',
      roles: JSON.stringify(['maintenance_technician']),
      permissions: JSON.stringify([
        'work_orders.view_own',
        'tools.view',
        'repair_tool_requests.create',
      ]),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      createdAt,
    });
    mockDb.user.findUnique.mockResolvedValue({
      fullName: 'Assigned Technician',
      username: 'tech1',
    });

    const request = new Request('http://localhost/api/tools?mode=lookup', {
      headers: { Authorization: 'Bearer persisted-tech-token' },
    });

    // The legacy synchronous helper cannot recover a cold cache.
    expect(getSession(request)).toBeNull();

    const session = await getRequestSession(request);

    expect(session).toMatchObject({
      userId: 'tech-1',
      roles: ['maintenance_technician'],
      permissions: expect.arrayContaining([
        'tools.view',
        'repair_tool_requests.create',
      ]),
    });
    expect(mockDb.session.findUnique).toHaveBeenCalledWith({
      where: { token: 'persisted-tech-token' },
    });
    expect(sessionCache.get('persisted-tech-token')?.data.userId).toBe('tech-1');

    // A second request is served from the repopulated process cache.
    const second = await getRequestSession(request);
    expect(second?.userId).toBe('tech-1');
    expect(mockDb.session.findUnique).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the bearer header is absent or malformed', async () => {
    expect(await getRequestSession(new Request('http://localhost/api/tools'))).toBeNull();
    expect(
      await getRequestSession(
        new Request('http://localhost/api/tools', {
          headers: { Authorization: 'Basic abc123' },
        }),
      ),
    ).toBeNull();
    expect(mockDb.session.findUnique).not.toHaveBeenCalled();
  });
});
