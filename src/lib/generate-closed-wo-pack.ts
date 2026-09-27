import PDFDocument from 'pdfkit';

// ============================================================================
// Types
// ============================================================================

export interface ClosedWOPackData {
  workOrder: {
    id: string;
    woNumber: string;
    title: string;
    description: string | null;
    type: string;
    priority: string;
    status: string;
    maintenanceRequestId: string | null;
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
    plantId: string | null;
    notes: string | null;
    isLocked: boolean;
    lockReason: string | null;
    lockedAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  assignee: { fullName: string; department: string | null } | null;
  teamLeader: { fullName: string } | null;
  supervisor: { fullName: string } | null;
  planner: { fullName: string } | null;
  assigner: { fullName: string } | null;
  plant: { name: string; code: string; location: string | null; city: string | null; country: string | null } | null;
  asset: Record<string, unknown> | null;
  components: Array<Record<string, unknown>>;
  sourceRequest: Record<string, unknown> | null;
  pmSchedule: { title: string; frequencyType: string; frequencyValue: number } | null;
  teamMembers: Array<Record<string, unknown>>;
  timeLogs: Array<Record<string, unknown>>;
  downtimes: Array<Record<string, unknown>>;
  taskExecutions: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  repairMaterialRequests?: Array<Record<string, unknown>>;
  toolRequests: Array<Record<string, unknown>>;
  toolTransactions: Array<Record<string, unknown>>;
  failureRecords: Array<Record<string, unknown>>;
  repairCompletion: Record<string, unknown> | null;
  shiftHandovers: Array<Record<string, unknown>>;
  assistanceRequests: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  statusHistory: Array<Record<string, unknown>>;
  workInstructionExecutions: Array<Record<string, unknown>>;
  companyInfo: {
    name: string;
    legalName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    currency: string;
  };
  generatedAt: Date;
}

// ============================================================================
// Constants — A4 Portrait
// ============================================================================

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const FOOTER_RESERVE = 32;
const HEADER_BAR_HEIGHT = 48;

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
  accentSlate: '#64748b',
  closedBadge: '#64748b',
} as const;

const FONT = {
  companyTitle: 9,
  pageTitle: 11,
  woNumber: 12,
  badge: 7.5,
  badgeLabel: 7,
  sectionTitle: 11,
  kvLabel: 8,
  kvValue: 8,
  tableHeader: 7.5,
  tableBody: 7.5,
  bodyText: 8,
  footer: 6.5,
  signatureLabel: 8,
  small: 7,
  costLabel: 8,
  costValue: 8,
  costTotalLabel: 9,
  costTotalValue: 9,
  timestamp: 6.5,
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(val);
}

function fmtNum(val: number | null | undefined, decimals: number = 0): string {
  if (val == null || Number.isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(val);
}

function fmtMinutes(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBadgeText(text: string): string {
  return text.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
// Draw primitives
// ============================================================================

function drawSectionHeader(doc: PDFDoc, title: string): number {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc.save();
  doc.rect(MARGIN, y, 3, 12).fill(COLORS.emerald);
  doc.font('Helvetica-Bold').fontSize(FONT.sectionTitle).fillColor(COLORS.text);
  doc.text(title.toUpperCase(), MARGIN + 8, y + 1, { lineBreak: false });
  doc.restore();
  doc.y = y + 18;
  return doc.y;
}

function drawBadge(doc: PDFDoc, x: number, y: number, label: string, value: string, color: string): void {
  doc.save();
  const valueWidth = doc.font('Helvetica-Bold').fontSize(FONT.badge).widthOfString(value);
  const labelWidth = doc.font('Helvetica').fontSize(FONT.badgeLabel).widthOfString(label);
  const padding = 5;
  const gap = 3;
  const totalWidth = labelWidth + gap + valueWidth + padding * 2;
  const height = 14;
  doc.roundedRect(x, y, totalWidth, height, 3).fill(color);
  doc.font('Helvetica').fontSize(FONT.badgeLabel).fillColor(COLORS.white);
  doc.text(label, x + padding, y + (height - FONT.badgeLabel) / 2, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(FONT.badge).fillColor(COLORS.white);
  doc.text(value, x + padding + labelWidth + gap, y + (height - FONT.badge) / 2, { lineBreak: false });
  doc.restore();
}

function drawKVRow(doc: PDFDoc, x: number, y: number, label: string, value: string, colWidth: number, rowH: number = 14): void {
  doc.save();
  doc.rect(x, y, colWidth, rowH).fill(y % (rowH * 2) < rowH ? COLORS.offWhite : COLORS.white);
  doc.font('Helvetica-Bold').fontSize(FONT.kvLabel).fillColor(COLORS.textSecondary);
  doc.text(label, x + 6, y + (rowH - FONT.kvLabel) / 2, { width: colWidth * 0.35, lineBreak: false });
  const labelEnd = x + 6 + colWidth * 0.35;
  doc.font('Helvetica').fontSize(FONT.kvValue).fillColor(COLORS.text);
  doc.text(safeStr(value), labelEnd + 4, y + (rowH - FONT.kvValue) / 2, {
    width: colWidth - (labelEnd - x) - 10, lineBreak: false, ellipsis: true,
  });
  doc.restore();
}

function drawTable(
  doc: PDFDoc,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  colWidths: number[],
  options?: { align?: Array<'left' | 'right' | 'center'> },
): void {
  if (rows.length === 0) {
    ensureSpace(doc, 20);
    doc.font('Helvetica').fontSize(FONT.tableBody).fillColor(COLORS.textMuted);
    doc.text('No data available', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const rowH = 16;
  const headerH = 18;
  const aligns = options?.align ?? headers.map(() => 'left' as const);

  ensureSpace(doc, headerH + rowH);

  const drawTableHeader = (y: number): void => {
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, headerH).fill(COLORS.lightGray);
    let cx = MARGIN;
    for (let i = 0; i < headers.length; i++) {
      const align = aligns[i] || 'left';
      doc.font('Helvetica-Bold').fontSize(FONT.tableHeader).fillColor(COLORS.text);
      const tx = align === 'right' ? cx + colWidths[i] - 6 : cx + 4;
      doc.text(headers[i], tx, y + (headerH - FONT.tableHeader) / 2, {
        width: colWidths[i] - 8, align, lineBreak: false, ellipsis: true,
      });
      cx += colWidths[i];
    }
    doc.restore();
    doc.y = y + headerH;
  };

  drawTableHeader(doc.y);

  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowH + 5);
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE) {
      doc.addPage();
      drawTableHeader(doc.y);
    }

    const ry = doc.y;
    const bgColor = r % 2 === 0 ? COLORS.white : COLORS.offWhite;
    doc.save();
    doc.rect(MARGIN, ry, CONTENT_WIDTH, rowH).fill(bgColor);
    doc.moveTo(MARGIN, ry + rowH).lineTo(MARGIN + CONTENT_WIDTH, ry + rowH)
      .lineWidth(0.3).strokeColor(COLORS.border).stroke();

    let cx = MARGIN;
    for (let i = 0; i < headers.length; i++) {
      const align = aligns[i] || 'left';
      const cellVal = rows[r]?.[i];
      doc.font('Helvetica').fontSize(FONT.tableBody).fillColor(COLORS.text);
      const tx = align === 'right' ? cx + colWidths[i] - 6 : cx + 4;
      doc.text(safeStr(cellVal), tx, ry + (rowH - FONT.tableBody) / 2, {
        width: colWidths[i] - 8, align, lineBreak: false, ellipsis: true,
      });
      cx += colWidths[i];
    }
    doc.restore();
    doc.y = ry + rowH;
  }
  doc.moveDown(0.5);
}

function drawLabelValue(doc: PDFDoc, label: string, value: string, labelW?: number): void {
  const lw = labelW ?? 120;
  ensureSpace(doc, 20);
  doc.font('Helvetica-Bold').fontSize(FONT.kvLabel).fillColor(COLORS.textSecondary);
  doc.text(label, MARGIN, doc.y, { width: lw, lineBreak: false });
  doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.text);
  doc.text(safeStr(value), MARGIN + lw + 4, doc.y - FONT.kvLabel - 2, {
    width: CONTENT_WIDTH - lw - 8, lineBreak: true,
  });
  doc.moveDown(0.2);
}

function drawDivider(doc: PDFDoc): void {
  const y = doc.y;
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.restore();
  doc.y = y + 6;
}

// ============================================================================
// Section 1: Company/Plant Header
// ============================================================================

function renderHeader(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  const ci = data.companyInfo;

  // Navy header bar
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, HEADER_BAR_HEIGHT).fill(COLORS.navy);

  // Company name left
  doc.font('Helvetica-Bold').fontSize(FONT.companyTitle).fillColor(COLORS.white);
  doc.text(ci.name || 'iAssetsPro', MARGIN, 10, { lineBreak: false });
  if (ci.address) {
    doc.font('Helvetica').fontSize(6.5).fillColor('#cbd5e1');
    doc.text(ci.address, MARGIN, 22, { width: 220, lineBreak: false, ellipsis: true });
  }
  if (ci.phone || ci.email) {
    doc.font('Helvetica').fontSize(6.5).fillColor('#cbd5e1');
    const contactLine = [ci.phone, ci.email].filter(Boolean).join(' | ');
    doc.text(contactLine, MARGIN, 32, { width: 220, lineBreak: false, ellipsis: true });
  }

  // Title center
  doc.font('Helvetica-Bold').fontSize(FONT.pageTitle).fillColor(COLORS.white);
  doc.text('CLOSED WORK ORDER PACK', PAGE_WIDTH / 2 - 70, 12, { lineBreak: false, width: 140, align: 'center' });

  // Plant name (if available)
  if (data.plant?.name) {
    doc.font('Helvetica').fontSize(7).fillColor('#cbd5e1');
    doc.text(data.plant.name, PAGE_WIDTH / 2 - 70, 26, { lineBreak: false, width: 140, align: 'center' });
  }

  // WO Number right
  doc.font('Helvetica-Bold').fontSize(FONT.woNumber).fillColor(COLORS.white);
  doc.text(wo.woNumber, PAGE_WIDTH - MARGIN - 120, 14, { lineBreak: false, width: 120, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor('#cbd5e1');
  doc.text(`Generated: ${fmtDate(data.generatedAt)}`, PAGE_WIDTH - MARGIN - 120, 30, { lineBreak: false, width: 120, align: 'right' });

  doc.restore();

  doc.y = HEADER_BAR_HEIGHT + 10;
  doc.x = MARGIN;
}

// ============================================================================
// Section 2: WO Identification
// ============================================================================

function renderWOIdentification(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  const cur = data.companyInfo.currency || 'USD';

  ensureSpace(doc, 80);
  drawSectionHeader(doc, '2. Work Order Identification');

  const rowH = 14;
  const halfW = (CONTENT_WIDTH - 8) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + halfW + 8;
  const startY = doc.y;

  const leftRows: Array<[string, string]> = [
    ['WO Number:', wo.woNumber],
    ['Title:', wo.title],
    ['Type:', formatBadgeText(wo.type)],
    ['Status:', formatBadgeText(wo.status)],
    ['Priority:', formatBadgeText(wo.priority)],
    ['Trade:', formatBadgeText(safeStr(wo.tradeActivity))],
  ];

  // SLA computation
  let slaText = '—';
  if (wo.plannedStart && wo.plannedEnd) {
    const ms = new Date(wo.plannedEnd).getTime() - new Date(wo.plannedStart).getTime();
    slaText = fmtMinutes(ms / 60000);
  }

  const rightRows: Array<[string, string]> = [
    ['Created:', fmtDate(wo.createdAt)],
    ['Planned Start:', fmtDate(wo.plannedStart)],
    ['Planned End:', fmtDate(wo.plannedEnd)],
    ['Actual Start:', fmtDate(wo.actualStart)],
    ['Actual End:', fmtDate(wo.actualEnd)],
    ['SLA Window:', slaText],
  ];

  for (let i = 0; i < leftRows.length; i++) {
    drawKVRow(doc, leftX, startY + i * rowH, leftRows[i][0], leftRows[i][1], halfW, rowH);
  }
  for (let i = 0; i < rightRows.length; i++) {
    drawKVRow(doc, rightX, startY + i * rowH, rightRows[i][0], rightRows[i][1], halfW, rowH);
  }

  // Bounding boxes
  const totalH = leftRows.length * rowH;
  doc.save();
  doc.roundedRect(leftX - 2, startY - 2, halfW + 4, totalH + 4, 3)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.roundedRect(rightX - 2, startY - 2, halfW + 4, totalH + 4, 3)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.restore();

  doc.y = startY + totalH + 10;
 }

// ============================================================================
// Section 3: Linked Maintenance Request
// ============================================================================

function renderMaintenanceRequest(doc: PDFDoc, data: ClosedWOPackData): void {
  const mr = data.sourceRequest;
  if (!mr) {
    ensureSpace(doc, 20);
    drawSectionHeader(doc, '3. Linked Maintenance Request');
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No maintenance request linked to this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  ensureSpace(doc, 70);
  drawSectionHeader(doc, '3. Linked Maintenance Request');

  const rowH = 14;
  const startY = doc.y;

  const requester = mr.requester as { fullName: string; department: string | null } | null;
  const rows: Array<[string, string]> = [
    ['MR Number:', safeStr(mr.requestNumber)],
    ['Title:', safeStr(mr.title)],
    ['Category:', formatBadgeText(safeStr(mr.category))],
    ['Priority:', formatBadgeText(safeStr(mr.priority))],
    ['Requested By:', safeStr(requester?.fullName)],
    ['Department:', safeStr(requester?.department)],
    ['Created:', fmtDate(mr.createdAt as Date | string | null)],
    ['Status:', formatBadgeText(safeStr(mr.status))],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }

  if (mr.description) {
    doc.y = startY + rows.length * rowH + 4;
    drawLabelValue(doc, 'Description:', safeStr(mr.description));
  } else {
    doc.y = startY + rows.length * rowH + 6;
  }
}

// ============================================================================
// Section 4: Asset/Component Info
// ============================================================================

function renderAssetComponent(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  const asset = data.asset as Record<string, unknown> | null;

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '4. Asset & Component Information');

  if (!asset && !data.components.length) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No asset or component linked.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const assetCategory = asset?.category as { name: string } | undefined;
  const rowH = 14;
  const halfW = (CONTENT_WIDTH - 8) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + halfW + 8;
  const startY = doc.y;

  const leftRows: Array<[string, string]> = [
    ['Equipment:', safeStr(asset?.name ?? wo.assetName)],
    ['Tag Number:', safeStr(asset?.assetTag)],
    ['Manufacturer:', safeStr(asset?.manufacturer)],
    ['Model:', safeStr(asset?.model)],
    ['Serial No:', safeStr(asset?.serialNumber)],
    ['Category:', safeStr(assetCategory?.name)],
    ['Criticality:', formatBadgeText(safeStr(asset?.criticality ?? wo.priority))],
    ['Condition:', formatBadgeText(safeStr(asset?.condition))],
  ];

  const location = [safeStr(asset?.building), safeStr(asset?.floor), safeStr(asset?.area), safeStr(asset?.location)]
    .filter((v) => v !== '—').join(', ') || '—';

  const rightRows: Array<[string, string]> = [
    ['Status:', formatBadgeText(safeStr(asset?.status))],
    ['Purchase Date:', fmtDateShort(asset?.purchaseDate as Date | string | null)],
    ['Warranty Exp:', fmtDateShort(asset?.warrantyExpiry as Date | string | null)],
    ['Installed Date:', fmtDateShort(asset?.installedDate as Date | string | null)],
    ['Expected Life:', asset?.expectedLifeYears ? `${asset.expectedLifeYears} years` : '—'],
    ['Location:', location],
    ['Purchase Cost:', fmtCurrency(asset?.purchaseCost as number | null, data.companyInfo.currency)],
    ['Current Value:', fmtCurrency(asset?.currentValue as number | null, data.companyInfo.currency)],
  ];

  for (let i = 0; i < leftRows.length; i++) {
    drawKVRow(doc, leftX, startY + i * rowH, leftRows[i][0], leftRows[i][1], halfW, rowH);
  }
  for (let i = 0; i < rightRows.length; i++) {
    drawKVRow(doc, rightX, startY + i * rowH, rightRows[i][0], rightRows[i][1], halfW, rowH);
  }

  const totalH = Math.max(leftRows.length, rightRows.length) * rowH;
  doc.save();
  doc.roundedRect(leftX - 2, startY - 2, halfW + 4, totalH + 4, 3)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.roundedRect(rightX - 2, startY - 2, halfW + 4, totalH + 4, 3)
    .lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.restore();

  doc.y = startY + totalH + 6;

  // Components table
  if (data.components.length > 0) {
    doc.moveDown(0.3);
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(FONT.kvLabel).fillColor(COLORS.textSecondary);
    doc.text('Components:', MARGIN, doc.y, { lineBreak: false });
    doc.moveDown(0.2);

    const compHeaders = ['Component Code', 'Name', 'Type', 'Criticality', 'Status'];
    const compWidths = [100, 150, 80, 70, CONTENT_WIDTH - 400];
    const compRows = data.components.map((c) => {
      const comp = c.componentRegistry as Record<string, unknown> | null;
      return [
        safeStr(comp?.componentCode),
        safeStr(comp?.name),
        formatBadgeText(safeStr(comp?.componentType)),
        formatBadgeText(safeStr(comp?.criticality)),
        formatBadgeText(safeStr(comp?.lifecycleStatus)),
      ];
    });
    drawTable(doc, compHeaders, compRows, compWidths);
  }

  doc.moveDown(0.3);
}

// ============================================================================
// Section 5: Location
// ============================================================================

function renderLocation(doc: PDFDoc, data: ClosedWOPackData): void {
  const asset = data.asset as Record<string, unknown> | null;
  const mr = data.sourceRequest as Record<string, unknown> | null;

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '5. Location');

  const locationParts = [
    safeStr(asset?.building || mr?.location || data.plant?.location),
    safeStr(asset?.floor),
    safeStr(asset?.area),
    safeStr(asset?.location),
  ].filter((v) => v !== '—');

  const rowH = 14;
  const startY = doc.y;
  const rows: Array<[string, string]> = [
    ['Plant:', safeStr(data.plant?.name) + (data.plant?.code ? ` (${data.plant.code})` : '')],
    ['City/Country:', [safeStr(data.plant?.city), safeStr(data.plant?.country)].filter((v) => v !== '—').join(', ') || '—'],
    ['Building:', safeStr(asset?.building || mr?.location || data.plant?.location)],
    ['Floor:', safeStr(asset?.floor)],
    ['Area:', safeStr(asset?.area)],
    ['Specific Location:', safeStr(asset?.location || mr?.location)],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 6: Priority
// ============================================================================

function renderPriority(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  ensureSpace(doc, 50);
  drawSectionHeader(doc, '6. Priority');

  const rowH = 14;
  const startY = doc.y;
  const rows: Array<[string, string]> = [
    ['Priority:', formatBadgeText(wo.priority)],
    ['Escalation Level:', fmtNum(wo.escalationLevel) || '0 (None)'],
    ['Last Escalated:', fmtDate(wo.lastEscalatedAt as Date | string | null)],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 7: Planner/Supervisor Info
// ============================================================================

function renderPlannerSupervisor(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 70);
  drawSectionHeader(doc, '7. Planner / Supervisor Information');

  const rowH = 14;
  const startY = doc.y;
  const rows: Array<[string, string]> = [
    ['Planner:', safeStr(data.planner?.fullName)],
    ['Supervisor:', safeStr(data.supervisor?.fullName)],
    ['Assigned By:', safeStr(data.assigner?.fullName)],
    ['Assignment Type:', formatBadgeText(safeStr(data.workOrder.assignmentType))],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 8: Technician/Team Info
// ============================================================================

function renderTeamInfo(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '8. Technician & Team Members');

  // Primary assignee
  const wo = data.workOrder;
  const rowH = 14;
  const startY = doc.y;
  const primaryRows: Array<[string, string]> = [
    ['Primary Technician:', safeStr(data.assignee?.fullName)],
    ['Department:', safeStr(data.assignee?.department)],
    ['Team Leader:', safeStr(data.teamLeader?.fullName)],
  ];

  for (let i = 0; i < primaryRows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, primaryRows[i][0], primaryRows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + primaryRows.length * rowH + 6;

  // Team members table
  if (data.teamMembers.length > 0) {
    const headers = ['Name', 'Department', 'Role', 'Access', 'Added At'];
    const colWidths = [140, 100, 100, 70, CONTENT_WIDTH - 410];
    const rows = data.teamMembers.map((tm) => {
    const user = tm.user as { fullName: string; department: string | null } | undefined;
      return [
        safeStr(user?.fullName),
        safeStr(user?.department),
        formatBadgeText(safeStr(tm.role)),
        formatBadgeText(safeStr(tm.accessLevel)),
        fmtDateShort(tm.assignedAt as Date | string | null),
      ];
    });
    drawTable(doc, headers, rows, colWidths);
  }

  doc.moveDown(0.3);
}

// ============================================================================
// Section 9: Work Description
// ============================================================================

function renderWorkDescription(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  if (!wo.description && !wo.notes) return;

  ensureSpace(doc, 40);
  drawSectionHeader(doc, '9. Work Description');

  if (wo.description) drawLabelValue(doc, 'Description:', wo.description);
  if (wo.notes) drawLabelValue(doc, 'Notes:', wo.notes);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 10: Work Instruction Reference
// ============================================================================

function renderWorkInstructionRef(doc: PDFDoc, data: ClosedWOPackData): void {
  const executions = data.workInstructionExecutions;
  if (!executions || executions.length === 0) {
    ensureSpace(doc, 20);
    drawSectionHeader(doc, '10. Work Instruction Reference');
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No work instruction executions recorded for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  ensureSpace(doc, 40);
  drawSectionHeader(doc, '10. Work Instruction Reference');

  const headers = ['Instruction', 'Technician', 'Status', 'Steps Done', 'Duration', 'Completed'];
  const colWidths = [120, 90, 70, 60, 50, CONTENT_WIDTH - 390];
  const aligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'center', 'right', 'right', 'left'];

  const rows = executions.map((ex) => {
    const wi = ex.workInstruction as { title: string } | null;
    const tech = ex.technician as { fullName: string } | null;
    const dur = ex.totalDuration as number | null;
    return [
      safeStr(wi?.title),
      safeStr(tech?.fullName),
      formatBadgeText(safeStr(ex.status)),
      fmtNum(ex.currentStep, 0),
      dur ? fmtMinutes(dur) : '—',
      fmtDate(ex.completedAt as Date | string | null),
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
  doc.moveDown(0.3);
}

// ============================================================================
// Section 11: Failure Mode / Cause / Remedy
// ============================================================================

function renderFailureAnalysis(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  const hasFailure = wo.failureDescription || wo.causeDescription || wo.actionDescription || data.failureRecords.length > 0;
  if (!hasFailure) {
    ensureSpace(doc, 20);
    drawSectionHeader(doc, '11. Failure Mode / Cause / Remedy');
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No failure data recorded.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '11. Failure Mode / Cause / Remedy');

  if (wo.failureDescription) drawLabelValue(doc, 'Failure Description:', wo.failureDescription);
  if (wo.causeDescription) drawLabelValue(doc, 'Cause:', wo.causeDescription);
  if (wo.actionDescription) drawLabelValue(doc, 'Remedy/Action:', wo.actionDescription);

  // Failure records table
  if (data.failureRecords.length > 0) {
    doc.moveDown(0.3);
    const headers = ['Failure Mode', 'Cause', 'Severity', 'Detected', 'Resolved', 'Downtime'];
    const colWidths = [80, 150, 60, 80, 80, CONTENT_WIDTH - 450];
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

  doc.moveDown(0.3);
}

// ============================================================================
// Section 12: RCA Where Required
// ============================================================================

function renderRCA(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  ensureSpace(doc, 50);
  drawSectionHeader(doc, '12. Root Cause Analysis');

  if (!rc?.rootCause && !rc?.correctiveAction) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No formal RCA documented.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  if (rc.rootCause) drawLabelValue(doc, 'Root Cause:', safeStr(rc.rootCause));
  if (rc.correctiveAction) drawLabelValue(doc, 'Corrective Action:', safeStr(rc.correctiveAction));
  if (rc.preventiveAction) drawLabelValue(doc, 'Preventive Action:', safeStr(rc.preventiveAction));
  doc.moveDown(0.3);
}

// ============================================================================
// Section 13: Work Performed Summary
// ============================================================================

function renderWorkPerformed(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  const wo = data.workOrder;

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '13. Work Performed Summary');

  if (!rc?.findings && !rc?.completionNotes && !wo.actionDescription) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No work performed summary documented.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  if (rc?.findings) drawLabelValue(doc, 'Findings:', safeStr(rc.findings));
  if (rc?.completionNotes) drawLabelValue(doc, 'Completion Notes:', safeStr(rc.completionNotes));
  if (rc?.materialsUsedSummary) {
    try {
      const mats = typeof rc.materialsUsedSummary === 'string' ? JSON.parse(rc.materialsUsedSummary) : rc.materialsUsedSummary;
      if (Array.isArray(mats) && mats.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(FONT.kvLabel).fillColor(COLORS.textSecondary);
        doc.text('Materials Used Summary:', MARGIN, doc.y, { lineBreak: false });
        doc.moveDown(0.2);
        const headers = ['Item', 'Qty', 'Cost'];
        const colWidths = [250, 80, CONTENT_WIDTH - 330];
        const rows = mats.map((m: Record<string, unknown>) => [
          safeStr(m.name),
          fmtNum(m.qty as number | null, 1),
          fmtCurrency(m.cost as number | null, data.companyInfo.currency),
        ]);
        drawTable(doc, headers, rows, colWidths, { align: ['left', 'right', 'right'] });
      }
    } catch { /* skip */ }
  }
  doc.moveDown(0.3);
}

// ============================================================================
// Section 14: Tasks/Checklists Execution
// ============================================================================

function renderTaskExecutions(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '14. Tasks / Checklists Execution');

  if (!data.taskExecutions || data.taskExecutions.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No task checklists for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['#', 'Task', 'Type', 'Status', 'Est. Min', 'Completed By', 'Findings'];
  const colWidths = [20, 140, 60, 60, 45, 80, CONTENT_WIDTH - 405];
  const aligns: Array<'left' | 'right' | 'center'> = ['center', 'left', 'center', 'center', 'right', 'left', 'left'];

  const rows = data.taskExecutions.map((te, i) => {
    const completedBy = (te.completedBy as { fullName: string } | null)?.fullName ?? '—';
    return [
      te.taskNumber ?? i + 1,
      safeStr(te.description).substring(0, 60),
      formatBadgeText(safeStr(te.taskType)),
      formatBadgeText(safeStr(te.status)),
      fmtNum(te.estimatedMinutes as number | null),
      safeStr(completedBy),
      safeStr(te.findings).substring(0, 30),
    ];
  });

  // Summary stats
  const total = data.taskExecutions.length;
  const completed = data.taskExecutions.filter((t) => t.status === 'completed').length;
  const skipped = data.taskExecutions.filter((t) => t.status === 'skipped').length;
  const failed = data.taskExecutions.filter((t) => t.status === 'failed').length;

  doc.font('Helvetica').fontSize(FONT.small).fillColor(COLORS.textSecondary);
  doc.text(
    `Total: ${total} | Completed: ${completed} | Skipped: ${skipped} | Failed: ${failed}`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false },
  );
  doc.moveDown(0.3);

  drawTable(doc, headers, rows, colWidths, { align: aligns });
  doc.moveDown(0.3);
}

// ============================================================================
// Section 15: Labor/Time Summary
// ============================================================================

function renderLaborTimeSummary(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '15. Labor / Time Summary');

  if (!data.timeLogs || data.timeLogs.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No time logs recorded.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  // Summary stats
  const totalDuration = data.timeLogs.reduce((sum, tl) => sum + ((tl.duration as number) ?? 0), 0);
  const totalBreak = data.timeLogs.reduce((sum, tl) => sum + ((tl.breakMinutes as number) ?? 0), 0);
  const uniqueTechs = new Set(data.timeLogs.map((tl) => tl.userId as string)).size;

  doc.font('Helvetica').fontSize(FONT.small).fillColor(COLORS.textSecondary);
  doc.text(
    `Total: ${fmtNum(totalDuration, 1)}h | Breaks: ${fmtMinutes(totalBreak)} | Technicians: ${uniqueTechs}`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false },
  );
  doc.moveDown(0.3);

  const headers = ['#', 'Technician', 'Activity', 'Start', 'End', 'Hours', 'Break', 'Notes'];
  const colWidths = [20, 90, 70, 65, 65, 40, 40, CONTENT_WIDTH - 390];
  const aligns: Array<'left' | 'right' | 'center'> = ['center', 'left', 'left', 'left', 'left', 'right', 'right', 'left'];

  const rows = data.timeLogs.map((tl, i) => {
    const user = tl.user as { fullName: string } | undefined;
    const loggedBy = tl.loggedBy as { fullName: string } | null;
    const duration = (tl.duration as number | null) ?? 0;
    let notes = safeStr(tl.notes).substring(0, 30);
    if (tl.isTeamLog && loggedBy) notes = `[Via ${loggedBy.fullName}] ${notes}`;
    return [
      i + 1,
      safeStr(user?.fullName),
      formatBadgeText(safeStr(tl.activityType)),
      fmtTime(tl.startTime as Date | string | null),
      fmtTime(tl.endTime as Date | string | null),
      fmtNum(duration, 1),
      fmtMinutes(tl.breakMinutes as number | null),
      notes,
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
  doc.moveDown(0.3);
}

// ============================================================================
// Section 16: Downtime Summary
// ============================================================================

function renderDowntimeSummary(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '16. Downtime Summary');

  if (!data.downtimes || data.downtimes.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No downtime recorded.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const totalDt = data.downtimes.reduce((s, d) => s + ((d.durationMinutes as number) ?? 0), 0);
  const totalLoss = data.downtimes.reduce((s, d) => s + ((d.productionLoss as number) ?? 0), 0);
  const cur = data.companyInfo.currency;

  doc.font('Helvetica').fontSize(FONT.small).fillColor(COLORS.textSecondary);
  doc.text(
    `Total Downtime: ${fmtMinutes(totalDt)} | Production Loss: ${fmtCurrency(totalLoss, cur)}`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false },
  );
  doc.moveDown(0.3);

  const headers = ['Start', 'End', 'Duration', 'Category', 'Impact', 'Production Loss'];
  const colWidths = [95, 95, 55, 75, 60, CONTENT_WIDTH - 380];
  const aligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'right', 'center', 'center', 'right'];

  const rows = data.downtimes.map((dt) => [
    fmtDate(dt.downtimeStart as Date | string | null),
    fmtDate(dt.downtimeEnd as Date | string | null),
    fmtMinutes(dt.durationMinutes as number | null),
    formatBadgeText(safeStr(dt.category)),
    formatBadgeText(safeStr(dt.impactLevel)),
    fmtCurrency(dt.productionLoss as number | null, cur),
  ]);

  drawTable(doc, headers, rows, colWidths, { align: aligns });
  doc.moveDown(0.3);
}

// ============================================================================
// Section 17: Materials Requested/Issued/Consumed/Returned
// ============================================================================

function renderMaterials(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '17. Materials — Requested / Issued / Consumed / Returned');

  const authoritative = data.repairMaterialRequests && data.repairMaterialRequests.length > 0
    ? data.repairMaterialRequests
    : data.materials;

  if (!authoritative || authoritative.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No material requests for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const cur = data.companyInfo.currency;
  const usingRepairLedger = data.repairMaterialRequests && data.repairMaterialRequests.length > 0;

  const headers = ['Item', 'Part #', 'Requested', 'Issued', 'Consumed', 'Returned', 'Unit Cost', 'Status'];
  const colWidths = [110, 70, 50, 50, 50, 50, 60, CONTENT_WIDTH - 440];
  const aligns: Array<'left' | 'right' | 'center'> = ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'center'];

  const rows = authoritative.map((m) => {
    const record = m as Record<string, unknown>;
    if (usingRepairLedger) {
      const item = record.item as Record<string, unknown> | null;
      return [
        safeStr(record.itemName).substring(0, 50),
        safeStr(item?.itemCode),
        fmtNum(record.quantityRequested as number | null, 1),
        fmtNum(record.quantityIssued as number | null, 1),
        fmtNum(record.consumedQty as number | null, 1),
        fmtNum(record.quantityReturned as number | null, 1),
        fmtCurrency(record.unitCost as number | null, cur),
        formatBadgeText(safeStr(record.status)),
      ];
    }

    const inv = record.inventoryItem as Record<string, unknown> | null;
    return [
      safeStr(record.itemName).substring(0, 50),
      safeStr(inv?.itemCode),
      fmtNum(record.quantity as number | null, record.quantity !== null && record.quantity !== 0 && (record.quantity as number) % 1 !== 0 ? 1 : 0),
      fmtNum(record.quantityIssued as number | null, 1),
      fmtNum(record.consumedQty as number | null, 1),
      fmtNum(record.quantityReturned as number | null, 1),
      fmtCurrency(record.unitCost as number | null, cur),
      formatBadgeText(safeStr(record.status)),
    ];
  });

  drawTable(doc, headers, rows, colWidths, { align: aligns });
  doc.moveDown(0.3);
}

// ============================================================================
// Section 18: Tools Issued/Returned/Condition
// ============================================================================

function renderTools(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '18. Tools — Issued / Returned / Condition');

  const hasTools = (data.toolRequests && data.toolRequests.length > 0) ||
    (data.toolTransactions && data.toolTransactions.length > 0);

  if (!hasTools) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No tool requests or transactions for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  if (data.toolRequests.length > 0) {
    doc.font('Helvetica-Bold').fontSize(FONT.small).fillColor(COLORS.textSecondary);
    doc.text('Tool Requests:', MARGIN, doc.y, { lineBreak: false });
    doc.moveDown(0.2);

    const headers = ['Tool', 'Code', 'Qty Req', 'Qty Issued', 'Condition at Issue', 'Condition at Return', 'Status'];
    const colWidths = [85, 55, 40, 50, 75, 75, CONTENT_WIDTH - 380];

    const rows: Array<Array<string | number>> = [];
    for (const request of data.toolRequests) {
      const req = request as Record<string, unknown>;
      const items = Array.isArray(req.items) ? req.items as Array<Record<string, unknown>> : [];

      if (items.length > 0) {
        for (const item of items) {
          const itemTool = item.tool as Record<string, unknown> | null;
          rows.push([
            safeStr(item.toolName || req.toolName).substring(0, 40),
            safeStr(item.toolCode || itemTool?.toolCode),
            fmtNum(item.quantityRequested as number | null),
            fmtNum(item.quantityIssued as number | null),
            formatBadgeText(safeStr(item.conditionAtIssue || req.toolConditionAtIssue)),
            formatBadgeText(safeStr(item.conditionAtReturn || req.toolConditionAtReturn)),
            formatBadgeText(safeStr(req.status)),
          ]);
        }
      } else {
        const tool = req.tool as Record<string, unknown> | null;
        rows.push([
          safeStr(req.toolName).substring(0, 40),
          safeStr(tool?.toolCode),
          fmtNum(req.quantityRequested as number | null),
          fmtNum(req.quantityIssued as number | null),
          formatBadgeText(safeStr(req.toolConditionAtIssue)),
          formatBadgeText(safeStr(req.toolConditionAtReturn)),
          formatBadgeText(safeStr(req.status)),
        ]);
      }
    }
    drawTable(doc, headers, rows, colWidths);
  }

  if (data.toolTransactions.length > 0) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(FONT.small).fillColor(COLORS.textSecondary);
    doc.text('Tool Transactions:', MARGIN, doc.y, { lineBreak: false });
    doc.moveDown(0.2);

    const headers2 = ['Tool', 'Type', 'Performed By', 'Date', 'Notes'];
    const colWidths2 = [100, 70, 90, 80, CONTENT_WIDTH - 340];
    const rows2 = data.toolTransactions.map((tx) => {
      const tool = tx.tool as { name: string } | null;
      const performedBy = tx.performedBy as { fullName: string } | null;
      return [
        safeStr(tool?.name),
        formatBadgeText(safeStr(tx.type)),
        safeStr(performedBy?.fullName),
        fmtDate(tx.createdAt as Date | string | null),
        safeStr(tx.notes).substring(0, 45),
      ];
    });
    drawTable(doc, headers2, rows2, colWidths2);
  }

  doc.moveDown(0.3);
}

// ============================================================================
// Section 19: Measurements/Test Results
// ============================================================================

function renderMeasurements(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '19. Measurements / Test Results');

  // Check task execution findings for measurement data
  const measurementTasks = data.taskExecutions.filter(
    (t) => t.taskType === 'measure' || t.taskType === 'inspect',
  );

  if (measurementTasks.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No measurement or test tasks recorded.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['#', 'Task', 'Type', 'Status', 'Findings'];
  const colWidths = [20, 180, 60, 60, CONTENT_WIDTH - 320];

  const rows = measurementTasks.map((t, i) => {
    const completedBy = (t.completedBy as { fullName: string } | null)?.fullName ?? '—';
    return [
      i + 1,
      safeStr(t.description).substring(0, 80),
      formatBadgeText(safeStr(t.taskType)),
      formatBadgeText(safeStr(t.status)),
      `${safeStr(t.findings).substring(0, 60)} (by ${completedBy})`,
    ];
  });

  drawTable(doc, headers, rows, colWidths);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 20: Attachments/Evidence Index
// ============================================================================

function renderAttachmentsIndex(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '20. Attachments / Evidence Index');

  if (!data.attachments || data.attachments.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No attachments uploaded for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['#', 'File Name', 'Type', 'Size', 'Uploaded By', 'Date', 'Description'];
  const colWidths = [20, 100, 65, 50, 70, 65, CONTENT_WIDTH - 370];

  const rows = data.attachments.map((a, i) => {
    const uploader = a.uploadedBy as { fullName: string } | null;
    return [
      i + 1,
      safeStr(a.fileName).substring(0, 45),
      safeStr(a.fileType).substring(0, 20),
      fmtFileSize(a.fileSize as number),
      safeStr(uploader?.fullName),
      fmtDateShort(a.uploadedAt as Date | string | null),
      safeStr(a.description).substring(0, 30),
    ];
  });

  drawTable(doc, headers, rows, colWidths);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 21: Assistance Requests
// ============================================================================

function renderAssistanceRequests(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '21. Assistance Requests');

  if (!data.assistanceRequests || data.assistanceRequests.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No assistance requests for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['Requested By', 'Trade/Skill', 'Role', 'Status', 'Requested At', 'Resolved At'];
  const colWidths = [90, 80, 70, 70, 90, CONTENT_WIDTH - 400];

  const rows = data.assistanceRequests.map((ar) => {
    const reqBy = ar.requestedBy as { fullName: string } | null;
    const reqUser = ar.requestedUser as { fullName: string } | null;
    return [
      safeStr(reqBy?.fullName),
      safeStr(ar.requestedTrade || (reqUser ? `For: ${reqUser.fullName}` : '')),
      formatBadgeText(safeStr(ar.role)),
      formatBadgeText(safeStr(ar.status)),
      fmtDate(ar.createdAt as Date | string | null),
      fmtDate(ar.resolvedAt as Date | string | null),
    ];
  });

  drawTable(doc, headers, rows, colWidths);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 22: Shift Handovers
// ============================================================================

function renderShiftHandovers(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '22. Shift Handovers');

  if (!data.shiftHandovers || data.shiftHandovers.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No shift handovers recorded for this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['Shift Date', 'From Shift', 'To Shift', 'Handed Over By', 'Received By', 'Status'];
  const colWidths = [80, 60, 60, 90, 90, CONTENT_WIDTH - 380];

  const rows = data.shiftHandovers.map((sh) => {
    const from = sh.handedOverBy as { fullName: string } | null;
    const to = sh.receivedBy as { fullName: string } | null;
    return [
      fmtDateShort(sh.shiftDate as Date | string | null),
      formatBadgeText(safeStr(sh.fromShift)),
      formatBadgeText(safeStr(sh.toShift)),
      safeStr(from?.fullName),
      safeStr(to?.fullName),
      formatBadgeText(safeStr(sh.status)),
    ];
  });

  drawTable(doc, headers, rows, colWidths);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 23: Rework History
// ============================================================================

function renderReworkHistory(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '23. Rework History');

  const rc = data.repairCompletion;
  const reworkCount = (rc?.reworkCount as number) ?? 0;

  if (reworkCount === 0 && !rc?.reworkReason) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No rework performed on this work order.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const rowH = 14;
  const startY = doc.y;
  const rows: Array<[string, string]> = [
    ['Rework Count:', fmtNum(reworkCount)],
    ['Rework Reason:', safeStr(rc?.reworkReason)],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 24: Completion Details
// ============================================================================

function renderCompletionDetails(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  const wo = data.workOrder;

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '24. Completion Details');

  const rowH = 14;
  const startY = doc.y;
  const cur = data.companyInfo.currency;

  const supBy = (rc?.supervisorApprovedBy as { fullName: string } | null)?.fullName ?? '—';
  const planBy = (rc?.plannerClosedBy as { fullName: string } | null)?.fullName ?? '—';

  const rows: Array<[string, string]> = [
    ['Total Labor Hours:', fmtNum(rc?.totalLaborHours as number | null, 1)],
    ['Total Material Cost:', fmtCurrency(rc?.totalMaterialCost as number | null, cur)],
    ['Total Tool Cost:', fmtCurrency(rc?.totalToolCost as number | null, cur)],
    ['Total Downtime:', fmtMinutes(rc?.totalDowntimeMinutes as number | null)],
    ['Supervisor Approval:', formatBadgeText(safeStr(rc?.supervisorStatus))],
    ['Approved By:', supBy],
    ['Approved At:', fmtDate(rc?.supervisorApprovedAt as Date | string | null)],
    ['Supervisor Notes:', safeStr(rc?.supervisorReviewNotes).substring(0, 80)],
    ['Planner Status:', formatBadgeText(safeStr(rc?.plannerStatus))],
    ['Closed By:', planBy],
    ['Closed At:', fmtDate(rc?.plannerClosedAt as Date | string | null)],
    ['Closure Notes:', safeStr(rc?.closureNotes).substring(0, 80)],
    ['WO Locked:', wo.isLocked ? `Yes — ${safeStr(wo.lockReason)}` : 'No'],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 25: Supervisor Verification
// ============================================================================

function renderSupervisorVerification(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  ensureSpace(doc, 50);
  drawSectionHeader(doc, '25. Supervisor Verification');

  if (!rc?.supervisorReviewNotes && !rc?.supervisorApprovedAt) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No supervisor verification recorded.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const rowH = 14;
  const startY = doc.y;
  const supBy = (rc?.supervisorApprovedBy as { fullName: string } | null)?.fullName ?? '—';
  const rows: Array<[string, string]> = [
    ['Status:', formatBadgeText(safeStr(rc?.supervisorStatus))],
    ['Verified By:', supBy],
    ['Verified At:', fmtDate(rc?.supervisorApprovedAt as Date | string | null)],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 4;

  if (rc?.supervisorReviewNotes) {
    drawLabelValue(doc, 'Review Notes:', safeStr(rc.supervisorReviewNotes));
  }

  if (rc?.reworkReason) {
    drawLabelValue(doc, 'Rework Reason:', safeStr(rc.reworkReason));
  }

  doc.moveDown(0.3);
}

// ============================================================================
// Section 26: Planner Closeout
// ============================================================================

function renderPlannerCloseout(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  const wo = data.workOrder;

  ensureSpace(doc, 50);
  drawSectionHeader(doc, '26. Planner Closeout');

  const rowH = 14;
  const startY = doc.y;
  const planBy = (rc?.plannerClosedBy as { fullName: string } | null)?.fullName ?? '—';
  const rows: Array<[string, string]> = [
    ['Status:', formatBadgeText(safeStr(rc?.plannerStatus))],
    ['Closed By:', planBy],
    ['Closed At:', fmtDate(rc?.plannerClosedAt as Date | string | null)],
    ['Closure Notes:', safeStr(rc?.closureNotes).substring(0, 100)],
    ['WO Locked:', wo.isLocked ? 'Yes' : 'No'],
    ['Lock Reason:', safeStr(wo.lockReason)],
    ['Locked At:', fmtDate(wo.lockedAt as Date | string | null)],
  ];

  for (let i = 0; i < rows.length; i++) {
    drawKVRow(doc, MARGIN, startY + i * rowH, rows[i][0], rows[i][1], CONTENT_WIDTH, rowH);
  }
  doc.y = startY + rows.length * rowH + 6;
}

// ============================================================================
// Section 27: Cost Summary (Estimated vs Planned vs Actual)
// ============================================================================

function renderCostSummary(doc: PDFDoc, data: ClosedWOPackData): void {
  const wo = data.workOrder;
  const rc = data.repairCompletion;
  const cur = data.companyInfo.currency;

  ensureSpace(doc, 100);
  drawSectionHeader(doc, '27. Cost Summary — Estimated vs Planned vs Actual');

  const startY = doc.y;
  const boxW = 300;
  const boxX = PAGE_WIDTH - MARGIN - boxW;
  const rowH = 16;

  // Background box
  doc.save();
  doc.roundedRect(boxX, startY, boxW, rowH * 5 + 4, 4)
    .lineWidth(0.5).fillAndStroke(COLORS.offWhite, COLORS.border);
  doc.restore();

  const costRows: Array<[string, string]> = [
    ['Estimated Hours:', fmtNum(wo.estimatedHours, 1)],
    ['Actual Hours:', fmtNum(wo.actualHours, 1)],
    ['Labor Cost:', fmtCurrency(wo.laborCost, cur)],
    ['Parts Cost:', fmtCurrency(wo.partsCost, cur)],
    ['Contractor Cost:', fmtCurrency(wo.contractorCost, cur)],
  ];

  for (let i = 0; i < costRows.length; i++) {
    const ry = startY + 2 + i * rowH;
    doc.font('Helvetica').fontSize(FONT.costLabel).fillColor(COLORS.textSecondary);
    doc.text(costRows[i][0], boxX + 8, ry + (rowH - FONT.costLabel) / 2, { lineBreak: false, width: 130 });
    doc.font('Helvetica-Bold').fontSize(FONT.costValue).fillColor(COLORS.text);
    doc.text(costRows[i][1], boxX + boxW - 90, ry + (rowH - FONT.costValue) / 2, {
      width: 80, align: 'right', lineBreak: false,
    });
  }

  // Divider
  const divY = startY + 2 + costRows.length * rowH;
  doc.save();
  doc.moveTo(boxX + 6, divY).lineTo(boxX + boxW - 6, divY)
    .lineWidth(0.5).strokeColor(COLORS.text).stroke();
  doc.restore();

  // Total
  const totalY = divY + 2;
  doc.font('Helvetica-Bold').fontSize(FONT.costTotalLabel).fillColor(COLORS.navy);
  doc.text('TOTAL COST:', boxX + 8, totalY + (rowH - FONT.costTotalLabel) / 2, { lineBreak: false, width: 130 });
  doc.font('Helvetica-Bold').fontSize(FONT.costTotalValue).fillColor(COLORS.emerald);
  doc.text(fmtCurrency(wo.totalCost, cur), boxX + boxW - 100, totalY + (rowH - FONT.costTotalValue) / 2, {
    width: 90, align: 'right', lineBreak: false,
  });

  doc.y = startY + rowH * 5 + 10;
  doc.x = MARGIN;
}

// ============================================================================
// Section 28: Reliability/Follow-up Recommendation
// ============================================================================

function renderReliabilityFollowup(doc: PDFDoc, data: ClosedWOPackData): void {
  const rc = data.repairCompletion;
  const wo = data.workOrder;

  ensureSpace(doc, 60);
  drawSectionHeader(doc, '28. Reliability / Follow-up Recommendation');

  const hasRecommendations = rc?.correctiveAction || rc?.preventiveAction || wo.notes;
  if (!hasRecommendations) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No formal reliability recommendations documented.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  if (rc?.correctiveAction) drawLabelValue(doc, 'Corrective Action:', safeStr(rc.correctiveAction));
  if ((rc as Record<string, unknown>)?.preventiveAction) drawLabelValue(doc, 'Preventive Action:', safeStr((rc as Record<string, unknown>).preventiveAction));
  if (wo.notes) drawLabelValue(doc, 'Additional Notes:', wo.notes);
  doc.moveDown(0.3);
}

// ============================================================================
// Section 29: Signatures
// ============================================================================

function renderSignatures(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 80);
  drawSectionHeader(doc, '29. Signatures');

  const sigY = doc.y + 4;
  const colW = (CONTENT_WIDTH - 16) / 3;
  const positions = [
    { label: 'Technician', name: data.assignee?.fullName },
    { label: 'Supervisor', name: data.supervisor?.fullName },
    { label: 'Planner', name: data.planner?.fullName },
  ];

  for (let i = 0; i < positions.length; i++) {
    const x = MARGIN + i * (colW + 8);

    doc.font('Helvetica').fontSize(FONT.signatureLabel).fillColor(COLORS.textSecondary);
    doc.text(`${positions[i].label}:`, x, sigY, { lineBreak: false });

    // Signature line
    doc.save();
    doc.moveTo(x, sigY + 18).lineTo(x + colW - 40, sigY + 18)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.restore();

    // Date line
    doc.font('Helvetica').fontSize(FONT.signatureLabel).fillColor(COLORS.textSecondary);
    doc.text('Date:', x + colW - 34, sigY, { lineBreak: false });
    doc.save();
    doc.moveTo(x + colW - 34, sigY + 18).lineTo(x + colW, sigY + 18)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.restore();

    // Pre-fill name if available
    if (positions[i].name) {
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.textMuted);
      doc.text(positions[i].name!, x + 2, sigY + 20, { lineBreak: false });
    }
  }

  doc.y = sigY + 36;
}

// ============================================================================
// Section 30: Audit/Reference Timestamps
// ============================================================================

function renderAuditTimestamps(doc: PDFDoc, data: ClosedWOPackData): void {
  ensureSpace(doc, 40);
  drawSectionHeader(doc, '30. Audit / Reference Timestamps');

  if (!data.statusHistory || data.statusHistory.length === 0) {
    doc.font('Helvetica').fontSize(FONT.bodyText).fillColor(COLORS.textMuted);
    doc.text('No status history available.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    return;
  }

  const headers = ['Timestamp', 'Status', 'Performed By', 'Reason'];
  const colWidths = [120, 90, 110, CONTENT_WIDTH - 320];

  const rows = data.statusHistory.map((sh) => {
    const perf = sh.performedBy as { fullName: string } | null;
    return [
      fmtDate(sh.createdAt as Date | string | null),
      formatBadgeText(safeStr(sh.toStatus)),
      safeStr(perf?.fullName),
      safeStr(sh.reason).substring(0, 60),
    ];
  });

  drawTable(doc, headers, rows, colWidths);
  doc.moveDown(0.3);

  // Document-level metadata
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(FONT.timestamp).fillColor(COLORS.textMuted);
  doc.text(
    `Document generated at ${fmtDate(data.generatedAt)} | This is an auditable closed work order pack | iAssetsPro EAM`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: true },
  );
  doc.moveDown(0.3);
}

// ============================================================================
// Footers
// ============================================================================

function addFooters(doc: PDFDoc, data: ClosedWOPackData): void {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageH = doc.page.height;

    const sepY = pageH - MARGIN + 2;
    doc.save();
    doc.moveTo(MARGIN, sepY).lineTo(PAGE_WIDTH - MARGIN, sepY)
      .lineWidth(0.5).strokeColor(COLORS.border).stroke();

    const genText = `CLOSED WO PACK | ${data.workOrder.woNumber} | ${data.companyInfo.name || 'iAssetsPro'} CMMS | Generated: ${fmtDate(data.generatedAt)}`;
    doc.font('Helvetica').fontSize(FONT.footer).fillColor(COLORS.textMuted);
    doc.text(genText, MARGIN, sepY + 5, { lineBreak: false });

    const pageText = `Page ${i + 1} of ${range.count}`;
    doc.text(pageText, MARGIN, sepY + 5, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
    doc.restore();
  }
}

// ============================================================================
// Main exported function
// ============================================================================

export async function generateClosedWOPackPDF(data: ClosedWOPackData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = createDoc({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: `Closed WO Pack — ${data.workOrder.woNumber}`,
          Creator: 'iAssetsPro EAM',
          CreationDate: data.generatedAt,
          Subject: `Comprehensive closed work order pack for ${data.workOrder.woNumber}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Render all 30 sections in order ──
      renderHeader(doc, data);
      doc.moveDown(0.3);

      renderWOIdentification(doc, data);
      renderMaintenanceRequest(doc, data);
      renderAssetComponent(doc, data);
      renderLocation(doc, data);
      renderPriority(doc, data);
      renderPlannerSupervisor(doc, data);
      renderTeamInfo(doc, data);
      renderWorkDescription(doc, data);
      renderWorkInstructionRef(doc, data);
      renderFailureAnalysis(doc, data);
      renderRCA(doc, data);
      renderWorkPerformed(doc, data);
      renderTaskExecutions(doc, data);
      renderLaborTimeSummary(doc, data);
      renderDowntimeSummary(doc, data);
      renderMaterials(doc, data);
      renderTools(doc, data);
      renderMeasurements(doc, data);
      renderAttachmentsIndex(doc, data);
      renderAssistanceRequests(doc, data);
      renderShiftHandovers(doc, data);
      renderReworkHistory(doc, data);
      renderCompletionDetails(doc, data);
      renderSupervisorVerification(doc, data);
      renderPlannerCloseout(doc, data);
      renderCostSummary(doc, data);
      renderReliabilityFollowup(doc, data);
      renderSignatures(doc, data);
      renderAuditTimestamps(doc, data);

      // ── Footers on all pages ──
      addFooters(doc, data);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
