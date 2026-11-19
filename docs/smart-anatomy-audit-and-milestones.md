# iAssetsPro Smart Anatomy™ — Existing-system audit and delivery milestones

Status: **Milestone 1 implementation branch**; not released to production.

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

## Remaining work (not yet implemented)

- **Imported CAD assembly hierarchy**: preserve original glTF node ancestry through loading, matching duplicate mesh names by node path rather than merely names, and synchronize that tree with the registered Asset → Assembly → Subassembly → Component → Part hierarchy.
- **Industrial CAD conversion**: authenticated object storage, malware/file validation, asynchronous FreeCAD/Open CASCADE STEP assembly extraction, source+revision provenance, licensed OBJ/STL/IFC pipelines and isolation of untrusted conversions. Converters must run in restricted workers, not in web requests.
- **Template and equipment approval**: model revision review, installed-asset to OEM-template separation, provenance and engineer approval, conflicting mapping detection and role/tenant enforcement.
- **Maintenance integration**: allow approved component mappings to prepopulate all existing PM, repairs, work order and inventory dialogs. Existing time-based and meter/usage-based PM options remain unchanged.
- **OEM providers / AI**: approved catalog-source adapters, permissioned document extraction, cited model matching and human approval before a suggested model becomes authoritative.
- **Demonstrations / validation**: use independently created or appropriately licensed multi-mesh centrifugal-pump and conveyor-gearbox CAD, with isolated test fixtures rather than live production records; browser and performance tests on real parts.

## Safety and rollout

No production DB migration is needed for Milestone 1; existing models and bindings are reused. Keep this feature separate from the Production Survey PR. Do not import fictitious geometry or publish manufacturer claims without verified OEM documentation. The branch must pass focused geometry tests, existing digital-twin regression tests, TypeScript/lint and Playwright before staging release.
