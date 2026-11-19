# iAssetsPro Smart Anatomy™ — Existing-system audit and delivery milestones

Status: **Milestones 1 and 2 on a draft feature branch**; not released to production.

## Existing modules inspected

- `MachineVisualExplorer` is embedded in Asset Detail, hierarchy commissioning, PM target selection and maintenance pages. Its diagram, 2D engineering, photographs and synthetic engineering schematic already coexist.
- `DigitalTwinViewer` is built on React Three Fiber/Three.js; `ModelLoader` loads original GLB/glTF geometry, `InteractiveMesh` binds named meshes to registered components and emits precise component selections to asset maintenance forms.
- `ModelLibrary`, `MeshComponentMapping`, `ModelProcessingJob`, `AssetModel`, `AssetMeshBinding`, `DigitalTwinScene` and related endpoints already exist. No duplicate model table should be created.
- Existing section plane, scene tree, 3D camera, mesh isolation, approved asset hierarchy, PM schedules, repair requests, work orders, inventory and location paths must be reused rather than reimplemented.
- Production already has established permissions, data isolation and audit logs; external OEM connectors and engineer approval must adopt these policies.

## Confirmed gap addressed in Milestone 1

Previously the 3D exploded-view animation moved meshes **only when a preconfigured `explodeOffset` binding existed**. That excluded many imported multi-part GLB files. The explosion-intensity slider was not reflected in animation because progress always targeted one when enabled. The labelled 2D exploded schematic is not a substitute for 3D CAD geometry.

The new `anatomyExplosion` logic:

1. Traverses **only the imported model**, identifies actual independently represented Three.js meshes and computes geometric bounds.
2. Returns **no explosion plan for a zero/one-mesh model**; it does not invent geometric machine parts or OEM dimensions.
3. Derives deterministic separation vectors from assembled geometry, corrected for parent transforms, while preserving original mesh positions and engineer-configured offsets.
4. Animates and reverses positions using the existing intensity slider; supports existing targeted asset/component isolation identifiers.
5. Keeps unbound meshes *visual only*. Only explicit component bindings may trigger maintenance operations; labels are limited to mapped meshes.
6. Counts imported meshes in the viewer and displays a factual single-mesh limitation.

These displacements are for *inspection visualization*, **not manufacturer-specified mechanical disassembly sequences**. Engineers should rely on approved OEM work instructions before physical maintenance.

## Milestone 2 — source-path navigation and existing component mapping

The same 3D viewer now delivers an independently scrollable **imported CAD source tree** generated from the actual GLB hierarchy, not a fictional bill of materials. Engineers can search by source node, part name, or registered component code, select mapped and visual-only geometry, inspect its exact source path, and see the selected geometry highlighted. Source-path matching distinguishes duplicate part names, while name-only legacy bindings are retained only for unambiguous names.

Authorized users with existing Digital Twin manage permissions can select a registered iAssetsPro asset component (Assembly → Subassembly → Component → Part) and link that exact CAD node through the existing, plant-scoped asset mesh binding endpoint. The UI verifies previous mappings first and reloads the existing digital twin scene after saving. This does **not** certify that the file is a manufacturer-authorized model or approve an unsafe maintenance instruction. Duplicate source-path links are rejected by the existing endpoints on create and update; no new model/asset tables or tenant-bypass paths were introduced.

Tests cover exact-path disambiguation, nested source-tree construction, visual-only selection, mapping endpoint contracts, transform preservation and source material isolation.

## Remaining work (not yet implemented)

- **Hierarchical model import and commissioning**: source node ancestry and manual exact path links are now present; still needed are engineer-reviewable bulk BOM-to-asset proposals, incomplete mapping reports, revision conflict handling, and formal approval of technical anatomy.
- **Industrial CAD conversion**: authenticated object storage, malware/file validation, asynchronous FreeCAD/Open CASCADE STEP assembly extraction, source+revision provenance, licensed OBJ/STL/IFC pipelines and isolation of untrusted conversions. Converters must run in restricted workers, not in web requests.
- **Template and equipment approval**: model revision review, installed-asset to OEM-template separation, provenance and engineer approval, conflicting mapping detection and role/tenant enforcement.
- **Maintenance integration**: allow approved component mappings to prepopulate all existing PM, repairs, work order and inventory dialogs. Existing time-based and meter/usage-based PM options remain unchanged.
- **OEM providers / AI**: approved catalog-source adapters, permissioned document extraction, cited model matching and human approval before a suggested model becomes authoritative.
- **Demonstrations / validation**: use independently created or appropriately licensed multi-mesh centrifugal-pump and conveyor-gearbox CAD, with isolated test fixtures rather than live production records; browser and performance tests on real parts.

## Safety and rollout

No production DB migration is needed for Milestone 1; existing models and bindings are reused. Keep this feature separate from the Production Survey PR. Do not import fictitious geometry or publish manufacturer claims without verified OEM documentation. The branch must pass focused geometry tests, existing digital-twin regression tests, TypeScript/lint and Playwright before staging release.
