import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Mock } from 'vitest';

const { mockDb, mockCanAccessPlantStrict } = vi.hoisted(() => ({
  mockDb: {
    tool: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockCanAccessPlantStrict: vi.fn(() => true),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(() => ({ userId: 'store-1' })),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  isAdmin: vi.fn(() => false),
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: vi.fn(async () => ({ unrestricted: false, denyAccess: false, plantId: 'plant-a', allowedPlantIds: ['plant-a'] })),
  getPlantFilterWhere: vi.fn(() => ({})),
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));

import { POST } from '@/app/api/tools/route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tools', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('tool registration custody boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccessPlantStrict.mockReturnValue(true);
    (mockDb.tool.findFirst as Mock).mockResolvedValue({ toolCode: 'TL-0009' });
    (mockDb.tool.create as Mock).mockResolvedValue({ id: 'tool-1', toolCode: 'TL-0010', status: 'available', assignedToId: null, quantity: 3 });
    (mockDb.auditLog.create as Mock).mockResolvedValue({});
  });

  it('rejects creating a tool as already assigned', async () => {
    const response = await POST(request({ name: 'Torque Wrench', category: 'Hand Tool', assignedToId: 'tech-1', plantId: 'plant-a' }));
    expect(response.status).toBe(400);
    expect(mockDb.tool.create).not.toHaveBeenCalled();
  });

  it('rejects creating a tool in a non-available lifecycle state', async () => {
    const response = await POST(request({ name: 'Torque Wrench', category: 'Hand Tool', status: 'checked_out', plantId: 'plant-a' }));
    expect(response.status).toBe(400);
    expect(mockDb.tool.create).not.toHaveBeenCalled();
  });

  it('rejects registration into a plant outside the actor scope', async () => {
    mockCanAccessPlantStrict.mockReturnValue(false);
    const response = await POST(request({ name: 'Torque Wrench', category: 'Hand Tool', plantId: 'plant-b' }));
    expect(response.status).toBe(403);
    expect(mockDb.tool.create).not.toHaveBeenCalled();
  });

  it('registers valid initial stock available and unassigned', async () => {
    const response = await POST(request({ name: 'Torque Wrench', category: 'Hand Tool', condition: 'good', quantity: 3, plantId: 'plant-a' }));
    expect(response.status).toBe(201);
    expect(mockDb.tool.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'available', assignedToId: null, quantity: 3, plantId: 'plant-a' }),
    }));
  });
});
