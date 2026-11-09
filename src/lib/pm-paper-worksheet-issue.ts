/** Checks the immutable print snapshot without trusting a caller's point IDs. */
export function sameSheetScope(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length || new Set(first).size !== first.length || new Set(second).size !== second.length) return false;
  const a = [...first].sort(), b = [...second].sort();
  return a.every((id, index) => id === b[index]);
}

/** A sheet is entered only when each unique recordable inspection point has a paper-sourced record. */
export function paperSheetProgress(expected: readonly string[], observed: ReadonlySet<string>) {
  const pointIds = Array.from(new Set(expected));
  const entered = pointIds.filter((id) => observed.has(id)).length;
  const remaining = pointIds.length - entered;
  return { expected: pointIds.length, entered, remaining,
    status: pointIds.length === 0 ? 'requires_setup' : remaining === 0 ? 'entered' : entered === 0 ? 'issued' : 'partial',
  };
}

/** A printed sheet can show legacy or unconfigured checks, but only actual
 * recordable sight/instrument points can contribute to completed readings.
 */
export function isRecordablePaperPoint(point: {
  inspectionType: string;
  parameterKey?: string | null;
}): boolean {
  return point.inspectionType === 'visual'
    || (point.inspectionType === 'measurement' && Boolean(point.parameterKey?.trim()));
}
