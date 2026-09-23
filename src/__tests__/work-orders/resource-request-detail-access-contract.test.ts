import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP resource request detail access contract', () => {
  const toolDetail = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const toolList = read('src/app/api/repairs/tool-requests/route.ts');
  const materialDetail = read('src/app/api/repairs/material-requests/[id]/route.ts');
  const materialList = read('src/app/api/repairs/material-requests/route.ts');

  it('requires explicit tool-request view permission on detail reads', () => {
    expect(toolDetail).toContain("hasAnyPermission(session, [");
    expect(toolDetail).toContain("'repair_tool_requests.view'");
    expect(toolDetail).toContain("'repair_tool_requests.view_all'");
    expect(toolDetail).toContain("'repair_tool_requests.view_own'");
    expect(toolDetail).toContain("hasPermission(session, 'repair_tool_requests.view_own')");
    expect(toolDetail).toContain('isWorkOrderExecutionMember(session, toolReq.workOrder)');
    expect(toolDetail).toContain('toolReq.requestedById === session.userId');
    expect(toolDetail).toContain('this tool request is outside your work-order scope');
  });

  it('requires explicit material-request view permission on detail reads', () => {
    expect(materialDetail).toContain("hasAnyPermission(session, [");
    expect(materialDetail).toContain("'repair_material_requests.view'");
    expect(materialDetail).toContain("'repair_material_requests.view_all'");
    expect(materialDetail).toContain("'repair_material_requests.view_own'");
    expect(materialDetail).toContain("hasPermission(session, 'repair_material_requests.view_own')");
    expect(materialDetail).toContain('isWorkOrderExecutionMember(session, matReq.workOrder)');
    expect(materialDetail).toContain('matReq.requestedById === session.userId');
    expect(materialDetail).toContain('this material request is outside your work-order scope');
  });

  it('keeps detail visibility aligned with list visibility instead of plant access alone', () => {
    for (const source of [toolList, materialList]) {
      expect(source).toContain('canViewWorkOrderExecutionScope');
      expect(source).toContain('isWorkOrderExecutionMember(session, executionMembership)');
      expect(source).toContain('accessLevel: true');
      expect(source).toContain('where.requestedById = session.userId');
    }

    expect(toolDetail).toContain('assignedTo: true');
    expect(toolDetail).toContain('teamLeaderId: true');
    expect(toolDetail).toContain('accessLevel: true');
    expect(materialDetail).toContain('assignedTo: true');
    expect(materialDetail).toContain('teamLeaderId: true');
    expect(materialDetail).toContain('accessLevel: true');
  });
});
