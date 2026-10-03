import type { GeometrySpec } from './programmatic-generator';

const machine = (name: string, description: string, parts: GeometrySpec['parts']): GeometrySpec => ({
  machineName: name,
  description,
  scale: 1.0,
  parts,
});

const part = (
  name: string,
  type: any,
  position: number[],
  rotation: number[],
  props: Record<string, any>,
): any => ({
  name,
  type,
  position,
  rotation,
  color: '#666666',
  metalness: 0.6,
  roughness: 0.4,
  ...props,
});

export const textileGeometryTemplates: Record<string, () => GeometrySpec> = {
  stenter: () => machine(
    'Textile Stenter',
    'Engineering approximation of a textile stenter with fabric entry, tenter rails, heating chambers, circulation and exit sections.',
    [
      part('Main Stenter Frame', 'box', [0, 0.12, 0], [0, 0, 0], { size: [4.2, 0.24, 1.65], color: '#374151' }),
      part('Entry Fabric Roller', 'cylinder', [-1.85, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.18, radiusBottom: 0.18, height: 1.35, color: '#94a3b8' }),
      part('Left Tenter Rail', 'box', [-0.15, 0.56, 0.62], [0, 0, 0], { size: [2.9, 0.08, 0.08], color: '#64748b' }),
      part('Right Tenter Rail', 'box', [-0.15, 0.56, -0.62], [0, 0, 0], { size: [2.9, 0.08, 0.08], color: '#64748b' }),
      part('Heating Chamber 1', 'box', [-0.95, 0.92, 0], [0, 0, 0], { size: [0.85, 1.2, 1.5], color: '#7c2d12' }),
      part('Heating Chamber 2', 'box', [0, 0.92, 0], [0, 0, 0], { size: [0.85, 1.2, 1.5], color: '#9a3412' }),
      part('Heating Chamber 3', 'box', [0.95, 0.92, 0], [0, 0, 0], { size: [0.85, 1.2, 1.5], color: '#7c2d12' }),
      part('Circulation Fan Bank', 'box', [0, 1.62, -0.45], [0, 0, 0], { size: [2.8, 0.18, 0.45], color: '#475569' }),
      part('Exhaust Duct', 'cylinder', [0.55, 1.9, 0], [0, 0, 0], { radiusTop: 0.14, radiusBottom: 0.18, height: 0.65, color: '#94a3b8' }),
      part('Exit Cooling Roller', 'cylinder', [1.75, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.18, radiusBottom: 0.18, height: 1.35, color: '#0e7490' }),
      part('Control Cabinet', 'box', [1.82, 0.72, -0.92], [0, 0, 0], { size: [0.48, 1.18, 0.35], color: '#1f2937' }),
    ],
  ),

  singeing_machine: () => machine(
    'Textile Singeing Machine',
    'Engineering approximation of a textile singeing line with preparation, burner, exhaust, cooling and quench sections.',
    [
      part('Main Machine Frame', 'box', [0, 0.1, 0], [0, 0, 0], { size: [3.5, 0.2, 1.35], color: '#374151' }),
      part('Entry Guide Roller', 'cylinder', [-1.45, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.16, radiusBottom: 0.16, height: 1.15, color: '#94a3b8' }),
      part('Brush Cleaning Unit', 'cylinder', [-0.95, 0.68, 0], [1.5708, 0, 0], { radiusTop: 0.2, radiusBottom: 0.2, height: 1.1, color: '#64748b' }),
      part('Burner Section', 'box', [-0.35, 0.6, 0], [0, 0, 0], { size: [0.72, 0.42, 1.1], color: '#b45309' }),
      part('Burner Hood', 'box', [-0.35, 1.06, 0], [0, 0, 0], { size: [0.85, 0.62, 1.28], color: '#475569' }),
      part('Exhaust Stack', 'cylinder', [-0.35, 1.65, 0], [0, 0, 0], { radiusTop: 0.13, radiusBottom: 0.16, height: 0.6, color: '#94a3b8' }),
      part('Cooling Guide Roller', 'cylinder', [0.55, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.16, radiusBottom: 0.16, height: 1.15, color: '#0e7490' }),
      part('Quench Trough', 'box', [0.98, 0.32, 0], [0, 0, 0], { size: [0.72, 0.3, 1.05], color: '#1e3a5f' }),
      part('Squeeze Roller Pair', 'cylinder', [1.2, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.18, radiusBottom: 0.18, height: 1.15, color: '#64748b' }),
      part('Exit Roller', 'cylinder', [1.55, 0.78, 0], [1.5708, 0, 0], { radiusTop: 0.16, radiusBottom: 0.16, height: 1.15, color: '#94a3b8' }),
      part('Control Cabinet', 'box', [1.45, 0.7, -0.82], [0, 0, 0], { size: [0.45, 1.05, 0.32], color: '#1f2937' }),
    ],
  ),
};

export const textileGeometryKeywords: Record<string, string[]> = {
  stenter: ['stenter', 'tenter', 'heat setting', 'heat-setting'],
  singeing_machine: ['singeing', 'singeing machine', 'singe machine'],
};
