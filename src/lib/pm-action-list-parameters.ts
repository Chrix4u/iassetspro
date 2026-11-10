/** Parameters on Action Lists are tied to actual machine parts, not UI-only columns. */
export type ActionListParameterMethod = 'measurement' | 'visual';
export type ActionListParameter = {
  key: string; name: string; method: ActionListParameterMethod;
  unit: string; min: number | null; max: number | null; acceptance: string;
};
export const ACTION_LIST_PARAMETER_PRESETS = [
  { key: 'temperature', name: 'Temperature', method: 'measurement', unit: '°C' },
  { key: 'vibration', name: 'Vibration', method: 'measurement', unit: 'mm/s' },
  { key: 'sound', name: 'Sound', method: 'measurement', unit: 'dB(A)' },
  { key: 'corrosion', name: 'Corrosion', method: 'visual', unit: '' },
] as const;

/** Parsing is deliberately strict: never treat empty or malformed limits as zero. */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Enter a valid numeric limit');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Enter a finite numeric limit');
  return parsed;
}

export function parseActionListParameters(input: unknown): ActionListParameter[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) {
    throw new Error('Select between 1 and 12 inspection parameters');
  }
  const seen = new Set<string>();
  return input.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid inspection parameter');
    const item = raw as Record<string, unknown>;
    const key = typeof item.key === 'string' ? item.key.trim().toLowerCase() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const method = item.method;
    const unit = typeof item.unit === 'string' ? item.unit.trim() : '';
    const acceptance = typeof item.acceptance === 'string' ? item.acceptance.trim() : '';
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(key) || !name || name.length > 120) {
      throw new Error('Give each parameter a name and a unique key (letters, digits or underscores)');
    }
    if (seen.has(key)) throw new Error('Each parameter may appear only once per bulk assignment');
    seen.add(key);
    if (method !== 'visual' && method !== 'measurement') throw new Error('Choose Visual or Instrument inspection');
    const min = optionalNumber(item.min);
    const max = optionalNumber(item.max);
    if (method === 'measurement') {
      if (!unit || unit.length > 32) throw new Error(name + ': instrument readings need a unit');
      if (min === null && max === null) throw new Error(name + ': supply at least one approved min/max limit');
      if (min !== null && max !== null && min > max) throw new Error(name + ': minimum must not exceed maximum');
    } else {
      if (!acceptance || acceptance.length > 500) throw new Error(name + ': describe the acceptable visual condition');
      if (min !== null || max !== null || unit) throw new Error(name + ': visual checks use acceptance criteria, not numeric limits');
    }
    return { key, name, method, unit, min, max, acceptance };
  });
}

export function actionListAcceptance(normalRange: string | null): string | null {
  if (!normalRange) return null;
  try {
    const data = JSON.parse(normalRange) as Record<string, unknown>;
    return typeof data.acceptance === 'string' && data.acceptance.trim()
      ? data.acceptance.trim() : null;
  } catch { return null; }
}

export function actionListLimitJson(parameter: ActionListParameter) {
  return JSON.stringify(parameter.method === 'visual'
    ? { acceptance: parameter.acceptance }
    : { min: parameter.min, max: parameter.max, unit: parameter.unit });
}

export function actionListExistingKey(point: {
  parameterKey: string | null; name: string;
}): string {
  return (point.parameterKey || point.name).trim().toLowerCase();
}
