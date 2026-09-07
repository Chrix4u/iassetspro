import { describe, expect, it } from 'vitest';
import {
  mergeStartReadiness,
  type Capabilities,
  type StartReadiness,
} from '@/components/repairs/execution/hooks/useCapabilities';

const BASE_CAPABILITIES: Capabilities = {
  canStart: true,
  canPause: false,
  canResume: false,
  canLogOwnTime: true,
  canLogTeamTime: false,
  canRequestTools: true,
  canRequestMaterials: true,
  canRequestAssistance: true,
  canHandover: true,
  canSubmitCompletion: false,
  canVerify: false,
  canClose: false,
  isTeamLeader: false,
  isTeamMember: true,
  isSupervisor: false,
  isPlanner: false,
  isAdmin: false,
};

function readiness(overrides: Partial<StartReadiness> = {}): StartReadiness {
  return {
    ready: true,
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

describe('mergeStartReadiness', () => {
  it('keeps Start enabled when server readiness is ready', () => {
    const result = mergeStartReadiness(BASE_CAPABILITIES, readiness());

    expect(result.canStart).toBe(true);
    expect(result).toBe(BASE_CAPABILITIES);
  });

  it('keeps Start enabled for warnings because warnings are non-blocking', () => {
    const result = mergeStartReadiness(
      BASE_CAPABILITIES,
      readiness({
        warnings: [
          {
            code: 'REQUIRED_PERMIT_CHECK',
            category: 'safety',
            message: 'Confirm the required permit before work begins',
            severity: 'warning',
          },
        ],
      }),
    );

    expect(result.canStart).toBe(true);
  });

  it('disables Start when the authoritative readiness result contains blockers', () => {
    const result = mergeStartReadiness(
      BASE_CAPABILITIES,
      readiness({
        ready: false,
        blockers: [
          {
            code: 'MANDATORY_HANDOVER_PENDING',
            category: 'team',
            message: 'Mandatory shift handover is still pending',
            severity: 'blocker',
          },
        ],
      }),
    );

    expect(result.canStart).toBe(false);
    expect(result.canPause).toBe(false);
    expect(result.canRequestMaterials).toBe(true);
  });

  it('never creates Start permission when the capability endpoint already denied it', () => {
    const denied = { ...BASE_CAPABILITIES, canStart: false };
    const result = mergeStartReadiness(denied, readiness());

    expect(result.canStart).toBe(false);
    expect(result).toBe(denied);
  });

  it('fails closed when the start-readiness result is unavailable', () => {
    const result = mergeStartReadiness(BASE_CAPABILITIES, null);

    expect(result.canStart).toBe(false);
    expect(result.canRequestMaterials).toBe(true);
  });
});
