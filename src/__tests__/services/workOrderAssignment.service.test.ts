import { describe, expect, it } from 'vitest';
import { buildDirectAssignmentPlan } from '@/services/workOrderAssignment.service';

describe('buildDirectAssignmentPlan', () => {
  it('treats assignedTo alone as the single technician and team leader', () => {
    expect(buildDirectAssignmentPlan('tech-a')).toEqual({
      ok: true,
      plan: {
        executionMemberIds: ['tech-a'],
        effectiveAssignedTo: 'tech-a',
        effectiveTeamLeaderId: 'tech-a',
        members: [
          { userId: 'tech-a', role: 'team_leader', isLeader: true },
        ],
      },
    });
  });

  it('treats one teamMembers entry without assignedTo as the single technician', () => {
    expect(buildDirectAssignmentPlan(undefined, undefined, [
      { userId: 'tech-b', role: 'assistant' },
    ])).toEqual({
      ok: true,
      plan: {
        executionMemberIds: ['tech-b'],
        effectiveAssignedTo: 'tech-b',
        effectiveTeamLeaderId: 'tech-b',
        members: [
          { userId: 'tech-b', role: 'team_leader', isLeader: true },
        ],
      },
    });
  });

  it('requires an explicit leader when assignedTo plus one helper creates a two-tech team', () => {
    expect(buildDirectAssignmentPlan('tech-a', undefined, [
      { userId: 'tech-b', role: 'assistant' },
    ])).toEqual({
      ok: false,
      error: 'teamLeaderId is required when more than one technician is assigned',
    });
  });

  it('allows assignedTo to be the leader even when helpers are supplied separately', () => {
    expect(buildDirectAssignmentPlan('tech-a', 'tech-a', [
      { userId: 'tech-b', role: 'assistant' },
    ])).toEqual({
      ok: true,
      plan: {
        executionMemberIds: ['tech-a', 'tech-b'],
        effectiveAssignedTo: 'tech-a',
        effectiveTeamLeaderId: 'tech-a',
        members: [
          { userId: 'tech-a', role: 'team_leader', isLeader: true },
          { userId: 'tech-b', role: 'assistant', isLeader: false },
        ],
      },
    });
  });

  it('rejects a leader who is outside the authoritative execution roster', () => {
    expect(buildDirectAssignmentPlan('tech-a', 'tech-x', [
      { userId: 'tech-b' },
    ])).toEqual({
      ok: false,
      error: 'teamLeaderId must be one of the assigned execution members',
    });
  });

  it('deduplicates the same user across assignedTo and teamMembers', () => {
    expect(buildDirectAssignmentPlan('tech-a', undefined, [
      { userId: 'tech-a', role: 'assistant' },
    ])).toEqual({
      ok: true,
      plan: {
        executionMemberIds: ['tech-a'],
        effectiveAssignedTo: 'tech-a',
        effectiveTeamLeaderId: 'tech-a',
        members: [
          { userId: 'tech-a', role: 'team_leader', isLeader: true },
        ],
      },
    });
  });

  it('normalizes any non-selected team_leader role back to assistant', () => {
    expect(buildDirectAssignmentPlan(undefined, 'tech-a', [
      { userId: 'tech-a', role: 'assistant' },
      { userId: 'tech-b', role: 'team_leader' },
    ])).toEqual({
      ok: true,
      plan: {
        executionMemberIds: ['tech-a', 'tech-b'],
        effectiveAssignedTo: 'tech-a',
        effectiveTeamLeaderId: 'tech-a',
        members: [
          { userId: 'tech-a', role: 'team_leader', isLeader: true },
          { userId: 'tech-b', role: 'assistant', isLeader: false },
        ],
      },
    });
  });

  it('rejects blank team member identifiers', () => {
    expect(buildDirectAssignmentPlan(undefined, undefined, [
      { userId: '   ' },
    ])).toEqual({
      ok: false,
      error: 'Each team member must have a userId',
    });
  });
});
