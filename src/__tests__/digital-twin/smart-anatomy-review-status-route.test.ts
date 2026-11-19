// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  modelFindUnique:vi.fn(),auditFindFirst:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,hasPermission:mocked.hasPermission,isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocked.modelFindUnique},
    auditLog:{findFirst:mocked.auditFindFirst},
  },
}));
import { GET } from '@/app/api/smart-anatomy/models/[id]/status/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const req=()=>new NextRequest('http://localhost/api/smart-anatomy/models/'+id+'/status');
const ctx={params:Promise.resolve({id})};

beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'tech-1'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-1');
  mocked.modelFindUnique.mockResolvedValue({
    id,filePath:'/api/smart-anatomy/models/'+id+'/file',
    isActive:false,asset:{plantId:'plant-1'},
  });
  mocked.auditFindFirst.mockResolvedValue(null);
});

describe('private CAD review status, permission and history',()=>{
  it('refuses unauthenticated lookup without disclosing model existence',async()=>{
    mocked.getSession.mockReturnValue(null);
    expect((await GET(req(),ctx)).status).toBe(401);
    expect(mocked.modelFindUnique).not.toHaveBeenCalled();
  });
  it('blocks other plants before checking engineering audit events',async()=>{
    mocked.modelFindUnique.mockResolvedValue({
      id,filePath:'/api/smart-anatomy/models/'+id+'/file',
      isActive:false,asset:{plantId:'other-plant'},
    });
    expect((await GET(req(),ctx)).status).toBe(403);
    expect(mocked.auditFindFirst).not.toHaveBeenCalled();
  });
  it('distinguishes new unreviewed geometry from a previously withdrawn revision',async()=>{
    let response=await GET(req(),ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe('awaiting-review');
    mocked.auditFindFirst.mockResolvedValue({id:'audit-withdraw'});
    response=await GET(req(),ctx);
    expect((await response.json()).data.status).toBe('withdrawn');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('reports approved active CAD without implying physical maintenance approval',async()=>{
    mocked.modelFindUnique.mockResolvedValue({
      id,filePath:'/api/smart-anatomy/models/'+id+'/file',
      isActive:true,asset:{plantId:'plant-1'},
    });
    const response=await GET(req(),ctx);
    expect((await response.json()).data.status).toBe('approved');
  });
});
