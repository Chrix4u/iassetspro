import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const barrel = fs.readFileSync('src/components/digital-twin/index.ts', 'utf8');
const files = [
  ['ModelManagerPanel', 'ModelManagerPanelProps'],
  ['ComponentMappingEditor', 'ComponentMappingEditorProps'],
  ['CameraTourPlayer', 'CameraTourPlayerProps'],
] as const;

describe('Digital Twin barrel prop exports', () => {
  it.each(files)('%s exports the Props type advertised by the barrel', (component, propsType) => {
    const source = fs.readFileSync(`src/components/digital-twin/${component}.tsx`, 'utf8');
    expect(barrel).toContain(`type ${propsType}`);
    expect(source).toContain(`export interface ${propsType} {`);
  });
});
