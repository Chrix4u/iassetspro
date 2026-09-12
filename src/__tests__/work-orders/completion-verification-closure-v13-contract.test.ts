import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP V1.3 completion → verification → closure integrity contract', () => {
  it('requires complete RCA and attachment evidence for corrective/predictive progression', () => {
    const readiness = read('src/services/workOrderReadiness.service.ts');

    expect(readiness).toContain("return type === 'corrective' || type === 'predictive'");
    expect(readiness).toContain('failureDescription: true');
    expect(readiness).toContain('causeDescription: true');
    expect(readiness).toContain('actionDescription: true');
    expect(readiness).toContain("client.attachment.count");
    expect(readiness).toContain("entityType: 'work_order', entityId: workOrderId");
    expect(readiness).toContain("code: 'RCA_REQUIRED'");
    expect(readiness).toContain("code: 'COMPLETION_EVIDENCE_REQUIRED'");
    expect(readiness).toContain("missing.push('failure description')");
    expect(readiness).toContain("missing.push('root cause')");
    expect(readiness).toContain("missing.push('corrective action')");

    const integrityCalls = readiness.match(/checkRequiredRepairEvidence\(wo, evidenceAttachmentCount, blockers\)/g) || [];
    expect(integrityCalls).toHaveLength(3);
  });

  it('allows completion-submitted RCA values to satisfy readiness before transition persistence', () => {
    const readiness = read('src/services/workOrderReadiness.service.ts');
    const completion = read('src/services/workOrderCompletion.service.ts');

    expect(readiness).toContain('export interface WorkOrderReadinessContext');
    expect(readiness).toContain('context?.completionEvidence?.failureDescription ?? wo.failureDescription');
    expect(readiness).toContain('context?.completionEvidence?.causeDescription ?? wo.causeDescription');
    expect(readiness).toContain('context?.completionEvidence?.actionDescription ?? wo.actionDescription');

    expect(completion).toContain("checkReadiness(workOrderId, 'complete', tx, {");
    expect(completion).toContain('completionEvidence: {');
    expect(completion).toContain('failureDescription: options.failureDescription');
    expect(completion).toContain('causeDescription: options.causeDescription');
    expect(completion).toContain('actionDescription: options.actionDescription');
  });

  it('keeps the canonical state machine as the CAS owner of lifecycle transitions', () => {
    const stateMachine = read('src/lib/state-machine.ts');

    expect(stateMachine).toContain('workOrder.updateMany');
    expect(stateMachine).toContain('status: currentState');
    expect(stateMachine).toContain('Concurrent transition detected: work_order');

    for (const service of [
      'src/services/workOrderCompletion.service.ts',
      'src/services/workOrderVerification.service.ts',
      'src/services/workOrderClosure.service.ts',
    ]) {
      const source = read(service);
      expect(source).toContain("executeTransition('work_order'");
      expect(source).toContain("startsWith('Concurrent transition detected:')");
    }
  });

  it('makes exact same-state lifecycle retries idempotent without replaying side effects', () => {
    const completion = read('src/services/workOrderCompletion.service.ts');
    const verification = read('src/services/workOrderVerification.service.ts');
    const closure = read('src/services/workOrderClosure.service.ts');

    expect(completion).toContain("if (wo.status === 'completed')");
    expect(completion).toContain('readCommittedCompletionRetry');
    expect(completion).toContain('idempotent: true as const');
    expect(completion).toContain("if ('idempotent' in outcome && outcome.idempotent)");

    expect(verification).toContain("if (wo.status === 'verified')");
    expect(verification).toContain('readCommittedVerificationRetry');
    expect(verification).toContain('idempotent: true as const');
    expect(verification).toContain("if ('idempotent' in outcome && outcome.idempotent)");

    expect(closure).toContain("if (wo.status === 'closed')");
    expect(closure).toContain('readCommittedClosureRetry');
    expect(closure).toContain('idempotent: true as const');
    expect(closure).toContain("if ('idempotent' in outcome && outcome.idempotent)");
  });

  it('does not pretend a request is idempotent after the work order progressed beyond that lifecycle stage', () => {
    const completion = read('src/services/workOrderCompletion.service.ts');
    const verification = read('src/services/workOrderVerification.service.ts');

    expect(completion).toContain("wo.status === 'verified' || wo.status === 'closed'");
    expect(completion).toContain('already progressed beyond completion');
    expect(verification).toContain("if (wo.status === 'closed')");
    expect(verification).toContain('already progressed beyond verification');
  });

  it('returns HTTP 409 for true lifecycle conflicts and exposes successful idempotent retries', () => {
    for (const route of [
      'src/app/api/work-orders/[id]/complete/route.ts',
      'src/app/api/work-orders/[id]/verify/route.ts',
      'src/app/api/work-orders/[id]/close/route.ts',
    ]) {
      const source = read(route);
      expect(source).toContain('result.conflict');
      expect(source).toContain('? 409');
      expect(source).toContain("...(result.idempotent ? { idempotent: true } : {})");
    }
  });

  it('guards committed retry snapshots before treating them as successful', () => {
    const completion = read('src/services/workOrderCompletion.service.ts');
    const verification = read('src/services/workOrderVerification.service.ts');
    const closure = read('src/services/workOrderClosure.service.ts');

    expect(completion).toContain('canonical completion snapshot is missing');
    expect(verification).toContain('canonical supervisor approval snapshot is missing');
    expect(verification).toContain("supervisorStatus !== 'approved'");
    expect(closure).toContain('canonical planner closure snapshot is incomplete');
    expect(closure).toContain("plannerStatus !== 'closed'");
    expect(closure).toContain('!current.isLocked');
  });
});
