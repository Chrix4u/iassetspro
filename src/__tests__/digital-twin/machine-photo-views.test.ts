import { describe, it, expect } from 'vitest';
import {readFileSync} from 'node:fs';
import {MACHINE_PHOTO_VIEWPOINTS, isMachinePhotoViewpoint,
  machinePhotoViewpoint, machinePhotoViewLabel} from '@/lib/machine-photo-views';

describe('explicit machine-photo camera elevations', () => {
  it('accepts only the six supported labels, including unspecified legacy photos', () => {
    expect(MACHINE_PHOTO_VIEWPOINTS).toEqual(['front','back','left','right','top','other']);
    expect(isMachinePhotoViewpoint('front')).toBe(true);
    expect(isMachinePhotoViewpoint('back')).toBe(true);
    expect(isMachinePhotoViewpoint('left')).toBe(true);
    expect(isMachinePhotoViewpoint('right')).toBe(true);
    expect(isMachinePhotoViewpoint('top')).toBe(true);
    expect(isMachinePhotoViewpoint('FRONT')).toBe(false);
    expect(isMachinePhotoViewpoint('../../untrusted')).toBe(false);
    expect(isMachinePhotoViewpoint(null)).toBe(false);
  });
  it('reads view labels only from explicit JSON metadata, never guesses', () => {
    expect(machinePhotoViewpoint('{"viewpoint":"front"}')).toBe('front');
    expect(machinePhotoViewpoint({viewpoint:'back'})).toBe('back');
    expect(machinePhotoViewpoint('{}')).toBe('other');
    expect(machinePhotoViewpoint('{bad json')).toBe('other');
    expect(machinePhotoViewpoint('{"viewpoint":"up"}')).toBe('other');
    expect(machinePhotoViewpoint(null)).toBe('other');
    expect(machinePhotoViewLabel('{"viewpoint":"top"}')).toBe('Top elevation');
    expect(machinePhotoViewLabel(null)).toBe('Unspecified view');
  });

  it('keeps independent photo/elevation selection and validates stored viewpoint at upload',()=>{
    const explorer=readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx','utf8');
    const uploader=readFileSync('src/app/api/component-visuals/upload/route.ts','utf8');
    const registration=readFileSync('src/app/api/component-visuals/route.ts','utf8');
    expect(explorer).toContain('aria-label="Machine photograph elevations"');
    expect(explorer).toContain('photoOptions.map(');
    expect(explorer).toContain('setSelectedPhotoId(photo.id)');
    expect(explorer).toContain('machinePhotoViewLabel(photo.cameraData)');
    expect(explorer).toContain("form.append('viewpoint',photoViewpoint)");
    expect(explorer).toContain("cameraData:{viewpoint:photoViewpoint}");
    expect(uploader).toContain("isMachinePhotoViewpoint(viewpoint)");
    expect(uploader).toContain("cameraData:JSON.stringify({viewpoint})");
    expect(registration).toContain("isMachinePhotoViewpoint((cameraData as {viewpoint?:unknown})?.viewpoint)");
  });
});
