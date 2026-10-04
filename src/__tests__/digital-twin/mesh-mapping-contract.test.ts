import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync('src/services/componentMapping.service.ts', 'utf8');
const route = fs.readFileSync('src/app/api/mesh-mappings/route.ts', 'utf8');
const editor = fs.readFileSync('src/components/digital-twin/ComponentMappingEditor.tsx', 'utf8');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

describe('mesh mapping contract', () => {
  it('uses the Prisma MeshComponentMapping field names end to end', () => {
    for (const field of ['meshName', 'meshPath', 'mappingType', 'targetId']) {
      expect(schema).toContain(field);
      expect(service).toContain(field);
      expect(editor).toContain(field);
    }

    expect(service).not.toContain('meshId: string');
    expect(service).not.toContain('componentId?: string');
    expect(service).not.toContain('component: { select:');
  });

  it('sends the model id when a user creates a mapping from the editor', () => {
    expect(editor).toContain("await api.post('/api/mesh-mappings', {");
    expect(editor).toContain('modelId,');
    expect(editor).toContain("meshPath: addForm.meshPath.trim() || addForm.meshName");
  });

  it('supports the editor search and type-count UI from the API service', () => {
    expect(route).toContain("const search = searchParams.get('search') || undefined");
    expect(route).toContain('search,');
    expect(service).toContain('typeCounts');
    expect(service).toContain("groupBy({");
    expect(service).toContain("{ meshName: { contains: q, mode: 'insensitive' } }");
  });
});
