import type { ImportedAnatomyMesh } from './anatomyBindings';
import type { AnatomyMappingCandidate } from './anatomyMappingSuggestions';

type RegistryComponent = {
  id: string;
  componentCode: string;
  name: string;
};

export interface AnatomyReviewExport {
  assetTag: string;
  modelId: string;
  reportDate: string; // DD-MM-YYYY; authored by the requesting client
  meshes: ReadonlyArray<ImportedAnatomyMesh>;
  candidates: ReadonlyArray<AnatomyMappingCandidate>;
  components: ReadonlyArray<RegistryComponent>;
}

/** Ensure source-controlled CAD strings cannot trigger formulas when opened in Excel. */
function csvCell(raw: string | number | null | undefined): string {
  const value = String(raw ?? '').replace(/[\r\n\t]/g, ' ').trim();
  // Applies to source CAD filenames, part names, asset IDs and manual notes.
  const safe = /^[=+\-@]/.test(value) ? '\'' + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** Source-backed, engineer-reviewable CSV. Suggestions are never approved links. */
export function buildAnatomyReviewCsv(input: AnatomyReviewExport): string {
  const columns = [
    'Asset tag', 'CAD model ID', 'Report date (DD-MM-YYYY)',
    'Imported source mesh path', 'Original mesh label', 'Source assembly path',
    'Mapping status', 'Registered component code', 'Registered component name',
    'Proposed component code (unapproved)', 'Proposed component name (unapproved)',
    'Proposal text-match %', 'Proposal basis', 'Engineer review remarks',
  ];
  const verifiedById = new Map(input.components.map(component => [component.id, component]));
  const proposedByMesh = new Map(input.candidates.map(candidate => [candidate.mesh.id, candidate]));
  const rows = input.meshes
    .slice().sort((a,b) => a.path.localeCompare(b.path))
    .map(mesh => {
      const registered = mesh.componentId ? verifiedById.get(mesh.componentId) : undefined;
      const proposed = proposedByMesh.get(mesh.id);
      const parent = mesh.path.includes('/') ? mesh.path.slice(0, mesh.path.lastIndexOf('/')) : '';
      const isLinked = Boolean(mesh.verified && mesh.componentId);
      const state = isLinked ? 'Linked to registered component'
        : proposed ? 'Proposed; requires engineering review'
          : 'Visual-only; needs manual review';
      return [
        input.assetTag, input.modelId, input.reportDate,
        mesh.path, mesh.meshName, parent,
        state,
        isLinked ? registered?.componentCode || mesh.componentCode || '' : '',
        isLinked ? registered?.name || '' : '',
        !isLinked ? proposed?.target.componentCode || '' : '',
        !isLinked ? proposed?.target.name || '' : '',
        !isLinked && proposed ? Math.round(proposed.confidence * 100) : '',
        !isLinked ? proposed?.reason || '' : '',
        '',
      ];
    });
  const body = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  // Excel UTF-8 BOM supports accented plant asset names without data loss.
  return '\uFEFF' + body + '\r\n';
}

export function safeAnatomyExportFilename(assetTag: string, reportDate: string): string {
  const tag = assetTag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70) || 'Machine';
  const date = /^\d{2}-\d{2}-\d{4}$/.test(reportDate) ? reportDate : 'undated';
  return 'iAssetsPro-CAD-Review-' + tag + '-' + date + '.csv';
}
