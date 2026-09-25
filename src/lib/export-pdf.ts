export interface ExportPDFOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  summary?: { label: string; value: string }[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isNumericLike(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—') return false;
  const normalized = text
    .replace(/[,%]/g, '')
    .replace(/^(GHS|USD|EUR|GBP)\s*/i, '')
    .replace(/^[₵$€£]\s*/, '');
  return normalized !== '' && Number.isFinite(Number(normalized));
}

function inferNumericColumns(headers: string[], rows: string[][]): boolean[] {
  return headers.map((_, index) => {
    const values = rows.map((row) => row[index]).filter((value) => String(value ?? '').trim() !== '');
    return values.length > 0 && values.every(isNumericLike);
  });
}

export function exportPDF(options: ExportPDFOptions) {
  const {
    title,
    subtitle,
    headers,
    rows,
    filename = 'report',
    summary,
  } = options;

  // Narrow reports read better in portrait. Wide analytical tables switch to
  // landscape unless the caller explicitly selects an orientation.
  const orientation = options.orientation ?? (headers.length > 6 ? 'landscape' : 'portrait');
  const numericColumns = inferNumericColumns(headers, rows);

  const summaryHtml = summary && summary.length > 0 ? `
    <section class="summary-grid" aria-label="Report summary">
      ${summary.map(item => `
        <div class="summary-card">
          <span class="summary-label">${escapeHtml(item.label)}</span>
          <span class="summary-value">${escapeHtml(item.value)}</span>
        </div>
      `).join('')}
    </section>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 10px;
      color: #1f2937;
      line-height: 1.35;
      background: #fff;
    }
    .report-header {
      border-bottom: 2px solid #059669;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 3px;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      color: #111827;
    }
    .subtitle { font-size: 10px; color: #4b5563; margin-bottom: 3px; }
    .date { font-size: 8.5px; color: #9ca3af; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 7px;
      margin: 0 0 12px;
    }
    .summary-card {
      min-height: 48px;
      border: 1px solid #d1fae5;
      border-radius: 6px;
      background: #f0fdf4;
      padding: 8px 9px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .summary-label {
      display: block;
      color: #6b7280;
      font-size: 8px;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .summary-value {
      display: block;
      color: #065f46;
      font-size: 13px;
      line-height: 1.15;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .table-wrap { width: 100%; }
    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      font-size: 9px;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    thead th {
      background: #065f46;
      color: #fff;
      border: 1px solid #047857;
      padding: 5px 6px;
      text-align: left;
      vertical-align: middle;
      font-size: 8px;
      font-weight: 700;
      line-height: 1.2;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    tbody td {
      border: 1px solid #e5e7eb;
      padding: 5px 6px;
      vertical-align: top;
      color: #374151;
      line-height: 1.25;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    tbody tr:nth-child(even) { background: #f9fafb; }
    th.numeric, td.numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .empty {
      padding: 16px;
      border: 1px dashed #d1d5db;
      border-radius: 6px;
      color: #9ca3af;
      font-style: italic;
      text-align: center;
    }
    .footer {
      margin-top: 12px;
      border-top: 1px solid #e5e7eb;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 7.5px;
      color: #9ca3af;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .footer-brand { font-weight: 600; color: #6b7280; }
    @media print {
      .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="date">Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
  </header>
  ${summaryHtml}
  ${rows.length > 0 ? `
  <div class="table-wrap">
    <table>
      <thead>
        <tr>${headers.map((header, index) => `<th class="${numericColumns[index] ? 'numeric' : ''}">${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${headers.map((_, index) => `<td class="${numericColumns[index] ? 'numeric' : ''}">${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : '<div class="empty">No data available for the selected filters.</div>'}
  <footer class="footer">
    <span class="footer-brand">iAssetsPro EAM — Asset Management</span>
    <span>${escapeHtml(filename)}</span>
  </footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
  } else {
    URL.revokeObjectURL(url);
  }
}
