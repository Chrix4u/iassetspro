/** User-selected camera direction for *actual* machine photographs.
 * No direction can be inferred from an image or treated as OEM geometry.
 */
export const MACHINE_PHOTO_VIEWPOINTS = ['front','back','left','right','top','other'] as const;
export type MachinePhotoViewpoint = typeof MACHINE_PHOTO_VIEWPOINTS[number];

export function isMachinePhotoViewpoint(value: unknown): value is MachinePhotoViewpoint {
  return typeof value === 'string' && (MACHINE_PHOTO_VIEWPOINTS as readonly string[]).includes(value);
}

export function machinePhotoViewpoint(raw: unknown): MachinePhotoViewpoint {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return 'other'; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'other';
  const angle = (parsed as { viewpoint?: unknown }).viewpoint;
  return isMachinePhotoViewpoint(angle) ? angle : 'other';
}

export function machinePhotoViewLabel(cameraData: unknown): string {
  const viewpoint = machinePhotoViewpoint(cameraData);
  return viewpoint === 'other' ? 'Unspecified view'
    : viewpoint.charAt(0).toUpperCase() + viewpoint.slice(1) + ' elevation';
}
