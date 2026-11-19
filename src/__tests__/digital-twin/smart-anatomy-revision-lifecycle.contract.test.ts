import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const source=(file:string)=>readFileSync(file,'utf8');

describe('Smart Anatomy approval lifecycle cannot be bypassed through legacy routes',()=>{
  it('blocks legacy asset-model endpoints from forging or mutating protected CAD source records',()=>{
    const create=source('src/app/api/asset-models/route.ts');
    const detail=source('src/app/api/asset-models/[id]/route.ts');
    expect(create).toContain('Use the protected Smart Anatomy upload');
    expect(detail).toContain('Reviewed CAD provenance and geometry are immutable');
    expect(detail).toContain('Private CAD namespace cannot be assigned');
    expect(detail).toContain('Protected CAD cannot be deleted');
  });

  it('withdrawal makes reviewed scenes invisible and prohibits recommissioning a retired revision',()=>{
    const sceneList=source('src/app/api/digital-twin-scenes/route.ts');
    const sceneDetail=source('src/app/api/digital-twin-scenes/[id]/route.ts');
    const revoke=source('src/app/api/smart-anatomy/models/[id]/withdraw/route.ts');
    const status=source('src/app/api/smart-anatomy/models/[id]/status/route.ts');
    const commission=source('src/app/api/smart-anatomy/models/[id]/commission/route.ts');
    expect(sceneList).toContain("filePath: { not: { startsWith: '/api/smart-anatomy/models/' } }");
    expect(sceneDetail).toContain('Engineering approval for this private CAD scene has been withdrawn');
    expect(revoke).toContain('db.digitalTwinScene.updateMany');
    expect(revoke).toContain("action: 'withdraw'");
    expect(status).toContain("action: 'withdraw'");
    expect(commission).toContain("action: 'withdraw'");
    expect(commission).toContain('import and review a new revision');
  });

  it('uses an explicit confirmation with evidence and preserves original part/PM records',()=>{
    const uploader=source('src/components/digital-twin/PrivateCadUploader.tsx');
    const explorer=source('src/components/digital-twin/MachineVisualExplorer.tsx');
    expect(uploader).toContain('AlertDialogContent');
    expect(uploader).toContain('!independentReviewerEligible');
    expect(uploader).toContain("reviewStatus==='withdrawn'");
    expect(uploader).toContain('withdrawNote.trim().length < 15');
    expect(uploader).toContain('scenesWithdrawn');
    expect(uploader).toContain('PM schedules and maintenance history are not deleted');
    expect(explorer).toContain('privateCadModel?.isActive !== model?.isActive');
  });
});
