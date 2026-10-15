import PDFDocument from 'pdfkit';

// ============================================================================
// Types
// ============================================================================

interface WOPrintData {
  workOrder: {
    id: string;
    woNumber: string;
    title: string;
    description: string | null;
    type: string;
    priority: string;
    status: string;
    maintenanceRequestId: string | null;
    assetName: string | null;
    estimatedHours: number | null;
    actualHours: number | null;
    plannedStart: Date | string | null;
    plannedEnd: Date | string | null;
    actualStart: Date | string | null;
    actualEnd: Date | string | null;
    totalCost: number;
    laborCost: number;
    partsCost: number;
    contractorCost: number;
    failureDescription: string | null;
    causeDescription: string | null;
    actionDescription: string | null;
    tradeActivity: string | null;
    safetyNotes: string | null;
    ppeRequired: string | null;
    assignedTo: string | null;
    teamLeaderId: string | null;
    assignedSupervisorId: string | null;
    plannerId: string | null;
    assignedBy: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    notes: string | null;
  };
  assignee: { fullName: string; department: string | null } | null;
  teamLeader: { fullName: string } | null;
  supervisor: { fullName: string } | null;
  planner: { fullName: string } | null;
  assigner: { fullName: string } | null;
  asset: Record<string, unknown> | null;
  maintenanceLocation: { path: string; locationCode: string | null } | null;
  materials: Array<Record<string, unknown>>;
  timeLogs: Array<Record<string, unknown>>;
  downtimes: Array<Record<string, unknown>>;
  repairCompletion: Record<string, unknown> | null;
  statusHistory: Array<Record<string, unknown>>;
  teamMembers: Array<{ role: string; user: { fullName: string; department: string | null } }>;
  failureRecords: Array<Record<string, unknown>>;
  taskExecutions: Array<Record<string, unknown>>;
  sourceRequest: Record<string, unknown> | null;
  pmSchedule: { title: string; frequencyType: string; frequencyValue: number } | null;
  companyInfo: {
    name: string;
    legalName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    currency: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_WIDTH = 841.89; // A4 Landscape
const PAGE_HEIGHT = 595.28;
const MARGIN = 30;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const COL_GAP = 16;
const COL_WIDTH = (CONTENT_WIDTH - COL_GAP) / 2;
const FOOTER_RESERVE = 30;

const COLORS = {
  navy: '#1e293b',
  emerald: '#059669',
  emeraldLight: '#ecfdf5',
  white: '#ffffff',
  offWhite: '#f8fafc',
  lightGray: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  accentGreen: '#059669',
  accentRed: '#dc2626',
  accentOrange: '#ea580c',
  accentAmber: '#d97706',
  accentYellow: '#ca8a04',
  accentBlue: '#2563eb',
  accentSlate: '#64748b',
} as const;

const FONT_SIZES = {
  companyTitle: 10,
  pageTitle: 18,
  woNumber: 14,
  badge: 8,
  badgeLabel: 7,
  sectionTitle: 10,
  sectionTitleBold: 10,
  kvLabel: 8,
  kvValue: 8,
  tableHeader: 7.5,
  tableBody: 7.5,
  bodyText: 8,
  footer: 7,
  signatureLabel: 8,
  signatureLine: 8,
  costLabel: 8,
  costValue: 8,
  costTotalLabel: 9,
  costTotalValue: 9,
} as const;

type PDFDoc = PDFKit.PDFDocument;
type PDFOptions = PDFKit.PDFDocumentOptions;

// ============================================================================
// Helpers
// ============================================================================

function safeStr(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtCurrency(val: number | null | undefined, currency: string = 'USD'): string {
  if (val == null || Number.isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function fmtNum(val: number | null | undefined, decimals: number = 0): string {
  if (val == null || Number.isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
}

function fmtMinutes(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function createDoc(options?: PDFOptions): PDFDoc {
  return new (PDFDocument as unknown as new (opts?: PDFOptions) => PDFDoc)(options);
}

function ensureSpace(doc: PDFDoc, needed: number): void {
  const maxY = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE;
  if (doc.y + needed > maxY) {
    doc.addPage();
  }
}

// ============================================================================
// Color helpers for badges
// ============================================================================

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    completed: COLORS.accentGreen,
    verified: COLORS.accentGreen,
    closed: COLORS.accentSlate,
    in_progress: COLORS.accentBlue,
    waiting_parts: COLORS.accentOrange,
    on_hold: COLORS.accentAmber,
    assigned: '#7c3aed',
    planned: COLORS.accentBlue,
    approved: '#7c3aed',
    requested: COLORS.accentAmber,
    draft: COLORS.accentSlate,
    cancelled: COLORS.accentRed,
  };
  return map[status] || COLORS.accentSlate;
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    critical: COLORS.accentRed,
    high: COLORS.accentOrange,
    medium: COLORS.accentAmber,
    low: COLORS.accentGreen,
  };
  return map[priority] || COLORS.accentSlate;
}

function formatBadgeText(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// Draw helpers
// ============================================================================

function drawSectionHeader(doc: PDFDoc, title: string, y?: number): number {
  const curY = y ?? doc.y;
  ensureSpace(doc, 20);
  const actualY = y ?? doc.y;

  doc.save();
  // Emerald accent bar
  doc.rect(MARGIN, actualY, 3, 12).fill(COLORS.emerald);
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.sectionTitleBold).fillColor(COLORS.text);
  doc.text(title.toUpperCase(), MARGIN + 8, actualY + 1, { lineBreak: false });
  doc.restore();

  doc.y = actualY + 16;
  return doc.y;
}

function drawBadge(doc: PDFDoc, x: number, y: number, label: string, value: string, color: string): void {
  doc.save();
  const valueWidth = doc.font('Helvetica-Bold').fontSize(FONT_SIZES.badge).widthOfString(value);
  const labelWidth = doc.font('Helvetica').fontSize(FONT_SIZES.badgeLabel).widthOfString(label);
  const padding = 5;
  const gap = 3;
  const totalWidth = labelWidth + gap + valueWidth + padding * 2;
  const height = 14;

  // Background pill
  doc.roundedRect(x, y, totalWidth, height, 3).fill(color);
  // Label
  doc.font('Helvetica').fontSize(FONT_SIZES.badgeLabel).fillColor(COLORS.white);
  doc.text(label, x + padding, y + (height - FONT_SIZES.badgeLabel) / 2, { lineBreak: false });
  // Value
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.badge).fillColor(COLORS.white);
  doc.text(value, x + padding + labelWidth + gap, y + (height - FONT_SIZES.badge) / 2, { lineBreak: false });
  doc.restore();
}

function drawKVRow(doc: PDFDoc, x: number, y: number, label: string, value: string, colWidth: number): void {
  const rowH = 14;
  doc.save();
  // Alternating subtle stripe
  doc.rect(x, y, colWidth, rowH).fill(y % 28 < 14 ? COLORS.offWhite : COLORS.white);
  // Label
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
  doc.text(label, x + 6, y + (rowH - FONT_SIZES.kvLabel) / 2, { width: colWidth * 0.35, lineBreak: false });
  // Value
  doc.font('Helvetica').fontSize(FONT_SIZES.kvValue).fillColor(COLORS.text);
  const labelEnd = x + 6 + colWidth * 0.35;
  doc.text(safeStr(value), labelEnd + 4, y + (rowH - FONT_SIZES.kvValue) / 2, {
    width: colWidth - (labelEnd - x) - 10,
    lineBreak: false,
    ellipsis: true,
  });
  doc.restore();
}

function drawTable(
  doc: PDFDoc,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  colWidths: number[],
  options?: { align?: Array<'left' | 'right' | 'center'> }
): void {
  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(FONT_SIZES.tableBody).fillColor(COLORS.textMuted);
    doc.text('No data available', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const rowH = 16;
  const headerH = 18;
  const aligns = options?.align ?? headers.map(() => 'left' as const);

  ensureSpace(doc, headerH + rowH);

  // Header
  const headerY = doc.y;
  doc.save();
  doc.rect(MARGIN, headerY, CONTENT_WIDTH, headerH).fill(COLORS.lightGray);
  let cx = MARGIN;
  for (let i = 0; i < headers.length; i++) {
    const align = aligns[i] || 'left';
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.tableHeader).fillColor(COLORS.text);
    const tx = align === 'right' ? cx + colWidths[i] - 6 : cx + 4;
    doc.text(headers[i], tx, headerY + (headerH - FONT_SIZES.tableHeader) / 2, {
      width: colWidths[i] - 8,
      align,
      lineBreak: false,
      ellipsis: true,
    });
    cx += colWidths[i];
  }
  doc.restore();
  doc.y = headerY + headerH;

  // Rows
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowH + 5);
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE) {
      doc.addPage();
      // Re-draw header on new page
      const newHeaderY = doc.y;
      doc.save();
      doc.rect(MARGIN, newHeaderY, CONTENT_WIDTH, headerH).fill(COLORS.lightGray);
      let hcx = MARGIN;
      for (let i = 0; i < headers.length; i++) {
        const align = aligns[i] || 'left';
        doc.font('Helvetica-Bold').fontSize(FONT_SIZES.tableHeader).fillColor(COLORS.text);
        const tx = align === 'right' ? hcx + colWidths[i] - 6 : hcx + 4;
        doc.text(headers[i], tx, newHeaderY + (headerH - FONT_SIZES.tableHeader) / 2, {
          width: colWidths[i] - 8,
          align,
          lineBreak: false,
          ellipsis: true,
        });
        hcx += colWidths[i];
      }
      doc.restore();
      doc.y = newHeaderY + headerH;
    }

    const ry = doc.y;
    const bgColor = r % 2 === 0 ? COLORS.white : COLORS.offWhite;
    doc.save();
    doc.rect(MARGIN, ry, CONTENT_WIDTH, rowH).fill(bgColor);
    // Bottom border
    doc.moveTo(MARGIN, ry + rowH).lineTo(MARGIN + CONTENT_WIDTH, ry + rowH)
      .lineWidth(0.3).strokeColor(COLORS.border).stroke();

    let cx = MARGIN;
    for (let i = 0; i < headers.length; i++) {
      const align = aligns[i] || 'left';
      const cellVal = rows[r]?.[i];
      doc.font('Helvetica').fontSize(FONT_SIZES.tableBody).fillColor(COLORS.text);
      const tx = align === 'right' ? cx + colWidths[i] - 6 : cx + 4;
      doc.text(safeStr(cellVal), tx, ry + (rowH - FONT_SIZES.tableBody) / 2, {
        width: colWidths[i] - 8,
        align,
        lineBreak: false,
        ellipsis: true,
      });
      cx += colWidths[i];
    }
    doc.restore();
    doc.y = ry + rowH;
  }
  doc.moveDown(0.5);
}

// ============================================================================
// Renderers
// ============================================================================

function renderHeader(doc: PDFDoc, data: WOPrintData): void {
  const wo = data.workOrder;

  // Navy header bar
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, 50).fill(COLORS.navy);

  // Company name left
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.companyTitle).fillColor(COLORS.white);
  doc.text(data.companyInfo.name || 'iAssetsPro', MARGIN, 12, { lineBreak: false });

  // "WORK ORDER" title center
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.pageTitle).fillColor(COLORS.white);
  doc.text('WORK ORDER', PAGE_WIDTH / 2 - 60, 14, { lineBreak: false, width: 120, align: 'center' });

  // WO Number right
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.woNumber).fillColor(COLORS.white);
  doc.text(wo.woNumber, PAGE_WIDTH - MARGIN - 150, 16, { lineBreak: false, width: 150, align: 'right' });
  doc.restore();

  doc.y = 56;
  doc.x = MARGIN;

  // Title row
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text);
  doc.text(wo.title, MARGIN, doc.y, { width: CONTENT_WIDTH * 0.6, lineBreak: false, ellipsis: true });

  // Badges on the right
  const badgeY = doc.y;
  const badges: Array<{ label: string; value: string; color: string }> = [
    { label: 'Status: ', value: formatBadgeText(wo.status), color: getStatusColor(wo.status) },
    { label: 'Priority: ', value: formatBadgeText(wo.priority), color: getPriorityColor(wo.priority) },
    { label: 'Type: ', value: formatBadgeText(wo.type), color: '#475569' },
  ];
  let bx = PAGE_WIDTH - MARGIN;
  for (let i = badges.length - 1; i >= 0; i--) {
    const b = badges[i];
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.badge).fillColor(COLORS.white);
    const valW = doc.widthOfString(b.value);
    doc.font('Helvetica').fontSize(FONT_SIZES.badgeLabel);
    const labW = doc.widthOfString(b.label);
    const bw = labW + 3 + valW + 10;
    bx -= bw + 4;
    drawBadge(doc, bx, badgeY, b.label, b.value, b.color);
  }

  doc.y = badgeY + 20;

  // Divider
  doc.save();
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .lineWidth(1).strokeColor(COLORS.border).stroke();
  doc.restore();
  doc.y += 6;
}

function renderTwoColumnInfo(doc: PDFDoc, data: WOPrintData): void {
  const wo = data.workOrder;
  const asset = data.asset as Record<string, unknown> | null;
  const assetCategory = asset?.category as { name: string } | undefined;

  const leftX = MARGIN;
  const rightX = MARGIN + COL_WIDTH + COL_GAP;
  const startY = doc.y;
  const rowH = 14;
  const leftRows: Array<[string, string]> = [
    ['Equipment:', safeStr(asset?.name ?? wo.assetName)],
    ['Tag Number:', safeStr(asset?.assetTag)],
    ['Manufacturer:', safeStr(asset?.manufacturer)],
    ['Model:', safeStr(asset?.model)],
    ['Serial Number:', safeStr(asset?.serialNumber)],
    ['Category:', safeStr(assetCategory?.name)],
    ['Criticality:', formatBadgeText(safeStr(asset?.criticality ?? wo.priority))],
    ['Condition:', formatBadgeText(safeStr(asset?.condition))],
    ['Maintenance Location:', safeStr(data.maintenanceLocation?.path)],
    ['Location Code:', safeStr(data.maintenanceLocation?.locationCode)],
    ['Current Asset Location:', [safeStr(asset?.building), safeStr(asset?.floor), safeStr(asset?.area), safeStr(asset?.location)]
      .filter((v) => v !== '—').join(', ') || '—'],
  ];

  const rightRows: Array<[string, string]> = [
    ['Created:', fmtDate(wo.createdAt)],
    ['Planned Start:', fmtDate(wo.plannedStart)],
    ['Planned End:', fmtDate(wo.plannedEnd)],
    ['Actual Start:', fmtDate(wo.actualStart)],
    ['Actual End:', fmtDate(wo.actualEnd)],
    ['Assigned To:', safeStr(data.assignee?.fullName)],
    ['Team Leader:', safeStr(data.teamLeader?.fullName)],
    ['Supervisor:', safeStr(data.supervisor?.fullName)],
    ['Planner:', safeStr(data.planner?.fullName)],
    ['Trade:', formatBadgeText(safeStr(wo.tradeActivity))],
    ['Est. Hours:', fmtNum(wo.estimatedHours, 1)],
    ['Actual Hours:', fmtNum(wo.actualHours, 1)],
  ];

  // LEFT: Equipment Info
  drawSectionHeader(doc, 'Equipment Information');
  const leftSectionY = doc.y;
  for (let i = 0; i < leftRows.length; i++) {
    drawKVRow(doc, leftX, leftSectionY + i * rowH, leftRows[i][0], leftRows[i][1], COL_WIDTH);
  }

  // RIGHT: WO Details
  const rightStartY = startY;
  doc.y = rightStartY;
  // Need to draw section header for right column too
  doc.save();
  doc.rect(rightX, rightStartY, 3, 12).fill(COLORS.emerald);
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.sectionTitleBold).fillColor(COLORS.text);
  doc.text('WORK ORDER DETAILS', rightX + 8, rightStartY + 1, { lineBreak: false });
  doc.restore();

  const rightSectionY = rightStartY + 16;
  for (let i = 0; i < rightRows.length; i++) {
    drawKVRow(doc, rightX, rightSectionY + i * rowH, rightRows[i][0], rightRows[i][1], COL_WIDTH);
  }

  // Bounding box
  const totalLeftH = leftRows.length * rowH;
  const totalRightH = rightRows.length * rowH;
  const maxH = Math.max(totalLeftH, totalRightH) + 16; // +16 for section title

  doc.save();
  // Left box
  doc.roundedRect(leftX - 2, leftSectionY - 16, COL_WIDTH + 4, totalLeftH + 2, 4)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  // Right box
  doc.roundedRect(rightX - 2, rightSectionY - 16, COL_WIDTH + 4, totalRightH + 2, 4)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.restore();

  doc.y = leftSectionY + totalLeftH + 8;
  doc.x = MARGIN;
}

function renderDescription(doc: PDFDoc, data: WOPrintData): void {
  const wo = data.workOrder;
  const hasDesc = wo.description || wo.failureDescription || wo.causeDescription || wo.actionDescription;
  if (!hasDesc) return;

  ensureSpace(doc, 30);
  drawSectionHeader(doc, 'Description & Failure Analysis');

  const labelW = 80;
  const startY = doc.y;

  if (wo.description) {
    ensureSpace(doc, 40);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Problem:', MARGIN, doc.y, { width: labelW, lineBreak: false });
    const labelEndX = MARGIN + labelW + 4;
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.description), labelEndX, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - labelW - 12,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  if (wo.failureDescription) {
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Failure:', MARGIN, doc.y, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.failureDescription), MARGIN + labelW + 4, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - labelW - 12,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  if (wo.causeDescription) {
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Cause:', MARGIN, doc.y, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.causeDescription), MARGIN + labelW + 4, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - labelW - 12,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  if (wo.actionDescription) {
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Action:', MARGIN, doc.y, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.actionDescription), MARGIN + labelW + 4, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - labelW - 12,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.3);
}

function renderSafety(doc: PDFDoc, data: WOPrintData): void {
  const wo = data.workOrder;
  if (!wo.safetyNotes && !wo.ppeRequired) return;

  ensureSpace(doc, 30);
  drawSectionHeader(doc, 'Safety Information');

  if (wo.safetyNotes) {
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Safety Notes:', MARGIN, doc.y, { width: 80, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.safetyNotes), MARGIN + 84, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - 92,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  if (wo.ppeRequired) {
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('PPE Required:', MARGIN, doc.y, { width: 80, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(safeStr(wo.ppeRequired), MARGIN + 84, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - 92,
      lineBreak: true,
    });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.3);
}

function renderMaterials(doc: PDFDoc, data: WOPrintData): void {
  if (!data.materials || data.materials.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Parts & Materials');

  const cur = data.companyInfo.currency || 'USD';
  const headers = ['#', 'Part #', 'Description', 'Spec', 'Qty', 'Unit', 'Bin Loc', 'Unit Cost', 'Total', 'Status'];
  const colWidths = [20, 65, 120, 80, 35, 35, 55, 60, 60, 60];
  const aligns: Array<'left' | 'right' | 'center'> = ['center', 'left', 'left', 'left', 'right', 'left', 'left', 'right', 'right', 'center'];

  const rows = data.materials.map((m, i) => {
    const inv = m.inventoryItem as Record<string, unknown> | null;
    return [
      i + 1,
      safeStr(inv?.itemCode),
      safeStr(m.itemName),
      safeStr(inv?.specification).substring(0, 30),
      fmtNum(m.quantity as number | null, m.quantity !== null && m.quantity !== 0 && (m.quantity as number) % 1 !== 0 ? 1 : 0),
      safeStr(inv?.unitOfMeasure),
      safeStr(inv?.binLocation),
      fmtCurrency(m.unitCost as number | null, cur),
      fmtCurrency(m.totalCost as number | null, cur),
      formatBadgeText(safeStr(m.status)),
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
}

function renderTimeLogs(doc: PDFDoc, data: WOPrintData): void {
  if (!data.timeLogs || data.timeLogs.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Labor / Time Logs');

  const headers = ['#', 'Technician', 'Activity', 'Start', 'End', 'Hours', 'Break', 'Notes'];
  const colWidths = [20, 90, 80, 70, 70, 50, 50, CONTENT_WIDTH - 430];
  const aligns: Array<'left' | 'right' | 'center'> = ['center', 'left', 'left', 'left', 'left', 'right', 'right', 'left'];

  const rows = data.timeLogs.map((tl, i) => {
    const user = tl.user as { fullName: string } | undefined;
    const duration = (tl.duration as number | null) ?? 0;
    return [
      i + 1,
      safeStr(user?.fullName),
      formatBadgeText(safeStr(tl.activityType)),
      fmtTime(tl.startTime as Date | string | null),
      fmtTime(tl.endTime as Date | string | null),
      fmtNum(duration, 1),
      fmtMinutes(tl.breakMinutes as number | null),
      safeStr(tl.notes).substring(0, 40),
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
}

function renderDowntime(doc: PDFDoc, data: WOPrintData): void {
  if (!data.downtimes || data.downtimes.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Downtime Log');

  const headers = ['Start', 'End', 'Duration', 'Reason', 'Category', 'Impact', 'Prod Loss'];
  const colWidths = [100, 100, 60, 180, 70, 60, CONTENT_WIDTH - 570];
  const aligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'right', 'left', 'center', 'center', 'right'];

  const rows = data.downtimes.map((dt) => [
    fmtDate(dt.downtimeStart as Date | string | null),
    fmtDate(dt.downtimeEnd as Date | string | null),
    fmtMinutes(dt.durationMinutes as number | null),
    safeStr(dt.reason),
    formatBadgeText(safeStr(dt.category)),
    formatBadgeText(safeStr(dt.impactLevel)),
    fmtCurrency(dt.productionLoss as number | null, data.companyInfo.currency),
  ]);

  drawTable(doc, headers, rows, colWidths, { align: aligns });
}

function renderCostSummary(doc: PDFDoc, data: WOPrintData): void {
  const wo = data.workOrder;
  const cur = data.companyInfo.currency || 'USD';

  ensureSpace(doc, 60);
  drawSectionHeader(doc, 'Cost Summary');

  const boxX = PAGE_WIDTH - MARGIN - 250;
  const boxW = 250;
  const rowH = 16;
  const startY = doc.y;

  // Background box
  doc.save();
  doc.roundedRect(boxX, startY, boxW, rowH * 4 + 4, 4)
    .lineWidth(0.5).fillAndStroke(COLORS.offWhite, COLORS.border);
  doc.restore();

  const rows: Array<[string, string]> = [
    ['Labor Cost:', fmtCurrency(wo.laborCost, cur)],
    ['Parts Cost:', fmtCurrency(wo.partsCost, cur)],
    ['Contractor Cost:', fmtCurrency(wo.contractorCost, cur)],
  ];

  for (let i = 0; i < rows.length; i++) {
    const ry = startY + 2 + i * rowH;
    doc.font('Helvetica').fontSize(FONT_SIZES.costLabel).fillColor(COLORS.textSecondary);
    doc.text(rows[i][0], boxX + 8, ry + (rowH - FONT_SIZES.costLabel) / 2, { lineBreak: false, width: 130 });
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.costValue).fillColor(COLORS.text);
    doc.text(rows[i][1], boxX + boxW - 90, ry + (rowH - FONT_SIZES.costValue) / 2, {
      width: 80, align: 'right', lineBreak: false,
    });
  }

  // Divider line
  const divY = startY + 2 + 3 * rowH;
  doc.save();
  doc.moveTo(boxX + 6, divY).lineTo(boxX + boxW - 6, divY)
    .lineWidth(0.5).strokeColor(COLORS.text).stroke();
  doc.restore();

  // Total
  const totalY = divY + 2;
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.costTotalLabel).fillColor(COLORS.navy);
  doc.text('TOTAL COST:', boxX + 8, totalY + (rowH - FONT_SIZES.costTotalLabel) / 2, { lineBreak: false, width: 130 });
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.costTotalValue).fillColor(COLORS.emerald);
  doc.text(fmtCurrency(wo.totalCost, cur), boxX + boxW - 100, totalY + (rowH - FONT_SIZES.costTotalValue) / 2, {
    width: 90, align: 'right', lineBreak: false,
  });

  doc.y = startY + rowH * 4 + 8;
  doc.x = MARGIN;
}

function renderCompletion(doc: PDFDoc, data: WOPrintData): void {
  const rc = data.repairCompletion;
  if (!rc) return;

  ensureSpace(doc, 30);
  drawSectionHeader(doc, 'Completion Details');

  const labelW = 100;
  const fields: Array<[string, string]> = [];

  if (rc.findings) fields.push(['Findings:', safeStr(rc.findings)]);
  if (rc.rootCause) fields.push(['Root Cause:', safeStr(rc.rootCause)]);
  if (rc.correctiveAction) fields.push(['Corrective Action:', safeStr(rc.correctiveAction)]);
  if (rc.completionNotes) fields.push(['Completion Notes:', safeStr(rc.completionNotes)]);
  if (rc.supervisorReviewNotes) fields.push(['Supervisor Review:', safeStr(rc.supervisorReviewNotes)]);
  if (rc.reworkReason) fields.push(['Rework Reason:', safeStr(rc.reworkReason)]);

  for (const [label, value] of fields) {
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
    doc.text(label, MARGIN, doc.y, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText).fillColor(COLORS.text);
    doc.text(value, MARGIN + labelW + 4, doc.y - FONT_SIZES.kvLabel - 2, {
      width: CONTENT_WIDTH - labelW - 12,
      lineBreak: true,
    });
    doc.moveDown(0.2);
  }

  // Summary metrics row
  const metrics: Array<[string, string]> = [
    ['Total Labor Hours:', fmtNum(rc.totalLaborHours as number | null, 1)],
    ['Total Material Cost:', fmtCurrency(rc.totalMaterialCost as number | null, data.companyInfo.currency)],
    ['Total Downtime:', fmtMinutes(rc.totalDowntimeMinutes as number | null)],
    ['Rework Count:', fmtNum(rc.reworkCount as number | null)],
  ];

  if (rc.supervisorApprovedAt) {
    const supBy = (rc.supervisorApprovedBy as { fullName: string } | null)?.fullName ?? '—';
    metrics.push(['Supervisor Approval:', `${fmtDateShort(rc.supervisorApprovedAt as Date | string | null)} by ${supBy}`]);
  }
  if (rc.plannerClosedAt) {
    const planBy = (rc.plannerClosedBy as { fullName: string } | null)?.fullName ?? '—';
    metrics.push(['Planner Closure:', `${fmtDateShort(rc.plannerClosedAt as Date | string | null)} by ${planBy}`]);
  }

  if (metrics.length > 0) {
    doc.moveDown(0.3);
    ensureSpace(doc, 20);
    let mx = MARGIN;
    for (const [label, value] of metrics) {
      doc.font('Helvetica').fontSize(FONT_SIZES.kvLabel).fillColor(COLORS.textSecondary);
      const lw = doc.widthOfString(label);
      doc.text(label, mx, doc.y, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvValue).fillColor(COLORS.text);
      doc.text(safeStr(value), mx + lw + 3, doc.y - FONT_SIZES.kvLabel - 2, { lineBreak: false });
      mx += lw + doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvValue).widthOfString(safeStr(value)) + 20;
      if (mx > PAGE_WIDTH - MARGIN - 100) {
        mx = MARGIN;
        doc.moveDown(0.2);
      }
    }
    doc.moveDown(0.3);
  }

  doc.moveDown(0.3);
}

function renderTaskExecutions(doc: PDFDoc, data: WOPrintData): void {
  if (!data.taskExecutions || data.taskExecutions.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Task Checklist');

  const headers = ['#', 'Task', 'Type', 'Status', 'Completed By', 'Findings'];
  const colWidths = [20, 250, 80, 70, 100, CONTENT_WIDTH - 520];
  const aligns: Array<'left' | 'right' | 'center'> = ['center', 'left', 'center', 'center', 'left', 'left'];

  const rows = data.taskExecutions.map((te, i) => {
    const completedBy = (te.completedBy as { fullName: string } | null)?.fullName ?? '—';
    const taskNumber = typeof te.taskNumber === 'number' ? te.taskNumber : i + 1;
    return [
      taskNumber,
      safeStr(te.description).substring(0, 80),
      formatBadgeText(safeStr(te.taskType)),
      formatBadgeText(safeStr(te.status)),
      safeStr(completedBy),
      safeStr(te.findings).substring(0, 40),
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
}

function renderFailureRecords(doc: PDFDoc, data: WOPrintData): void {
  if (!data.failureRecords || data.failureRecords.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Failure Records');

  const headers = ['Failure Mode', 'Cause', 'Severity', 'Detected', 'Resolved', 'Downtime'];
  const colWidths = [100, 200, 70, 100, 100, CONTENT_WIDTH - 570];
  const aligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'center', 'left', 'left', 'right'];

  const rows = data.failureRecords.map((fr) => [
    formatBadgeText(safeStr(fr.failureMode)),
    safeStr(fr.failureCause).substring(0, 80),
    formatBadgeText(safeStr(fr.failureSeverity)),
    fmtDateShort(fr.detectedAt as Date | string | null),
    fmtDateShort(fr.resolvedAt as Date | string | null),
    fmtMinutes(fr.downtimeMinutes as number | null),
  ]);

  drawTable(doc, headers, rows, colWidths, { align: aligns });
}

function renderTeamMembers(doc: PDFDoc, data: WOPrintData): void {
  if (!data.teamMembers || data.teamMembers.length === 0) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, 'Team Members');

  const headers = ['Name', 'Department', 'Role'];
  const colWidths = [200, 200, CONTENT_WIDTH - 400];

  const rows = data.teamMembers.map((tm) => [
    safeStr(tm.user.fullName),
    safeStr(tm.user.department),
    formatBadgeText(safeStr(tm.role)),
  ]);

  drawTable(doc, headers, rows, colWidths);
}

function renderSignatures(doc: PDFDoc, data: WOPrintData): void {
  // Reserve space for signatures near bottom
  const sigY = doc.y + 8;
  ensureSpace(doc, 60);

  const colW = (CONTENT_WIDTH - COL_GAP * 2) / 3;
  const positions = [
    { label: 'Technician', name: data.assignee?.fullName },
    { label: 'Supervisor', name: data.supervisor?.fullName },
    { label: 'Planner', name: data.planner?.fullName },
  ];

  for (let i = 0; i < positions.length; i++) {
    const x = MARGIN + i * (colW + COL_GAP);
    const y = sigY;

    doc.font('Helvetica').fontSize(FONT_SIZES.signatureLabel).fillColor(COLORS.textSecondary);
    doc.text(`${positions[i].label}:`, x, y, { lineBreak: false });

    // Signature line
    doc.save();
    doc.moveTo(x, y + 16).lineTo(x + colW - 40, y + 16)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.restore();

    // Date line
    doc.font('Helvetica').fontSize(FONT_SIZES.signatureLabel).fillColor(COLORS.textSecondary);
    doc.text('Date:', x + colW - 34, y, { lineBreak: false });
    doc.save();
    doc.moveTo(x + colW - 34, y + 16).lineTo(x + colW, y + 16)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.restore();

    // Pre-fill name if available
    if (positions[i].name) {
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.textMuted);
      doc.text(positions[i].name!, x + 2, y + 18, { lineBreak: false });
    }
  }

  doc.y = sigY + 30;
}

function addFooters(doc: PDFDoc, data: WOPrintData): void {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageH = doc.page.height;

    // Separator
    const sepY = pageH - MARGIN + 2;
    doc.save();
    doc.moveTo(MARGIN, sepY).lineTo(PAGE_WIDTH - MARGIN, sepY)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();

    // Left: generated info
    const now = new Date();
    const genText = `Generated: ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} | ${data.companyInfo.name || 'iAssetsPro'} CMMS`;
    doc.font('Helvetica').fontSize(FONT_SIZES.footer).fillColor(COLORS.textMuted);
    doc.text(genText, MARGIN, sepY + 5, { lineBreak: false });

    // Right: page number
    const pageText = `Page ${i + 1} of ${range.count}`;
    doc.text(pageText, MARGIN, sepY + 5, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
    doc.restore();
  }
}

// ============================================================================
// Main exported function
// ============================================================================

export async function generateWODetailPDF(data: WOPrintData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = createDoc({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: `Work Order ${data.workOrder.woNumber}`,
          Creator: 'iAssetsPro CMMS',
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Render all sections ──
      renderHeader(doc, data);
      doc.moveDown(0.3);

      renderTwoColumnInfo(doc, data);
      doc.moveDown(0.5);

      renderDescription(doc, data);
      renderSafety(doc, data);
      renderTaskExecutions(doc, data);
      renderTeamMembers(doc, data);
      renderMaterials(doc, data);
      renderTimeLogs(doc, data);
      renderDowntime(doc, data);
      renderFailureRecords(doc, data);
      renderCostSummary(doc, data);
      renderCompletion(doc, data);

      // ── Signatures (try to keep on same page, but allow overflow) ──
      renderSignatures(doc, data);

      // ── Footers on all pages ──
      addFooters(doc, data);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}