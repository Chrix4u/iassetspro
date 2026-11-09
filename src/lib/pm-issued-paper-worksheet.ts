import { randomUUID } from 'node:crypto';

export interface IssuedPaperWorksheet {
  reference: string;
  assetId: string;
  plantId: string;
  equipmentState: string;
  pointIds: unknown;
  issuedAt: Date;
}

const MANAGED_REF = /^PMI-\d{8}-[0-9A-F]{16}$/;

/** Each button press is a distinct server-audited issue, not proof that paper was signed. */
export function newIssuedWorksheetReference(now = new Date(), uuid = randomUUID()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return 'PMI-' + day + '-' + uuid.replace(/-/g, '').slice(0, 16).toUpperCase();
}
export function hasSystemWorksheetPrefix(reference: string): boolean {
  return reference.toUpperCase().startsWith('PMI-');
}
export function isIssuedWorksheetReference(reference: string): boolean {
  return MANAGED_REF.test(reference);
}

/** Reject reuse of another machine/state/check or any handwritten pre-issue dates.
 * Old externally numbered forms are intentionally handled by the legacy paper mode.
 */
export function validateIssuedWorksheetUse(
  issued: IssuedPaperWorksheet | null,
  input: {
    reference: string;
    assetId: string;
    plantId: string;
    equipmentState: string | null;
    pointId: string;
    fieldInspectedAt: Date | null;
  },
): string | null {
  if (!isIssuedWorksheetReference(input.reference)) {
    return 'Invalid system-issued paper inspection reference';
  }
  if (!issued || issued.reference !== input.reference) {
    return 'System-issued paper worksheet was not found. Check the printed reference.';
  }
  if (issued.assetId !== input.assetId || issued.plantId !== input.plantId
    || issued.equipmentState !== input.equipmentState) {
    return 'This paper worksheet belongs to another machine or operating state.';
  }
  if (!Array.isArray(issued.pointIds) || !issued.pointIds.includes(input.pointId)) {
    return 'This inspection point was not on the issued paper worksheet.';
  }
  if (!input.fieldInspectedAt
    || input.fieldInspectedAt.getTime() < issued.issuedAt.getTime() - 5 * 60_000) {
    return 'The physical inspection time cannot predate the issue time on this worksheet.';
  }
  return null;
}
