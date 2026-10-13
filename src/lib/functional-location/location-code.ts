export type LocationCodeMode = 'manual' | 'generated' | 'mixed';

export interface LocationCodeInput {
  mode: LocationCodeMode;
  separator: string;
  parentCode?: string | null;
  prefix?: string | null;
  segment?: string | null;
  manualCode?: string | null;
  allowOverride: boolean;
}

const FULL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/:_-]*$/;
const SEGMENT_PATTERN = /^[A-Z0-9_-]+$/;

function normalized(value: string, label: string): string {
  const result = value.trim().toUpperCase();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

export function normalizeLocationCode(value: string): string {
  const result = normalized(value, 'Location code');
  if (!FULL_CODE_PATTERN.test(result)) {
    throw new Error('Location code contains an invalid character or format');
  }
  return result;
}

export function normalizeCodeSegment(value: string): string {
  const result = normalized(value, 'Location code segment');
  if (!SEGMENT_PATTERN.test(result)) {
    throw new Error('Location code segment contains an invalid character or format');
  }
  return result;
}

export function validateCodeSeparator(value: string): string {
  if (value.length !== 1 || /[A-Za-z0-9\s]/.test(value)) {
    throw new Error('Location code separator must be one non-alphanumeric, non-whitespace character');
  }
  return value;
}

function generatedCode(input: LocationCodeInput): string {
  const separator = validateCodeSeparator(input.separator);
  if (!input.segment?.trim()) throw new Error('Location code segment is required');

  const segment = normalizeCodeSegment(input.segment);
  const prefix = input.prefix?.trim() ? normalizeCodeSegment(input.prefix) : '';
  const localCode = `${prefix}${segment}`;

  if (!input.parentCode?.trim()) return normalizeLocationCode(localCode);
  const parentCode = normalizeLocationCode(input.parentCode);
  return normalizeLocationCode(`${parentCode}${separator}${localCode}`);
}

export function buildLocationCode(input: LocationCodeInput): string {
  if (!['manual', 'generated', 'mixed'].includes(input.mode)) {
    throw new Error('Unsupported Location Code mode');
  }

  validateCodeSeparator(input.separator);

  if (input.mode === 'manual') {
    if (!input.manualCode?.trim()) throw new Error('Manual location code is required');
    return normalizeLocationCode(input.manualCode);
  }

  if (input.mode === 'mixed' && input.allowOverride && input.manualCode?.trim()) {
    return normalizeLocationCode(input.manualCode);
  }

  return generatedCode(input);
}
