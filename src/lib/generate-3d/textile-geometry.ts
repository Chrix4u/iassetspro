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
  mercerizer: () => machine(
    'Textile Mercerizer',
    'Engineering approximation of a textile mercerizing line with caustic impregnation, tensioning, washing and neutralization sections.',
    [
      part('Main Mercerizer Frame', 'box', [0, 0.1, 0], [0, 0, 0], { size: [4.2, 0.2, 1.5], color: '#374151' }),
      part('Entry Roller', 'cylinder', [-1.85, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.17, radiusBottom: 0.17, height: 1.2, color: '#94a3b8' }),
      part('Caustic Impregnation Trough', 'box', [-1.15, 0.34, 0], [0, 0, 0], { size: [0.95, 0.32, 1.15], color: '#1e3a5f' }),
      part('Squeeze Roller Set', 'cylinder', [-0.68, 0.76, 0], [1.5708, 0, 0], { radiusTop: 0.19, radiusBottom: 0.19, height: 1.22, color: '#64748b' }),
      part('Left Tension Rail', 'box', [0.05, 0.62, 0.54], [0, 0, 0], { size: [1.55, 0.08, 0.08], color: '#0f766e' }),
      part('Right Tension Rail', 'box', [0.05, 0.62, -0.54], [0, 0, 0], { size: [1.55, 0.08, 0.08], color: '#0f766e' }),
      part('Stretch Roller', 'cylinder', [0.28, 0.82, 0], [1.5708, 0, 0], { radiusTop: 0.2, radiusBottom: 0.2, height: 1.2, color: '#0e7490' }),
      part('Wash Box 1', 'box', [0.9, 0.46, 0], [0, 0, 0], { size: [0.62, 0.55, 1.2], color: '#075985' }),
      part('Wash Box 2', 'box', [1.48, 0.46, 0], [0, 0, 0], { size: [0.52, 0.55, 1.2], color: '#0369a1' }),
      part('Neutralization Trough', 'box', [1.75, 0.32, 0], [0, 0, 0], { size: [0.42, 0.3, 1.05], color: '#155e75' }),
      part('Control Cabinet', 'box', [1.75, 0.78, -0.85], [0, 0, 0], { size: [0.45, 1.1, 0.34], color: '#1f2937' }),
    ],
  ),

  rope_soaper: () => machine(
    'Textile Rope Soaper',
    'Engineering approximation of a rope-form textile soaping and washing line with troughs, nip rollers, circulation and squeeze sections.',
    [
      part('Main Soaper Frame', 'box', [0, 0.1, 0], [0, 0, 0], { size: [3.8, 0.2, 1.4], color: '#374151' }),
      part('Rope Entry Guide', 'cylinder', [-1.6, 0.72, 0], [1.5708, 0, 0], { radiusTop: 0.13, radiusBottom: 0.13, height: 1.0, color: '#94a3b8' }),
      part('Soaping Trough 1', 'box', [-1.05, 0.34, 0], [0, 0, 0], { size: [0.8, 0.34, 1.1], color: '#155e75' }),
      part('Nip Roller 1', 'cylinder', [-0.62, 0.74, 0], [1.5708, 0, 0], { radiusTop: 0.17, radiusBottom: 0.17, height: 1.1, color: '#64748b' }),
      part('Washing Trough 2', 'box', [-0.1, 0.34, 0], [0, 0, 0], { size: [0.8, 0.34, 1.1], color: '#075985' }),
      part('Nip Roller 2', 'cylinder', [0.34, 0.74, 0], [1.5708, 0, 0], { radiusTop: 0.17, radiusBottom: 0.17, height: 1.1, color: '#64748b' }),
      part('Washing Trough 3', 'box', [0.86, 0.34, 0], [0, 0, 0], { size: [0.8, 0.34, 1.1], color: '#0369a1' }),
      part('Circulation Pump', 'cylinder', [0.1, 0.28, -0.78], [1.5708, 0, 0], { radiusTop: 0.14, radiusBottom: 0.14, height: 0.34, color: '#166534' }),
      part('Heating Coil Housing', 'box', [0.86, 0.28, -0.72], [0, 0, 0], { size: [0.52, 0.28, 0.26], color: '#9a3412' }),
      part('Final Squeeze Roller', 'cylinder', [1.32, 0.76, 0], [1.5708, 0, 0], { radiusTop: 0.19, radiusBottom: 0.19, height: 1.12, color: '#0e7490' }),
      part('Exit Rope Guide', 'cylinder', [1.66, 0.82, 0], [1.5708, 0, 0], { radiusTop: 0.13, radiusBottom: 0.13, height: 1.0, color: '#94a3b8' }),
      part('Control Cabinet', 'box', [1.55, 0.72, -0.82], [0, 0, 0], { size: [0.44, 1.08, 0.32], color: '#1f2937' }),
    ],
  ),
};

export const textileGeometryKeywords: Record<string, string[]> = {
  stenter: ['stenter', 'tenter', 'heat setting', 'heat-setting'],
  singeing_machine: ['singeing', 'singeing machine', 'singe machine'],
};
