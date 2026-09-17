import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician start readiness capability contract', () => {
  it('reuses the canonical readiness service before exposing a start preview', () => {
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(capabilities).toContain("import { checkReadiness } from '@/services/workOrderReadiness.service';");
    expect(capabilities).toContain("const startReadiness = canAttemptStart");
    expect(capabilities).toContain("? await checkReadiness(id, 'start')");
    expect(capabilities).toContain('canStart: canAttemptStart');
    expect(capabilities).toContain('startReadiness,');
  });

  it('shows readiness before execution and disables Start only for blockers', () => {
    const technicianPage = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(technicianPage).toContain('const startReadiness = caps?.startReadiness || null;');
    expect(technicianPage).toContain('const startBlocked = Boolean(caps?.canStart && startReadiness && !startReadiness.ready);');
    expect(technicianPage).toContain('disabled={busy !== null || startBlocked}');
    expect(technicianPage).toContain('Start blocked — resolve readiness items first');
    expect(technicianPage).toContain('Ready to start with warnings');
  expect(technicianPage).toContain("'TECH_ELIG_TRADE_MISMATCH'");
  expect(technicianPage).toContain("'TECH_ELIG_NO_SKILL_RECORD'");
  expect(technicianPage).toContain("'TECH_ELIG_NO_CERTIFICATION'");
  expect(technicianPage).toContain('!TECHNICIAN_HIDDEN_PROFILE_WARNING_CODES.has(item.code)');
  expect(technicianPage).not.toContain('Ready to start with safety warnings');
    expect(technicianPage).toContain('Ready to start');
  });

  it('keeps POST start enforcement on the same canonical readiness service', () => {
    const startService = read('src/services/workOrderStartExecution.service.ts');
    const startRoute = read('src/app/api/work-orders/[id]/start/route.ts');

    expect(startService).toContain("const readiness = await checkReadiness(workOrderId, 'start', tx);");
    expect(startService).toContain('if (!readiness.ready)');
    expect(startRoute).toContain('blockers: result.readiness.blockers');
    expect(startRoute).toContain('warnings: result.readiness.warnings');
  });
});
