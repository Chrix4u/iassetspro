import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP V1.2 assignment response concurrency contract', () => {
  it('reads the assignment version used for the response decision', () => {
    const service = read('src/services/workOrderAssignmentResponse.service.ts');
    expect(service).toContain('updatedAt: true');
  });

  it('claims accept or decline with compare-and-set semantics', () => {
    const service = read('src/services/workOrderAssignmentResponse.service.ts');
    expect(service).toContain('const claimed = await tx.workOrder.updateMany');
    expect(service).toContain("status: 'assigned'");
    expect(service).toContain('updatedAt: wo.updatedAt');
    expect(service).toContain('if (claimed.count !== 1)');
  });

  it('fails stale responses closed with an explicit conflict', () => {
    const service = read('src/services/workOrderAssignmentResponse.service.ts');
    expect(service).toContain('statusCode: 409');
    expect(service).toContain('Assignment changed concurrently; reload the work order before responding again');
  });

  it('creates audit evidence only after the assignment snapshot has been claimed', () => {
    const service = read('src/services/workOrderAssignmentResponse.service.ts');
    const claimIndex = service.indexOf('const claimed = await tx.workOrder.updateMany');
    const claimGuardIndex = service.indexOf('if (claimed.count !== 1)', claimIndex);
    const auditIndex = service.indexOf('await tx.auditLog.create', claimGuardIndex);

    expect(claimIndex).toBeGreaterThan(-1);
    expect(claimGuardIndex).toBeGreaterThan(claimIndex);
    expect(auditIndex).toBeGreaterThan(claimGuardIndex);
  });
});
