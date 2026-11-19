import type { ImportedAnatomyMesh } from './anatomyBindings';

/** A suggestion is never an approved OEM identity or a database mapping. */
export interface AnatomyMappingCandidate {
  mesh: ImportedAnatomyMesh;
  target: { id: string; componentCode: string; name: string };
  confidence: number;
  reason: 'exact-part-code' | 'exact-component-name' | 'matching-component-terms';
}

export interface MappingCoverage {
  total: number;
  linked: number;
  visualOnly: number;
  candidates: AnatomyMappingCandidate[];
  unmatched: number;
  ambiguous: number;
}

type ExistingComponent = {
  id: string;
  componentCode: string;
  name: string;
};

const normalized = (text: string) => text
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const compact = (text: string) => normalized(text).replaceAll(' ', '');
const common = new Set([
  'machine','component','assembly','subassembly','part','view','cad','model',
  'left','right','front','back','section','group','object','node','mesh','item',
]);

export function suggestAnatomyMappings(
  meshes: ReadonlyArray<ImportedAnatomyMesh>,
  components: ReadonlyArray<ExistingComponent>,
): MappingCoverage {
  const candidates: AnatomyMappingCandidate[] = [];
  let linked = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const validComponents = components
    .filter(component => component.id && (component.componentCode?.trim() || component.name?.trim()))
    .map(component => {
      const partName = normalized(component.name || '');
      return {
        component,
        partCode: compact(component.componentCode || ''),
        partName,
        targetTokens: partName.split(' ')
          .filter(token => token.length >= 3 && !common.has(token)),
      };
    });

  for (const mesh of meshes) {
    if (mesh.verified && mesh.componentId) { linked++; continue; }

    // Ignore other ancestry nodes when proposing a part; only the genuine
    // imported leaf/mesh name, not the machine's overall title, is evidence.
    const codeLike = compact(mesh.meshName);
    const label = normalized(mesh.meshName);
    const terms = label.split(' ').filter(token => token.length >= 3 && !common.has(token));
    const ranked: Array<{component:ExistingComponent;confidence:number;reason:AnatomyMappingCandidate['reason']}> = [];

    for (const {component,partCode,partName,targetTokens} of validComponents) {
      let confidence = 0;
      let reason: AnatomyMappingCandidate['reason'] = 'matching-component-terms';

      if (partCode.length >= 3 && codeLike === partCode) {
        confidence = 0.99; reason = 'exact-part-code';
      } else if (partName.length >= 4 && label === partName) {
        confidence = 0.95; reason = 'exact-component-name';
      } else {
        const matched = targetTokens.filter(token => terms.includes(token));
        // Never infer identity from one generic word.
        if (targetTokens.length >= 2 && matched.length >= 2 &&
            matched.length / targetTokens.length >= 0.8) {
          confidence = 0.7 + 0.12 * (matched.length / targetTokens.length);
          reason = 'matching-component-terms';
        }
      }
      if (confidence >= 0.7) ranked.push({component,confidence,reason});
    }

    ranked.sort((a,b) => b.confidence - a.confidence);
    const best = ranked[0];
    if (!best) { unmatched++; continue; }
    if (ranked[1] && best.confidence - ranked[1].confidence < 0.06) {
      ambiguous++; continue;
    }
    candidates.push({
      mesh,
      target: {
        id: best.component.id,
        componentCode: best.component.componentCode,
        name: best.component.name,
      },
      confidence: best.confidence,
      reason: best.reason,
    });
  }
  return {
    total: meshes.length, linked, visualOnly: meshes.length - linked,
    candidates, unmatched, ambiguous,
  };
}
