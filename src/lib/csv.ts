const SPREADSHEET_FORMULA_PREFIX = /^\s*[=+\-@]/;

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (SPREADSHEET_FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
