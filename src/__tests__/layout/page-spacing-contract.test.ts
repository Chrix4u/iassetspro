import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('application page spacing contract', () => {
  it('loads the shared page-layout stylesheet from the root layout', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('import "./globals.css";');
    expect(layout).toContain('import "./page-layout.css";');
    expect(layout.indexOf('import "./page-layout.css";')).toBeGreaterThan(
      layout.indexOf('import "./globals.css";'),
    );
  });

  it('gives every authenticated page a consistent responsive horizontal gutter', () => {
    const css = read('src/app/page-layout.css');
    expect(css).toContain('main.flex-1.min-h-0.overflow-y-auto');
    expect(css).toContain('--iassets-page-gutter: 1rem;');
    expect(css).toContain('@media (min-width: 640px)');
    expect(css).toContain('--iassets-page-gutter: 1.5rem;');
    expect(css).toContain('padding-left: var(--iassets-page-gutter);');
    expect(css).toContain('padding-right: var(--iassets-page-gutter);');
  });

  it('neutralizes only page-root horizontal padding so vertical rhythm and nested component padding survive', () => {
    const css = read('src/app/page-layout.css');
    expect(css).toContain('main.flex-1.min-h-0.overflow-y-auto > *');
    expect(css).toContain('padding-left: 0 !important;');
    expect(css).toContain('padding-right: 0 !important;');
    expect(css).not.toContain('padding-top: 0 !important;');
    expect(css).not.toContain('padding-bottom: 0 !important;');
  });

  it('keeps the app shell selector aligned with the actual scroll container', () => {
    const app = read('src/components/EAMApp.tsx');
    expect(app).toContain('<main className="flex-1 min-h-0 overflow-y-auto pb-16 lg:pb-0">');
  });

  it('keeps the work-order sticky header aligned with the shared phone and desktop gutters', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    expect(page).toContain('sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6');
  });
});
