import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const machineAvailability = readFileSync('src/components/modules/MachineAvailabilityPage.tsx', 'utf8');
const reportPages = readFileSync('src/components/modules/ReportPages.tsx', 'utf8');
const repairsPages = readFileSync('src/components/modules/RepairsPagesLegacy.tsx', 'utf8');
const failureAnalysis = reportPages.slice(reportPages.indexOf('export function FailureAnalysisPage()'));

describe('operational report Functional Location UI', () => {
  it('filters Machine Availability by any hierarchy node and can clear the selection', () => {
    expect(machineAvailability).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker';");
    expect(machineAvailability).toContain("const [functionalLocationId, setFunctionalLocationId] = useState('');");
    expect(machineAvailability).toContain("params.set('functionalLocationId', functionalLocationId)");
    expect(machineAvailability).toContain('allowAssetAssignmentOnly={false}');
    expect(machineAvailability).toContain("setFunctionalLocationId('')");
    expect(machineAvailability).toContain('m.functionalLocationPathCode');
  });

  it('filters Failure Analysis by any hierarchy node and can clear the selection', () => {
    expect(reportPages).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker';");
    expect(failureAnalysis).toContain("const [functionalLocationId, setFunctionalLocationId] = useState('');");
    expect(failureAnalysis).toContain("params.set('functionalLocationId', functionalLocationId)");
    expect(failureAnalysis).toContain('allowAssetAssignmentOnly={false}');
    expect(failureAnalysis).toContain("setFunctionalLocationId('')");
    expect(failureAnalysis).toContain('[startDate, endDate, functionalLocationId]');
    expect(failureAnalysis).toContain('d.functionalLocationPathCode');
  });

  it('filters Downtime Deep Dive by any hierarchy node and can clear the selection', () => {
    expect(repairsPages).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker';");
    expect(repairsPages).toContain("const [downtimeFunctionalLocationId, setDowntimeFunctionalLocationId] = useState('');");
    expect(repairsPages).toContain("params.set('functionalLocationId', downtimeFunctionalLocationId)");
    expect(repairsPages).toContain('allowAssetAssignmentOnly={false}');
    expect(repairsPages).toContain("setDowntimeFunctionalLocationId('')");
    expect(repairsPages).toContain('a.functionalLocationPathCode');
  });
});
