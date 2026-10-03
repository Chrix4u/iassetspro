import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('machine visual explorer default presentation', () => {
  it('opens on the hierarchy diagram instead of an empty realistic-image state', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/digital-twin/MachineVisualExplorer.tsx'),
      'utf8',
    );

    expect(source).toContain("const [mode, setMode] = useState('diagram')");
    expect(source).toContain('<TabsTrigger value="realistic"');
    expect(source).toContain('<TabsTrigger value="diagram"');
    expect(source).toContain('ProgrammaticEngineeringView');
  });
});
