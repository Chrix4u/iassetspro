import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const visibleSurfaces = [
  'public/manifest.webmanifest',
  'src/app/layout.tsx',
  'src/components/LoginPage.tsx',
  'src/components/EAMApp.tsx',
  'src/components/shared/Sidebar.tsx',
  'src/components/modules/EnterpriseReports.tsx',
  'src/components/digital-twin/SystemDiagramPage.tsx',
  'src/app/api/reports/maintenance/export/route.ts',
  'src/lib/export-pdf.ts',
  'src/services/reportExportXlsx.service.ts',
];

const forbiddenVisiblePhrases = [
  'Enterprise Asset Management',
  'Enterprise Reports',
  'Enterprise Reporting',
  'Enterprise Report -',
  'Enterprise EAM',
  'Enterprise-grade process and instrumentation diagrams',
  'Enterprise maintenance performance and work-order detail',
];

describe('user-facing branding', () => {
  it('removes Enterprise from user-visible labels and presentation text while allowing technical identifiers/comments', () => {
    const violations: string[] = [];
    for (const file of visibleSurfaces) {
      const source = read(file);
      for (const phrase of forbiddenVisiblePhrases) {
        if (source.includes(phrase)) violations.push(`${file}: ${phrase}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps technical report identifiers intact', () => {
    expect(read('src/components/modules/EnterpriseReports.tsx')).toContain('function EnterpriseReports');
    expect(read('src/components/EAMApp.tsx')).toContain("'enterprise-reports'");
    expect(read('src/app/api/reports/enterprise/route.ts')).toContain('/api/reports/enterprise');
  });
});
