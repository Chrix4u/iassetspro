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
  'src/components/modules/pm/PmEnterpriseForwardPlan.tsx',
  'src/components/modules/RepairsPagesLegacy.tsx',
  'src/components/modules/SettingsPages.tsx',
  'src/components/digital-twin/SystemDiagramPage.tsx',
  'src/app/api/v1/status/route.ts',
  'src/app/api/assets/ai-generate/route.ts',
  'src/app/api/reports/enterprise/route.ts',
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
  'Enterprise PM Workload & Capacity Outlook',
  'iAssetsPro Enterprise',
  'enterprise reports for the repairs module',
  'Failed to load enterprise report',
  'Failed to generate enterprise report',
  'enterprise resource planning system for data synchronization',
  'pre-built enterprise diagram template',
  'enterprise-report-${startDate}',
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

  it('uses plain, practical wording for PM workload, reports, diagrams and settings', () => {
    const replacements: Record<string, string[]> = {
      'src/components/modules/pm/PmEnterpriseForwardPlan.tsx': [
        'Upcoming Maintenance & Available Crew Time',
        'See which maintenance is due over 7, 30 or 90 days',
      ],
      'src/components/modules/RepairsPagesLegacy.tsx': [
        'Maintenance performance indicators and detailed repairs reports',
        'Failed to load maintenance report',
      ],
      'src/components/modules/SettingsPages.tsx': [
        'Connect to your ERP system to synchronize data',
      ],
      'src/components/digital-twin/SystemDiagramPage.tsx': [
        'Load a ready-made diagram template',
        'Choose a ready-made diagram template',
      ],
      'src/app/api/v1/status/route.ts': ["platform: 'iAssetsPro'"],
      'src/app/api/reports/enterprise/route.ts': [
        'Failed to generate maintenance report',
      ],
      'src/components/modules/EnterpriseReports.tsx': [
        'maintenance-report-${startDate}-to-${endDate}',
      ],
    };
    for (const [file, expected] of Object.entries(replacements)) {
      for (const fragment of expected) expect(read(file), file).toContain(fragment);
    }
  });

  it('does not show the old sales adjective in on-screen JSX copy or accessible labels', () => {
    const violations: string[] = [];
    for (const file of visibleSurfaces.filter((name) => name.endsWith('.tsx'))) {
      const source = read(file);
      // JSX body text is displayed. Component/function names and technical
      // page IDs are deliberately not inspected here: they are not UI copy.
      for (const match of source.matchAll(/>([^<>{}]*?)</g)) {
        if (/\benterprise\b/i.test(match[1])) {
          violations.push(`${file}: JSX text: ${match[1].trim().slice(0, 90)}`);
        }
      }
      for (const match of source.matchAll(/\b(?:aria-label|placeholder|title|alt)\s*=\s*["']([^"'\n]+)["']/g)) {
        if (/\benterprise\b/i.test(match[1])) {
          violations.push(`${file}: accessible label: ${match[1]}`);
        }
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
