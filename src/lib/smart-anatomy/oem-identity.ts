/**
 * Bound manufacturer CAD approval to the registered installed machine.
 * A source claim only qualifies for review when all nameplate identifiers
 * are present on the plant asset and match the claimed drawing identity.
 * This does not independently certify manufacturer licensing or geometry.
 */
export type OemNameplateIdentity = {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

export type OemSourceIdentity = {
  oemManufacturer?: unknown;
  oemModel?: unknown;
  nameplateSerial?: unknown;
  drawingRevision?: unknown;
};

function normalized(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\s+/g, ' ').toUpperCase();
  return result.length >= 2 && result.length <= 140 && !/[\x00-\x1f\x7f]/.test(result)
    ? result : null;
}

export function validateOemSourceIdentity(
  source: OemSourceIdentity,
  asset: OemNameplateIdentity,
  requireCompleteNameplate = true,
): {valid: boolean; reason: string} {
  const manufacturer = normalized(source.oemManufacturer);
  const model = normalized(source.oemModel);
  const serial = normalized(source.nameplateSerial);
  const revision = normalized(source.drawingRevision);
  if (!manufacturer || !model || !serial || !revision) {
    return { valid: false, reason: 'OEM source must identify manufacturer, exact model, drawing revision and serial' };
  }

  const actual = [normalized(asset.manufacturer), normalized(asset.model), normalized(asset.serialNumber)];
  if (requireCompleteNameplate && actual.some(value => !value)) {
    return { valid: false, reason: 'Installed asset must have its verified manufacturer, model and serial recorded before OEM approval' };
  }
  const expected = [manufacturer, model, serial];
  if (actual.some((value,i) => value !== null && value !== expected[i])) {
    return { valid: false, reason: 'OEM source does not match the registered machine nameplate' };
  }
  return { valid: true, reason: 'Source identity claim matches registered machine fields; engineer provenance review still required' };
}
