export type PmInspectionMethod = 'instrument' | 'sight';
export type PmInspectionResult = 'pass' | 'fail' | 'conditional' | 'needs_attention';
export type PmInspectionRange = { min?: number; max?: number; unit?: string };

export function pmInspectionMethod(type: string | null | undefined): PmInspectionMethod {
  return ['measurement', 'dimensional', 'ndt'].includes(String(type || '').toLowerCase())
    ? 'instrument'
    : 'sight';
}

export function parsePmInspectionRange(raw: string | null | undefined): PmInspectionRange {
  if (!raw) return {};
  try {
    const source = JSON.parse(raw) as Record<string, unknown>;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const min = source.min === null || source.min === '' ? undefined : Number(source.min);
    const max = source.max === null || source.max === '' ? undefined : Number(source.max);
    return {
      ...(Number.isFinite(min) ? { min } : {}),
      ...(Number.isFinite(max) ? { max } : {}),
      ...(typeof source.unit === 'string' && source.unit.trim() ? { unit: source.unit.trim() } : {}),
    };
  } catch {
    return {};
  }
}

export function assessPmInspection(input: {
  method: PmInspectionMethod;
  result: unknown;
  value?: unknown;
  findings?: unknown;
  range?: PmInspectionRange;
}): { ok: true; result: PmInspectionResult; value: string | null; findings: string; needsCorrectiveWork: boolean; outsideRange: boolean }
   | { ok: false; error: string } {
  const result = String(input.result ?? '').trim() as PmInspectionResult;
  if (!['pass', 'fail', 'conditional', 'needs_attention'].includes(result)) {
    return { ok: false, error: 'Choose Pass, Fail, Conditional, or Needs attention' };
  }
  const findings = typeof input.findings === 'string' ? input.findings.trim() : '';
  if (findings.length > 4000) return { ok: false, error: 'Findings must be 4,000 characters or less' };
  let value: string | null = null;
  let outsideRange = false;
  if (input.method === 'instrument') {
    if (input.value === undefined || input.value === null || String(input.value).trim() === '') {
      return { ok: false, error: 'An instrument inspection requires a parameter reading' };
    }
    const reading = Number(input.value);
    if (!Number.isFinite(reading)) return { ok: false, error: 'Enter a valid numeric instrument reading' };
    value = String(reading);
    const range = input.range || {};
    outsideRange = (range.min !== undefined && reading < range.min) || (range.max !== undefined && reading > range.max);
  } else if (input.value !== undefined && input.value !== null && String(input.value).trim() !== '') {
    return { ok: false, error: 'Sight inspection findings must be descriptive, not an instrument reading' };
  }

  // A measured out-of-range value cannot be marked Pass by the client.
  const resolved: PmInspectionResult = outsideRange ? 'fail' : result;
  const needsCorrectiveWork = resolved === 'fail' || resolved === 'needs_attention';
  if ((needsCorrectiveWork || resolved === 'conditional') && !findings) {
    return { ok: false, error: 'Describe the abnormal observation before saving' };
  }
  return { ok: true, result: resolved, value, findings, needsCorrectiveWork, outsideRange };
}
