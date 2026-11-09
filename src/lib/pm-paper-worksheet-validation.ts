export interface ManagedPaperIssue {
  reference: string;
  assetId: string;
  plantId: string;
  equipmentState: string;
  pointIds: string; // immutable serialized JSON snapshot of point IDs
  issuedAt: Date;
}

/** Validate the physical time and scope of each returned system-issued worksheet.
 * An external legacy sheet never passes through this helper.
 */
export function validateManagedPaperReading(
  issue: ManagedPaperIssue | null,
  submitted: {
    reference: string;
    assetId: string;
    plantId: string;
    equipmentState: string | null;
    pointId: string;
    fieldInspectedAt: Date | null;
  },
): string | null {
  if (!issue || issue.reference !== submitted.reference) {
    return 'Issued worksheet reference not found';
  }
  if (issue.assetId !== submitted.assetId || issue.plantId !== submitted.plantId
    || issue.equipmentState !== submitted.equipmentState) {
    return 'Issued worksheet belongs to another machine, plant or operating state';
  }
  let points: unknown;
  try {
    points = JSON.parse(issue.pointIds);
  } catch {
    return 'Issued worksheet point snapshot is invalid';
  }
  if (!Array.isArray(points) || !points.includes(submitted.pointId)) {
    return 'Inspection point was not included on the issued paper worksheet';
  }
  if (!submitted.fieldInspectedAt
    || submitted.fieldInspectedAt.getTime() < issue.issuedAt.getTime() - 5 * 60_000) {
    return 'Physical inspection time cannot be before the worksheet was issued';
  }
  return null;
}
