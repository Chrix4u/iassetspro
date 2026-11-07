import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const portfolioPanel = source('src/components/modules/pm/PmPortfolioCompliancePanel.tsx');
const portfolioRoute = source('src/app/api/pm-assignments/compliance/portfolio/route.ts');
const assignmentList = source('src/components/modules/pm/PmAssignmentTargetList.tsx');

describe('PM portfolio plant context and compact actions', () => {
  it('scopes both department and portfolio reads to the report plant, not a stale global header', () => {
    expect(portfolioPanel).toContain("window.localStorage.getItem('user_plant_id')");
    expect(portfolioPanel.match(/headers: \{ 'x-plant-id': plantId \}/g)).toHaveLength(2);
    expect(portfolioPanel).toContain('/api/pm-assignments/compliance/portfolio?');
    expect(portfolioPanel).toContain('/api/departments?plantId=');
  });

  it('preserves strict server authorization of the selected plant', () => {
    expect(portfolioRoute).toContain('scope.denyAccess');
    expect(portfolioRoute).toContain('canAccessPlantStrict(scope, plant.id)');
    expect(portfolioRoute).toContain("status: 403");
  });

  it('shows one accessible action menu per target, respecting edit/delete capabilities', () => {
    expect(assignmentList).toContain('<DropdownMenuTrigger asChild>');
    expect(assignmentList).toContain('aria-label={`Actions for ${group.targetName}`}');
    expect(assignmentList).toContain('<DropdownMenuContent align="end"');
    expect(assignmentList).toContain('onSelect={() => onView(group)}');
    expect(assignmentList).toContain('canEdit && <DropdownMenuItem onSelect={() => onConfigureTriggers(group)}>');
    expect(assignmentList).toContain('canEdit && <DropdownMenuItem onSelect={() => onEdit(group)}>');
    expect(assignmentList).toContain('canDelete && <DropdownMenuItem variant="destructive" onSelect={() => onDelete(group)}>');
    expect(assignmentList).not.toContain('flex flex-wrap justify-end gap-1');
  });

  it('restricts frequency types to the two engineer-approved options', () => {
    const frequencyFilter = assignmentList.match(/<FilterSelect label="Frequency Type"[\\s\\S]*?<\\/FilterSelect>/)?.[0] || '';
    expect(frequencyFilter).toContain('<SelectItem value="time_day">Time / Day</SelectItem>');
    expect(frequencyFilter).toContain('<SelectItem value="meter">Meter Based</SelectItem>');
    expect(frequencyFilter).not.toContain('<SelectItem value="event">');
  });
});
