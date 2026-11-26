/** Match the report display: an unreported shift is not a measured zero. */
export function reportedProductionValue(approved: boolean, value: number): number | null {
  return approved ? value : null;
}

/** Quote every cell and neutralize formula-like user-controlled text in spreadsheets. */
export function productionCsvCell(value: unknown): string {
  const text = String(value ?? '');
  // Preserve actual finite numeric values, including negative numbers. A string
  // starting with whitespace, a control character, or a formula marker is not
  // trusted as numeric data; spreadsheet programs may trim leading whitespace.
  const safe = typeof value === 'number' && Number.isFinite(value)
    ? text
    : (/^[\t\r\n]/u.test(text) || /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(text))
      ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
