import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  session: vi.fn(), permission: vi.fn(), admin: vi.fn(),
  findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(),
  create: vi.fn(), update: vi.fn(), auditCreate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: (...args: unknown[]) => m.session(...args),
  hasPermission: (...args: unknown[]) => m.permission(...args),
  isAdmin: (...args: unknown[]) => m.admin(...args),
}));
vi.mock('@/lib/db', () => ({
  db: {
    workCenter: {
      findMany: (...args: unknown[]) => m.findMany(...args),
      count: (...args: unknown[]) => m.count(...args),
      findUnique: (...args: unknown[]) => m.findUnique(...args),
      findFirst: (...args: unknown[]) => m.findFirst(...args),
      create: (...args: unknown[]) => m.create(...args),
      update: (...args: unknown[]) => m.update(...args),
    },
    auditLog: { create: (...args: unknown[]) => m.auditCreate(...args) },
  },
}));
import { GET as list, POST as create } from '@/app/api/work-centers/route';
import { GET as detail, PUT as edit, DELETE as deactivate } from '@/app/api/work-centers/[id]/route';

const url = 'http://localhost/api/work-centers';
const request = (path = '', init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url + path, init);
const ctx = { params: Promise.resolve({ id: 'wc-1' }) };
const wc = { id: 'wc-1', code: 'WC-0001', name: 'Packaging line', type: 'packaging', isActive: true, status: 'active', capacity: 10 };

describe('Work Center endpoint authorization and data integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.session.mockReturnValue({ userId: 'operator-1', roles: ['operator'], permissions: [] });
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.view');
    m.admin.mockReturnValue(false);
    m.findMany.mockResolvedValue([wc]);
    m.findUnique.mockResolvedValue(wc);
    m.findFirst.mockResolvedValue({ code: 'WC-0001' });
    m.count.mockResolvedValue(1);
    m.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'wc-new', ...data }));
    m.update.mockResolvedValue({ ...wc, status: 'maintenance' });
    m.auditCreate.mockResolvedValue({ id: 'audit-1' });
  });

  it('requires authentication before listing', async () => {
    m.session.mockReturnValue(null);
    expect((await list(request())).status).toBe(401);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('denies list and details to users without work_centers.view', async () => {
    m.permission.mockReturnValue(false);
    expect((await list(request())).status).toBe(403);
    expect((await detail(request('/wc-1'), ctx)).status).toBe(403);
    expect(m.findMany).not.toHaveBeenCalled();
    expect(m.findUnique).not.toHaveBeenCalled();
  });

  it('keeps read-only Work Center options available for production scheduling', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'production.view');
    expect((await list(request())).status).toBe(200);
    expect((await detail(request('/wc-1'), ctx)).status).toBe(403);
  });

  it('permits an administrator to read even without a separate view grant', async () => {
    m.admin.mockReturnValue(true);
    m.permission.mockReturnValue(false);
    expect((await list(request())).status).toBe(200);
    expect((await detail(request('/wc-1'), ctx)).status).toBe(200);
  });

  it('rejects soft-deactivated work centers from the detail endpoint', async () => {
    m.findUnique.mockResolvedValue({ ...wc, isActive: false });
    expect((await detail(request('/wc-1'), ctx)).status).toBe(404);
  });

  it('bounds untrusted pagination while retaining the 999-row production selectors', async () => {
    const res = await list(request('?page=-2&limit=999999'));
    expect(res.status).toBe(200);
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1000 }));
    const body = await res.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1000);
    await list(request('?limit=999'));
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 999 }));
  });

  it('disallows changing active status through the normal edit API', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.update');
    const response = await edit(request('/wc-1', { method: 'PUT', body: JSON.stringify({ isActive: false }) }), ctx);
    expect(response.status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('cannot reactivate or edit an already deactivated work center', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.update');
    m.findUnique.mockResolvedValue({ ...wc, isActive: false });
    const response = await edit(request('/wc-1', { method: 'PUT', body: JSON.stringify({ name: 'Reactivated' }) }), ctx);
    expect(response.status).toBe(404);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('allows an authorized operator to edit status without mutating activation', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.update');
    const response = await edit(request('/wc-1', { method: 'PUT', body: JSON.stringify({ status: 'maintenance' }) }), ctx);
    expect(response.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'wc-1' }, data: { status: 'maintenance' } });
  });

  it('reserves deactivation for administrators and prevents repeated deactivation', async () => {
    expect((await deactivate(request('/wc-1', { method: 'DELETE' }), ctx)).status).toBe(403);
    m.admin.mockReturnValue(true);
    m.findUnique.mockResolvedValue({ ...wc, isActive: false });
    expect((await deactivate(request('/wc-1', { method: 'DELETE' }), ctx)).status).toBe(404);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('rejects unsupported create type and status without writing', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.create');
    const badType = await create(request('', { method: 'POST', body: JSON.stringify({ name: 'Line', type: 'unknown' }) }));
    expect(badType.status).toBe(400);
    const badStatus = await create(request('', { method: 'POST', body: JSON.stringify({ name: 'Line', type: 'production', status: 'deleted' }) }));
    expect(badStatus.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });

  it('trims valid names and safely converts a numeric capacity on create', async () => {
    m.permission.mockImplementation((_session: unknown, slug: string) => slug === 'work_centers.create');
    const response = await create(request('', { method: 'POST', body: JSON.stringify({ name: '  Line A  ', type: 'production', capacity: '25' }) }));
    expect(response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'WC-0002', name: 'Line A', capacity: 25 }),
    }));
  });
});
