import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician WO resource access alignment', () => {
  it('keeps technician resource selectors on exact WO-scoped APIs', () => {
    const panels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panels).toContain('/api/work-orders/${workOrderId}/personal-tools');
    expect(panels).toContain('/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100');
    expect(panels).not.toContain('/api/tools?mode=lookup&status=available&limit=100');
  });

  it('keeps planner-selected tools visible as a fallback before auxiliary requests finish', () => {
    const panels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panels).toContain('plannerToolOptionsFromWorkOrder(workOrder)');
    expect(panels).toContain('setToolOptions(plannerToolFallbacks)');
    expect(panels).toContain('for (const tool of plannerToolFallbacks) merged.set(tool.id, tool)');
  });

  it('uses the same exact-WO execution access boundary for capabilities and resource endpoints', () => {
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    const personalTools = read('src/app/api/work-orders/[id]/personal-tools/route.ts');
    const toolCandidates = read('src/app/api/work-orders/[id]/tool-candidates/route.ts');

    expect(capabilities).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(personalTools).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(toolCandidates).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
  });

  it('allows assigned team members through the execution helper but keeps pending handover receivers view-only', () => {
    const access = read('src/services/workOrderAccess.service.ts');

    expect(access).toContain("member.role !== 'handover_receiver'");
    expect(access).not.toContain("member.accessLevel !== 'read_only'");
  });
});
