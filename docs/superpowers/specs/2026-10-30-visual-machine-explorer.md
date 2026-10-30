# Visual Machine Explorer Design

## Intent
Make iAssetsPro competitive for industrial manufacturers by letting planners and technicians navigate a machine graphically and select the exact maintainable component for PM, repairs, work orders, spares, tools and history.

## Chosen approach
Hybrid visual layer over the existing asset/component registry. Use real GLB/glTF digital-twin models when available, photos/drawings with hotspots as a fallback, and AI only to assist visual creation/mapping. The registry remains the source of truth.

## First production slice
1. Add an optional ComponentRegistry foreign key to AssetMeshBinding.
2. Enforce that a bound component belongs to the same machine asset as the mesh binding.
3. Preserve mesh bindings, including component IDs, through digital-twin scene normalization.
4. Let DigitalTwinViewer notify callers when a component-bound mesh is selected.
5. Add a 3D Model tab to MachineVisualExplorer. Clicking a mapped mesh selects that exact component and therefore drives existing PM/repair selection callbacks.
6. Preserve existing diagram, engineering 2D, exploded and AI visual fallbacks.

## Constraints
- Never infer a maintenance component purely from AI output.
- Unmapped meshes remain viewable but cannot silently become maintenance targets.
- Existing asset-level mesh bindings remain valid.
- No regression to existing digital-twin viewer behavior.
