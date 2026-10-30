export type PmBundleDateLike = string | Date | null | undefined;

export function toPmDateInputValue(value: PmBundleDateLike): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultPmBundleMaintenanceDate(input: {
  candidate: PmBundleDateLike;
  windowStart: PmBundleDateLike;
  windowEnd: PmBundleDateLike;
}): string {
  const min = toPmDateInputValue(input.windowStart);
  const max = toPmDateInputValue(input.windowEnd);
  const candidate = toPmDateInputValue(input.candidate) || min;

  if (!candidate) return '';
  if (min && candidate < min) return min;
  if (max && candidate > max) return max;
  return candidate;
}
