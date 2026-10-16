import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enterpriseReports = readFileSync('src/components/modules/EnterpriseReports.tsx', 'utf8');
const repairsPages = readFileSync('src/components/modules/RepairsPagesLegacy.tsx', 'utf8');
const repairAnalytics = repairsPages.slice(repairsPages.indexOf('export function RepairAnalyticsPage()'));

describe('enterprise reporting Functional Location UI', () => {
  it('applies one hierarchy scope to the main Reporting page and can clear it', () => {
    expect(enterpriseReports).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker';");
    expect(enterpriseReports).toContain("const [functionalLocationId, setFunctionalLocationId] = useState('');");
    expect(enterpriseReports).toContain("params.set('functionalLocationId', functionalLocationId)");
    expect(enterpriseReports).toContain("enterpriseParams.set('functionalLocationId', functionalLocationId)");
    expect(enterpriseReports).toContain('[startDate, endDate, functionalLocationId]');
    expect(enterpriseReports).toContain('allowAssetAssignmentOnly={false}');
    expect(enterpriseReports).toContain("setFunctionalLocationId('')");
    expect(enterpriseReports).toContain('(asset as any).functionalLocationPathCode');
  });

  it('lets Repairs Analytics scope backlog and repeat-failure reports independently', () => {
    expect(repairAnalytics).toContain("const [enterpriseFunctionalLocationId, setEnterpriseFunctionalLocationId] = useState('');");
    expect(repairAnalytics).toContain("const [repeatFunctionalLocationId, setRepeatFunctionalLocationId] = useState('');");
    expect(repairAnalytics).toContain("params.set('functionalLocationId', enterpriseFunctionalLocationId)");
    expect(repairAnalytics).toContain("params.set('functionalLocationId', repeatFunctionalLocationId)");
    expect(repairAnalytics).toContain('allowAssetAssignmentOnly={false}');
    expect(repairAnalytics).toContain("setEnterpriseFunctionalLocationId('')");
    expect(repairAnalytics).toContain("setRepeatFunctionalLocationId('')");
    expect(repairAnalytics).toContain('a.functionalLocationPathCode');
  });
});
