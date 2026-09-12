import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync('src/components/EAMApp.tsx', 'utf8');
const css = fs.readFileSync('src/app/page-layout.css', 'utf8');

describe('page spacing source audit', () => {
  it('routes module pages through one scroll container governed by the shared gutter contract', () => {
    const loaderEntries = [...app.matchAll(/^\s*'[^']+':\s*\(\)\s*=>\s*import\(/gm)];
    expect(loaderEntries.length).toBeGreaterThan(50);
    expect(app).toContain('<PageSwitcher page={currentPage} />');
    expect(app).toContain('<main className="flex-1 min-h-0 overflow-y-auto pb-16 lg:pb-0">');
    expect(css).toContain('main.flex-1.min-h-0.overflow-y-auto > *');
  });
});
