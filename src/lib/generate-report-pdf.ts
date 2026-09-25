import PDFDocument from 'pdfkit';

// ============================================================
// Types
// ============================================================

export interface ReportPDFParams {
  title: string;
  subtitle?: string;
  generatedBy: string;
  generatedAt: Date;
  filters?: Record<string, string>;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  type: 'summary-cards' | 'table' | 'key-value' | 'text';
  data: unknown;
}

interface SummaryCard {
  label: string;
  value: string | number;
  subLabel?: string;
}

interface TableData {
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  columnAlignments?: Array<'left' | 'right' | 'center'>;
}

interface KeyValueItem {
  key: string;
  value: string;
}

// ============================================================
// Constants
// ============================================================

const COLORS = {
  headerBg: '#1e293b',
  headerText: '#ffffff',
  sectionTitle: '#0f172a',
  tableHeaderBg: '#334155',
  tableHeaderText: '#ffffff',
  tableAltRow: '#f8fafc',
  tableRow: '#ffffff',
  accent: '#059669',
  accentLight: '#ecfdf5',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  cardValue: '#0f172a',
  cardLabel: '#64748b',
  divider: '#e2e8f0',
  white: '#ffffff',
} as const;

const FONT_SIZES = {
  reportTitle: 20,
  subtitle: 11,
  sectionTitle: 14,
  tableHeader: 9,
  tableBody: 8,
  cardValue: 16,
  cardLabel: 8,
  cardSubLabel: 7,
  bodyText: 9,
  filterKey: 8,
  filterValue: 8,
  footer: 7,
  headerTitle: 14,
  pageNumber: 7,
  kvKey: 9,
  kvValue: 9,
} as const;

const MARGIN = 40;
const CARD_GAP = 10;
const CARDS_PER_ROW = 4;
const TABLE_ROW_HEIGHT = 22;
const TABLE_HEADER_HEIGHT = 24;
const FOOTER_RESERVE = 30;
const CARD_HEIGHT = 58;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const HEADER_BAR_HEIGHT = 50;

// ============================================================
// Type aliases for brevity
// ============================================================

type PDFDoc = PDFKit.PDFDocument;
type PDFOptions = PDFKit.PDFDocumentOptions;

// ============================================================
// Exported helper functions
// ============================================================

export function formatCurrency(value: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ============================================================
// Internal helpers
// ============================================================

function safeString(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function isNumericColumn(values: Array<string | number | null | undefined>): boolean {
  const nonEmpty = values.filter((v) => v != null && v !== '');
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => typeof v === 'number' || !Number.isNaN(Number(v)));
}

/** Create a new PDFDocument instance with proper typing. */
function createDoc(options?: PDFOptions): PDFDoc {
  return new (PDFDocument as unknown as new (opts?: PDFOptions) => PDFDoc)(options);
}

/** Check whether there is enough vertical space on the current page; add a new page if not. */
function ensureSpace(doc: PDFDoc, neededHeight: number): void {
  const maxY = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE;
  if (doc.y + neededHeight > maxY) {
    doc.addPage();
  }
}

/** Format a Date for the footer line. */
function formatFooterDate(d: Date): string {
  const dateStr = d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateStr} at ${timeStr}`;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================
// Renderers – Header / Filters / Footer
// ============================================================

function renderHeader(doc: PDFDoc, params: ReportPDFParams): void {
  // Dark slate header bar across the full page width
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, HEADER_BAR_HEIGHT).fill(COLORS.headerBg);

  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.headerTitle);
  doc.fillColor(COLORS.headerText);
  doc.text(
    params.title,
    MARGIN,
    (HEADER_BAR_HEIGHT - FONT_SIZES.headerTitle) / 2,
    { width: CONTENT_WIDTH, lineBreak: true },
  );
  doc.restore();

  // Position cursor below the header bar, inside the margin
  doc.y = HEADER_BAR_HEIGHT + MARGIN;
  doc.x = MARGIN;

  // Subtitle
  if (params.subtitle) {
    doc.font('Helvetica').fontSize(FONT_SIZES.subtitle);
    doc.fillColor(COLORS.textSecondary);
    doc.text(params.subtitle, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }

  // Generated timestamp
  doc.font('Helvetica').fontSize(FONT_SIZES.subtitle);
  doc.fillColor(COLORS.textMuted);
  doc.text(formatDateLong(params.generatedAt), MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.5);
}

function renderFilters(doc: PDFDoc, filters: Record<string, string>): void {
  const entries = Object.entries(filters).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return;

  const rowHeight = 18;
  const rowCount = Math.ceil(entries.length / 2);
  const totalHeight = rowHeight * rowCount + 16;

  ensureSpace(doc, totalHeight + 10);

  const startY = doc.y;

  doc.save();
  doc.roundedRect(MARGIN, startY, CONTENT_WIDTH, totalHeight, 4).fill(COLORS.accentLight);

  let col = 0;
  let rowY = startY + 8;

  for (const [key, value] of entries) {
    const xPos = MARGIN + col * (CONTENT_WIDTH / 2);

    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.filterKey);
    doc.fillColor(COLORS.textSecondary);
    doc.text(`${key}: `, xPos, rowY, { continued: true, width: CONTENT_WIDTH / 2 });

    doc.font('Helvetica').fontSize(FONT_SIZES.filterValue);
    doc.fillColor(COLORS.text);
    doc.text(safeString(value), { width: CONTENT_WIDTH / 2 });

    col++;
    if (col >= 2) {
      col = 0;
      rowY += rowHeight;
    }
  }

  doc.restore();

  doc.y = startY + totalHeight + 10;
  doc.x = MARGIN;
}

function addPageNumbersAndFooter(doc: PDFDoc, params: ReportPDFParams): void {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageHeight = doc.page.height;

    const separatorY = pageHeight - MARGIN + 2;
    const textY = pageHeight - MARGIN + 7;

    // Thin separator line above footer
    doc.save();
    doc
      .moveTo(MARGIN, separatorY)
      .lineTo(PAGE_WIDTH - MARGIN, separatorY)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();
    doc.restore();

    // Footer: "Generated by … | date" on the left
    const footerText = `Generated by ${params.generatedBy} | ${formatFooterDate(params.generatedAt)}`;

    doc.font('Helvetica').fontSize(FONT_SIZES.footer);
    doc.fillColor(COLORS.textMuted);
    doc.text(footerText, MARGIN, textY, { lineBreak: false });

    // Page number on the right (same baseline)
    const pageNumText = `Page ${i + 1} of ${range.count}`;
    doc.text(pageNumText, MARGIN, textY, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
  }
}

// ============================================================
// Renderers – Section types
// ============================================================

function renderSummaryCards(doc: PDFDoc, cards: SummaryCard[]): void {
  if (!Array.isArray(cards) || cards.length === 0) return;

  const cardsPerRow = Math.min(CARDS_PER_ROW, Math.max(1, cards.length));
  const cardWidth = (CONTENT_WIDTH - (cardsPerRow - 1) * CARD_GAP) / cardsPerRow;

  for (let i = 0; i < cards.length; i++) {
    const col = i % cardsPerRow;
    const isLastInRow = col === cardsPerRow - 1 || i === cards.length - 1;

    // If starting a new row, ensure enough space
    if (col === 0) {
      ensureSpace(doc, CARD_HEIGHT + 10);
    }

    const cardX = MARGIN + col * (cardWidth + CARD_GAP);
    const cardY = doc.y;
    const padX = 10;
    const padY = 10;

    // Card background + border
    doc.save();
    doc
      .roundedRect(cardX, cardY, cardWidth, CARD_HEIGHT, 4)
      .lineWidth(1)
      .fillAndStroke(COLORS.cardBg, COLORS.cardBorder);

    // Label
    doc.font('Helvetica').fontSize(FONT_SIZES.cardLabel);
    doc.fillColor(COLORS.cardLabel);
    doc.text(safeString(cards[i].label), cardX + padX, cardY + padY, {
      width: cardWidth - 2 * padX,
      lineBreak: true,
    });

    // Value (large bold)
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.cardValue);
    doc.fillColor(COLORS.cardValue);
    doc.text(safeString(cards[i].value), cardX + padX, cardY + padY + 16, {
      width: cardWidth - 2 * padX,
      lineBreak: true,
    });

    // Sub-label (optional)
    if (cards[i].subLabel) {
      doc.font('Helvetica').fontSize(FONT_SIZES.cardSubLabel);
      doc.fillColor(COLORS.accent);
      doc.text(safeString(cards[i].subLabel), cardX + padX, cardY + padY + 38, {
        width: cardWidth - 2 * padX,
        lineBreak: true,
      });
    }

    doc.restore();

    if (isLastInRow) {
      doc.y = cardY + CARD_HEIGHT + 8;
      doc.x = MARGIN;
    }
  }
}

function renderTable(doc: PDFDoc, data: TableData): void {
  if (!data?.headers || data.headers.length === 0) return;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const colCount = data.headers.length;
  const colWidth = CONTENT_WIDTH / colCount;

  // Empty state
  if (rows.length === 0) {
    ensureSpace(doc, 20);
    doc.font('Helvetica').fontSize(FONT_SIZES.bodyText);
    doc.fillColor(COLORS.textMuted);
    doc.text('No data available.', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(1);
    return;
  }

  // Determine column alignments (numbers right, text left)
  const alignments: Array<'left' | 'right' | 'center'> = data.columnAlignments
    ? [...data.columnAlignments]
    : [];
  for (let c = 0; c < colCount; c++) {
    if (!alignments[c]) {
      const colValues = rows.map((r) => (Array.isArray(r) ? r[c] : null));
      alignments[c] = isNumericColumn(colValues) ? 'right' : 'left';
    }
  }

  // -- Draw table header (reusable for new pages) --
  const drawTableHeader = (): void => {
    const y = doc.y;
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, TABLE_HEADER_HEIGHT).fill(COLORS.tableHeaderBg);

    for (let c = 0; c < colCount; c++) {
      const xPos = MARGIN + c * colWidth;
      doc.font('Helvetica-Bold').fontSize(FONT_SIZES.tableHeader);
      doc.fillColor(COLORS.tableHeaderText);
      doc.text(safeString(data.headers[c]), xPos + 6, y + (TABLE_HEADER_HEIGHT - FONT_SIZES.tableHeader) / 2, {
        width: colWidth - 12,
        align: alignments[c] || 'left',
        lineBreak: true,
      });
    }

    doc.restore();
    doc.y = y + TABLE_HEADER_HEIGHT;
  };

  // -- Draw a single data row --
  const drawRow = (row: Array<string | number | null | undefined>, rowIndex: number): void => {
    const y = doc.y;
    const bgColor = rowIndex % 2 === 0 ? COLORS.tableRow : COLORS.tableAltRow;

    doc.save();
    // Row background
    doc.rect(MARGIN, y, CONTENT_WIDTH, TABLE_ROW_HEIGHT).fill(bgColor);

    // Bottom border
    doc
      .moveTo(MARGIN, y + TABLE_ROW_HEIGHT)
      .lineTo(MARGIN + CONTENT_WIDTH, y + TABLE_ROW_HEIGHT)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();

    // Cell text
    for (let c = 0; c < colCount; c++) {
      const cellValue = Array.isArray(row) ? row[c] : null;
      const xPos = MARGIN + c * colWidth;
      const align = alignments[c] || 'left';

      doc.font('Helvetica').fontSize(FONT_SIZES.tableBody);
      doc.fillColor(COLORS.text);
      doc.text(safeString(cellValue), xPos + 6, y + (TABLE_ROW_HEIGHT - FONT_SIZES.tableBody) / 2, {
        width: colWidth - 12,
        align,
        lineBreak: true,
      });
    }

    doc.restore();
    doc.y = y + TABLE_ROW_HEIGHT;
  };

  // -- Render the full table with content-aware pagination --
  // Start on the current page whenever the header + at least one row fits.
  ensureSpace(doc, TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT + 10);
  drawTableHeader();

  for (let r = 0; r < rows.length; r++) {
    if (doc.y + TABLE_ROW_HEIGHT > doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE) {
      doc.addPage();
      drawTableHeader();
    }
    drawRow(rows[r], r);
  }

  doc.moveDown(0.5);
}

function renderKeyValue(doc: PDFDoc, items: KeyValueItem[] | Record<string, string>): void {
  let entries: KeyValueItem[];

  if (Array.isArray(items)) {
    entries = items.map((item) => ({
      key: String(item.key ?? ''),
      value: String(item.value ?? ''),
    }));
  } else if (typeof items === 'object' && items !== null) {
    entries = Object.entries(items as Record<string, string>).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
  } else {
    return;
  }

  if (entries.length === 0) return;

  const rowHeight = 24;

  for (const item of entries) {
    ensureSpace(doc, rowHeight);

    const y = doc.y;

    doc.save();

    // Separator line
    doc
      .moveTo(MARGIN, y + rowHeight)
      .lineTo(MARGIN + CONTENT_WIDTH, y + rowHeight)
      .lineWidth(0.5)
      .strokeColor(COLORS.divider)
      .stroke();

    // Key (bold, left)
    doc.font('Helvetica-Bold').fontSize(FONT_SIZES.kvKey);
    doc.fillColor(COLORS.text);
    const keyStr = safeString(item.key);
    const keyWidth = doc.widthOfString(keyStr);

    // Reserve at most 30% of width for key
    const keyColumnWidth = Math.max(keyWidth + 10, CONTENT_WIDTH * 0.15);
    const keyMaxWidth = Math.min(keyColumnWidth, CONTENT_WIDTH * 0.35);

    doc.text(keyStr, MARGIN, y + (rowHeight - FONT_SIZES.kvKey) / 2, {
      width: keyMaxWidth,
      lineBreak: false,
    });

    // Value (right side)
    doc.font('Helvetica').fontSize(FONT_SIZES.kvValue);
    doc.fillColor(COLORS.textSecondary);
    doc.text(safeString(item.value), MARGIN + keyMaxWidth + 8, y + (rowHeight - FONT_SIZES.kvValue) / 2, {
      width: CONTENT_WIDTH - keyMaxWidth - 8,
      lineBreak: true,
    });

    doc.restore();

    doc.y = y + rowHeight;
  }

  doc.moveDown(0.5);
}

function renderTextSection(doc: PDFDoc, content: string): void {
  if (!content) return;

  ensureSpace(doc, 30);

  doc.font('Helvetica').fontSize(FONT_SIZES.bodyText);
  doc.fillColor(COLORS.text);
  doc.text(content, MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: true });
  doc.moveDown(0.5);
}

// ============================================================
// Section dispatcher
// ============================================================

function renderSection(doc: PDFDoc, section: ReportSection): void {
  if (!section) return;

  // Ensure at least enough space for the section title
  ensureSpace(doc, 30);

  // Section title
  doc.font('Helvetica-Bold').fontSize(FONT_SIZES.sectionTitle);
  doc.fillColor(COLORS.sectionTitle);
  doc.text(safeString(section.title), MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.5);

  switch (section.type) {
    case 'summary-cards':
      renderSummaryCards(doc, Array.isArray(section.data) ? (section.data as SummaryCard[]) : []);
      break;
    case 'table':
      renderTable(doc, section.data as TableData);
      break;
    case 'key-value':
      renderKeyValue(doc, section.data as KeyValueItem[] | Record<string, string>);
      break;
    case 'text':
      renderTextSection(doc, typeof section.data === 'string' ? section.data : '');
      break;
    default:
      // Unknown section type – skip silently
      break;
  }
}

// ============================================================
// Main exported function
// ============================================================

export async function generateReportPDF(params: ReportPDFParams): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = createDoc({
        size: 'A4',
        layout: 'portrait',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: params.title,
          Creator: params.generatedBy,
          CreationDate: params.generatedAt,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Header ──
      renderHeader(doc, params);

      // ── Filters ──
      if (params.filters && Object.keys(params.filters).length > 0) {
        renderFilters(doc, params.filters);
      }

      doc.moveDown(0.5);

      // ── Sections ──
      const sections = Array.isArray(params.sections) ? params.sections : [];
      for (const section of sections) {
        renderSection(doc, section);
        doc.moveDown(1);
      }

      // ── Page numbers & footer (drawn last on every buffered page) ──
      addPageNumbersAndFooter(doc, params);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
