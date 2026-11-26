/**
 * Site scans are as-built EXTERIOR SURFACE EVIDENCE, never exploded OEM CAD.
 * glTF 2.0 vertices must already be expressed in metres. The uploader must
 * confirm export scale using a real-world measured physical reference.
 */
export const SITE_SCAN_METHODS = ['lidar', 'photogrammetry', 'structured-light', 'hybrid'] as const;
export type SiteScanMethod = typeof SITE_SCAN_METHODS[number];
export interface SiteScanCapture {
  method: SiteScanMethod;
  capturedAt: string;
  device: string;
  sourceUnit: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  metreScaleReference: string;
  visibleSurfacesOnly: true;
  geometryUnits: 'm';
  sourceVerifiedAgainstPhysicalMachine: false;
}
const UNITS = ['mm','cm','m','in','ft'];

export function validateSiteScanCapture(input: Record<string, unknown>, now = new Date()): SiteScanCapture {
  const method = String(input.method || '');
  if (!SITE_SCAN_METHODS.includes(method as SiteScanMethod)) {
    throw new Error('Choose LiDAR, photogrammetry, structured light or hybrid capture');
  }
  const capturedAt = String(input.capturedAt || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
    throw new Error('Record the actual machine scan capture date');
  }
  const date = new Date(capturedAt + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== capturedAt ||
      date.getTime() > now.getTime() + 86400000 || date.getUTCFullYear() < 2000) {
    throw new Error('Scan capture date is invalid or in the future');
  }
  const device = String(input.device || '').trim();
  if (device.length < 3 || device.length > 140 || /[\x00-\x1f\x7f]/.test(device)) {
    throw new Error('Identify the actual capture device or scanner');
  }
  const sourceUnit = String(input.sourceUnit || '');
  if (!UNITS.includes(sourceUnit)) {
    throw new Error('Document original scanner measurement units');
  }
  const metreScaleReference = String(input.metreScaleReference || '').trim();
  if (metreScaleReference.length < 12 || metreScaleReference.length > 400) {
    throw new Error('Document the measured reference used to validate GLB metre scale');
  }
  if (input.metresConfirmed !== true || input.visibleSurfacesOnly !== true) {
    throw new Error('Confirm the GLB is in metres and only captures visible physical surfaces');
  }
  return {
    method: method as SiteScanMethod,
    capturedAt, device, sourceUnit: sourceUnit as SiteScanCapture['sourceUnit'],
    metreScaleReference, visibleSurfacesOnly: true,
    geometryUnits:'m', sourceVerifiedAgainstPhysicalMachine:false,
  };
}

export type ScanPoint = { x: number; y: number; z: number };
export function validatedScanPoint(input: unknown): ScanPoint {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Choose a position directly on the 3D scan');
  }
  const point = input as Record<string, unknown>;
  const position = [point.x, point.y, point.z];
  if (position.some(x => typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 500)) {
    throw new Error('Invalid scan model-space coordinates in metres');
  }
  return {x:Number(Number(point.x).toFixed(5)),
    y:Number(Number(point.y).toFixed(5)),
    z:Number(Number(point.z).toFixed(5))};
}

export function scanCaptureFromAudit(value: string | null | undefined): SiteScanCapture | null {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>;
    if (parsed.sourceOrigin !== 'site-owned-scan' ||
        typeof parsed.scanCapture !== 'object' || !parsed.scanCapture) return null;
    const result = parsed.scanCapture as SiteScanCapture;
    if (!SITE_SCAN_METHODS.includes(result.method) || result.geometryUnits !== 'm' ||
        result.visibleSurfacesOnly !== true) return null;
    return result;
  } catch { return null; }
}
