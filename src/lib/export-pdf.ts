export interface ExportPDFOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  summary?: { label: string; value: string }[];
}

export function exportPDF(options: ExportPDFOptions) {
  const {
    title,
    subtitle,
    headers,
    rows,
    filename = 'report',
    orientation = 'landscape',
    summary,
  } = options;

  const summaryHtml = summary && summary.length > 0 ? `
    <div class="summary">
      ${summary.map(item => `
        <div class="summary-item">
          <span class="summary-label">${item.label}</span>
          <span class="summary-value">${item.value}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: ${orientation}; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #333; line-height: 1.5; }
    h1 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .date { font-size: 10px; color: #9ca3af; margin-bottom: 16px; }
    .summary {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 11px;
    }
    .summary-label { color: #374151; }
    .summary-value { font-weight: 700; color: #059669; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #059669;
      color: #ffffff;
      padding: 8px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    tbody td {
      padding: 7px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 10px;
      color: #374151;
    }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:hover { background: #f0fdf4; }
    .footer {
      margin-top: 24px;
      font-size: 9px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
    }
    .footer-brand { font-weight: 600; color: #6b7280; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
  <div class="date">Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
  ${summaryHtml}
  ${rows.length > 0 ? `
  <table>
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  ` : '<p style="color:#9ca3af; font-style:italic;">No data available for the selected filters.</p>'}
  <div class="footer">
    <span class="footer-brand">iAssetsPro EAM — Asset Management</span>
    <span>Generated automatically</span>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
      // Clean up after a short delay to ensure print dialog has loaded
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
  }
}
