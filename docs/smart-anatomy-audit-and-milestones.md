# iAssetsPro Smart Anatomy™ — Existing-system audit and delivery milestones

Status: **Milestones 1–3 on a draft feature branch**; not released to production.

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

## Milestone 3 — physically separate original illustrative training models

Added an original conceptual centrifugal-pump GLB with 30 meshes and a conveyor-gearbox GLB with 20 meshes. Each retains genuine independent mesh geometry, nested named source nodes, and embedded provenance metadata declaring `manufacturerApproved:false`. Source generator lives in `scripts/smart-anatomy/generate-original-demo-models.mjs`; files and licensing disclaimers live in `public/smart-anatomy-demos`. Both fixtures have been loaded successfully using the actual Three.js `GLTFLoader`, not only checked for a file signature.

On machine assets without an approved model, the existing 3D explorer provides **explicit sample preview** controls. Demo geometry is isolated from the installed asset's digital-twin bindings and flagged as illustrative, not its OEM CAD, maintenance history, PM instructions or valid production anatomy. No production seeding, fake serial numbers, or fabricated work orders are introduced.

The illustrated models are for testing exploded animation, source tree selection, and user onboarding only. They do not satisfy the requirement for **manufacturer-accurate certified pump and gearbox anatomy**, which will require licensed/verifiable CAD and engineer review.

## Remaining work (not yet implemented)

- **Hierarchical model import and commissioning**: source node ancestry and manual exact path links are now present; still needed are engineer-reviewable bulk BOM-to-asset proposals, incomplete mapping reports, revision conflict handling, and formal approval of technical anatomy.
- **Industrial CAD conversion**: authenticated object storage, malware/file validation, asynchronous FreeCAD/Open CASCADE STEP assembly extraction, source+revision provenance, licensed OBJ/STL/IFC pipelines and isolation of untrusted conversions. Converters must run in restricted workers, not in web requests.
- **Template and equipment approval**: model revision review, installed-asset to OEM-template separation, provenance and engineer approval, conflicting mapping detection and role/tenant enforcement.
- **Maintenance integration**: allow approved component mappings to prepopulate all existing PM, repairs, work order and inventory dialogs. Existing time-based and meter/usage-based PM options remain unchanged.
- **OEM providers / AI**: approved catalog-source adapters, permissioned document extraction, cited model matching and human approval before a suggested model becomes authoritative.
- **Demonstrations / validation**: use independently created or appropriately licensed multi-mesh centrifugal-pump and conveyor-gearbox CAD, with isolated test fixtures rather than live production records; browser and performance tests on real parts.

## Safety and rollout

No production DB migration is needed for Milestone 1; existing models and bindings are reused. Keep this feature separate from the Production Survey PR. Do not import fictitious geometry or publish manufacturer claims without verified OEM documentation. The branch must pass focused geometry tests, existing digital-twin regression tests, TypeScript/lint and Playwright before staging release.

## Milestone 4 — private GLB ingestion and engineer commissioning

The existing `AssetModel` and `AssetMeshBinding` tables are reused. The new upload API `POST /api/smart-anatomy/models` requires `digital_twin.manage` and strict plant access, an asset ID, file, source-origin category, source note, and name. It accepts only **self-contained GLB 2.0 files up to 25 MB**, validates binary signature/chunk size/JSON/accessor totals, rejects external URLs, and records a SHA-256 fingerprint and source attestation in the existing audit log. Files use UUID names in non-public storage; records are created as `isActive: false`, without automatically creating asset parts, PMs or work orders.

Authorization is checked **again** when the browser requests a model from `GET /api/smart-anatomy/models/:id/file`. The file response is private/no-store and restricted to the same plant. The viewer downloads the GLB with its authenticated API client and renders it through an ephemeral local Blob URL, which is revoked on change/unmount. An unauthorized browser cannot retrieve the bytes by requesting the static upload URL. The existing Asset Detail 3D tab offers a private-model selector and upload form, with a source/licence attestation and exact node-to-registered-part mapping.

Before a model is marked active for technical **visual inspection**, a Digital Twin manager must confirm three separate checks—source, geometry and asset-component mapping—write an engineering review note, and have at least one verified component link. The review is audited. Crucially, `isActive` does **not** authorize any physical maintenance procedure, machining dimensions, auto-PM changes or work-order execution. OEM validation and revision approval remain separate enterprise capabilities.

**Required server configuration before enabling uploads:** set `IASSETSPRO_CAD_STORAGE_ROOT` to an absolute, non-public, persistent directory, for example `/home/lightworld/shared/iassetspro/private-cad`. The directory must be writable only by the application service user, **must not** sit under `public/`, and must not be symlinked into a public uploads directory. Missing configuration returns HTTP 503 and does not fall back to public storage. Apply an Nginx/request-body limit for upload routes; configure backups, malware scanning and a restricted CAD conversion worker before accepting untrusted manufacturer files at scale. There is **no production migration** for this milestone.

The existing Model Library job-history GET route has also been hardened: it now requires a valid session, Digital Twin read permission, owning-plant scope and consistent asset/model plant IDs before reading potentially sensitive CAD processing results.

### Private CAD deployment preflight

Once the operator has provisioned an isolated, persistent directory owned by the application service user, run `IASSETSPRO_CAD_STORAGE_ROOT=/absolute/private/path node scripts/smart-anatomy/check-private-cad-storage.mjs`. This gate rejects missing/relative paths, symlinked or public directories, group/world-readable mode, inaccessible directories and failed controlled write tests. It does not write permanent data. Require a successful result before enabling private CAD uploads; do **not** circumvent this gate by placing CAD under a public uploads directory.

### Publishing reviewed private CAD into the installed asset's 3D scene

After the source, geometry and registered-component mappings are approved, the asset explorer provides a separate **Publish to asset 3D scene** action. This reuses the existing Digital Twin and Digital Twin Scene APIs (creating the asset twin only if absent), attaches the exact already-registered `AssetModel`, refreshes the existing 3D viewer, and never creates an unverified component or work order. The Digital Twin Scene POST endpoint additionally rejects unreviewed private CAD even when an unauthorized caller bypasses the UI. This is publication for technical *visual inspection*, not permission to mechanically dismantle equipment.

## Milestone 6 — engineer-reviewed CAD mapping coverage and proposals

Smart Anatomy now reports the number of factual imported GLB/glTF mesh nodes, linked registered components, unlinked visual-only nodes, and suggested candidate matches. A deterministic **offline name/code matcher** compares each imported source-node name to the existing registered component codes and descriptions (exact part code > exact component name > sufficiently matching descriptive terms), while suppressing ties and ambiguous part identities. It does not use externally generated AI claims, manufacturer part data or fabricated geometry.

The asset explorer offers a bounded, independently scrollable **Review proposals** list (first 50 results), with the source mesh path, target registered code/description, text-match score and review control. The engineer must explicitly select a proposed pairing; saving still runs through the existing, permissioned, plant-scoped link API with exact imported source paths. No proposal automatically creates component registry entries, changes maintenance frequencies, approves disassembly or modifies PM/work orders. When changing models, the existing proposals and selection are cleared to prevent misleading cross-model links.


## Milestone 7 — private model integrity and bounded upload hardening

Private CAD storage now has a mandatory runtime guard in **both** file upload and
file download routes. The application requires a pre-provisioned, readable and
writable **owner-only directory** with no symlink in its configured path, and
refuses to create or silently fall back to a public uploads directory. The
separate release preflight remains required; changing permissions after deploy
will fail closed on the next request.

Every authorized private CAD file download is SHA-256 checked against the exact
checksum recorded in the original source-provenance audit log. Missing or
malformed source attestation, changed bytes (even of the same size), and broken
storage permissions fail closed. This is filesystem-integrity protection; it
does not certify the manufacturer's engineering correctness or safety of
physical disassembly.

Multipart upload requests are read under a fixed 25 MB plus 1 MB form-field
overhead cap **before** parsing `FormData`, including if HTTP `Content-Length`
is missing or incorrect. This reduces memory-exhaustion exposure from chunked
uploads. Nginx body-size and request-rate limits and a malware scanning
pipeline are still required when enabling uploads for untrusted external users.
Tests cover cross-plant denial, tampered bytes, missing source provenance,
unsafe permissions, symlinks and chunked upload limits.


## Milestone 8 — reviewed CAD withdrawal, revision immutability and scene safety

A CAD can be withdrawn through an explicit confirmation, with a documented engineering
reason, by an authorized manager in the owning plant. The withdrawal transaction changes
the model to inactive, disables all its published Digital Twin scenes, and preserves its
private source bytes, original fingerprint, component mappings and full audit record.
The platform refuses to silently reapprove a withdrawn file: an independent newly
uploaded source revision must go through a fresh engineering review.

The legacy `/api/asset-models` form now explicitly rejects a forged private CAD
file path, mutation of a protected source, or deletion that would orphan source
evidence. Digital Twin scene list/detail APIs hide/reject withdrawn private CAD
instead of continuing to advertise it as a commissioned as-built model.
The private CAD upload selector loads the plant-scoped review status and distinguishes
awaiting-review models from withdrawn revisions. Neither action deletes historical
maintenance, changes PM schedules, or approves physical disassembly.
