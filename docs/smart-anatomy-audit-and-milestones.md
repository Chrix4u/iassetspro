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

## Milestone 9 — source-backed engineering review, not checkbox-only approval

The commissioning endpoint now reads the stored GLB from the configured private
directory, checks its exact source SHA-256 fingerprint against the original
immutable creation audit, validates the GLB structure and derives actual
renderable source mesh paths. Engineers cannot approve a file merely by
ticking the three review boxes and linking a fictitious mesh name.

Every link used for engineering approval must (a) resolve to a source node
in the actual uploaded GLB default scene, (b) belong to the correct registered
machine, (c) be unique among mapped components and (d) refer to a
single-primitive imported mesh whose source ancestry is unambiguous. A wrong
source path, cross-machine component, duplicate mapping, missing attestation,
tampered bytes or unsafe storage fails closed. The resulting audit records
both the number of linked components and the number of exact source-path
matches; physical maintenance instructions remain unapproved.

For conservative correctness, the authoritative path parser recognizes
single-primitive mesh nodes using the same sanitized names as Three.js
GLTFLoader. More complex skins, multi-primitive groups and instancing require
an independent, reviewed import/conversion process before authorizing their
maintenance identity. The importer can still display those geometries for
visual inspection without granting them a maintenance-component link.

## Milestone 10 — independent reviewer and frozen commissioned mappings

A privately uploaded CAD model now requires independent **maker/checker** engineering
sign-off: the original uploader (including an administrator) may not approve
their own GLB file. The server verifies the immutable original `uploadedById`
against the approving session and records both user identifiers in the
commissioning audit. A missing uploader ID fails closed. The restricted
review-status endpoint returns only an eligibility flag (not the uploader's
identity), and the model selector explains when a second authorized engineer
must review the file.

Once a private CAD is engineering-approved, all existing mesh-binding
POST/PUT/DELETE routes refuse edits to that model's component mapping.
Withdrawn revisions remain immutable as evidence even though their active flag
is false. New, unapproved private CAD may still receive authorized mapping
changes during commissioning; ordinary legacy asset models are unaffected.
The asset explorer explains that a newly uploaded revision must be reviewed
for any subsequent technical mapping change. No new database table or PM
frequency type was introduced.

## Milestone 11 — export factual CAD-to-registered-part review for engineers

A Digital Twin manager can export the currently imported source GLB mesh manifest
as an Excel-compatible UTF-8 CSV. The export includes the registered machine
tag, CAD model identifier, review date (DD-MM-YYYY), the exact imported node
path, actual source assembly ancestry, confirmed registered component links,
and separately labelled **unapproved** text-match proposals with scores and
review basis. Unknown or ambiguous mesh identities stay `Visual-only; needs
manual review`; the exporter never treats a suggestion as engineering
approval, inventory ownership or an OEM bill of materials.

The CSV is assembled locally from the permissioned loaded asset's existing
registered parts and imported mesh geometry; no new file table or unsanctioned
server records are created. Source-provided cell text is quoted and sanitized
against spreadsheet formula injection, and exported filenames contain only
safe characters. Engineers may review the worksheet externally, but there is
no automatic import or bulk mapping approval yet.


## Milestone 12 — protected CAD asset ownership

The older mesh-binding API supported plant-wide scene models that may refer to
multiple machines. That general behavior is retained for legacy nonprivate
Digital Twins. A **private Smart Anatomy model**, however, is an immutable
provenance record for one installed machine; its source-node links must never
be remapped to a different asset, even if the other asset is in the same
plant. Both create and edit routes now enforce this model-to-asset identity
on the server, in addition to plant authorization and registered-component
ownership checks. Unit tests exercise cross-machine attempts and ensure a
draft model can still be mapped to its actual owning machine.

## Milestone 13 — reject malformed self-contained GLB source geometry early

The private GLB import validator now checks the complete supported GLB 2.0
binary structure, not just the magic/version and JSON segment:

- A single JSON chunk followed by at most one valid aligned BIN chunk;
  rejects truncation, trailing data and unsupported extra chunk types.
- The JSON-declared internal buffer must reference the available binary
  payload within glTF's allowed three-byte padding, and buffer views must
  be bounded by their backing buffer.
- Model source hierarchy references must remain in range, and circular or
  duplicated child structures are rejected before storage, rather than
  failing later during an engineering approval.
- Source geometry intake remains capped at 25 MB; plant permissions, private
  nonpublic storage, checksum attestation and independent engineer approval
  remain mandatory.

These tests cover both original training GLBs and maliciously modified
fixtures. This is **input validation**, not a substitute for isolated
workers and specialist format-conversion security scans; arbitrary STEP,
IGES, IFC, STL and OBJ uploads are still deliberately not accepted.


## Milestone 14 — offline STL workshop scan handoff (real triangles, no invented assemblies)

A standalone, explicitly **offline** binary/ASCII STL → GLB 2.0 converter
prepares restricted engineering-owned workshop scans for the existing private
GLB upload endpoint. It performs no database writes, remote requests,
automatic part registration, or maintenance action. The source unit is
mandatory: `mm`, `cm`, `m`, `in`, or `ft`. The converted geometry is
written in glTF-standard meters, preserving the source orientation and
triangle topology. Face normals are recomputed from the actual vertices.

Sample invocation from the iAssetsPro repository root:

```bash
bun scripts/smart-anatomy/convert-offline-stl.ts \
  --input /secure/source/workshop-scan.stl \
  --output /secure/review/workshop-scan.glb \
  --units mm \
  --origin site-owned-scan \
  --source-note "Authorized site workshop scan, verify units and orientation"
```

The CLI rejects nonregular files, source files exceeding 25 MB, malformed
binary/ASCII triangles, nonfinite coordinates, degenerate faces, excessive
triangle counts or a GLB conversion exceeding 25 MB. It creates the GLB
and a sidecar `workshop-scan.glb.source.json` under restrictive 0600 file
permissions, without overwriting existing files. The sidecar records the
original STL SHA-256, converted GLB SHA-256, legal-source category, documented
origin, declared source units, original format, triangle count and explicit
lack of engineer sign-off. Keep both the original source STL and the sidecar
outside public web storage.

An engineer may inspect the GLB locally and then upload it to the plant's
private model library, documenting the source checksum and units in the upload
source note. The app independently computes and records its own GLB checksum
and requires mapping/approval by **another authorized engineer**.

**Crucial format limitation:** STL is a triangle surface, not a manufacturer
assembly tree. The converter emits **exactly one** unverified source mesh per
STL. It does not infer component separations, explode the STL into fake parts,
invent OEM identifiers, reverse engineer a spare-parts BOM, or approve
physical disassembly. For an authentic multipart exploded view, obtain
assembly-preserving OEM CAD or an independently reviewed multi-part model.

This milestone is an offline preparation utility, **not** a live STL upload
API or isolated asynchronous STEP/IGES/IFC conversion service. The latter
remains a separate enterprise deployment requirement.

## Milestone 15 — private CAD storage deployment preflight parity

The standalone storage preflight now enforces the same source-security invariants
as the runtime: absolute private path, owner-only `0700` mode, ownership by the
effective runtime user, no symlinks in any ancestor, and no folder under the
public web root. The preflight verifies actual write/read/execute access by
creating and deleting a private temporary test file. It does **not** create
the storage root or touch any tenant's proprietary source models.

Four executable CLI tests verify safe root success, unsafe `0755` mode
rejection, a symlinked ancestor rejection, and failure when the configuration
is missing. The existing runtime authorization tests are retained.

VPS preparation, completed on 19-11-2026 without altering the live iAssetsPro
service: a dedicated owner-only directory was provisioned at
`/var/lib/iassetspro/private-cad`; the storage preflight passed when executed
as the same operating-system user as the existing Next.js process. Merely
provisioning an empty private directory does **not** enable private CAD
uploads or amount to deployment acceptance.

Before production activation, document **encrypted off-server backups,
recovery drills, retention, alerting, HTTP upload limits and staging UAT**.
The application continues to reject private CAD writes until its dedicated
runtime environment variable is securely configured.

## Milestone 16 — actual CAD-to-PM/WO/spare traceability, read-only

For authorized plant users, the existing 3D machine explorer now offers
**Export CAD maintenance trace** on a selected privately imported model. It
calls `GET /api/smart-anatomy/models/:id/maintenance-trace` and saves a
machine-readable JSON report locally. The new service:

- Refuses missing sessions, insufficient Digital Twin permissions, denied
  plant scope, nonprivate models and invalid model identifiers.
- Validates the actual original GLB binary against the initial immutable
  SHA-256 source audit and derives its real importable source node paths.
- Rejects fictitious, duplicate, missing or cross-machine mesh/component
  mappings, and refuses incorrectly cross-planted spare inventory records or
  work orders linked to a different installed machine.
- Reports the registered component code/name, already linked PM schedules,
  current store-linked spares, tool requirements and **existing** work order
  references for each verified source path, including mapping coverage.
- Distinguishes draft, independently approved and withdrawn CAD revisions.
  The HTTP response is `private, no-store` and explicitly states that the
  exported evidence does **not** authorize physical maintenance procedures.

This is true auditable information linkage into iAssetsPro's existing PM,
repairs, work orders and stock systems. It is not a separate replacement
module, speculative AI-generated BOM, automatic work order, or automatic
maintenance approval. The existing registered machine relationships remain
the system of record.

Executable route tests cover authorized proof, authentication, cross-plant
denial, tampering, invented and duplicate paths, wrong-asset component
links, cross-plant stock/work-order joins, historical withdrawal and
missing original source audit. The explorer contract test ensures the
download action is actually wired into the existing application.

### Maintenance navigation and read-only access

The trace export is available to authorized Digital Twin **view** users as
well as managers. From a registered component selected in the 3D explorer,
users can open the existing PM Schedules, Work Orders, and Inventory modules
using the application's canonical hash routes. Navigation is to the full
existing module list; it does not pretend to open an unimplemented
record-specific deep link or automatically transfer editing permissions.

## Milestone 17 — serializable engineering approval/withdrawal lifecycle

Approval and withdrawal previously used an initial source-status check and
then unconditional batched writes, leaving a window in which a retiring
engineer could withdraw CAD while another stale approval request reactivated
the same model. Both actions now use a **PostgreSQL interactive transaction**
and acquire a database `FOR UPDATE` lock on the exact protected
`asset_models` row before committing changes.

After acquiring the shared revision lock, commissioning rechecks the
withdrawal audit and `isActive` flag, then writes the final active status and
independent engineer-review audit in the same transaction. Withdrawal uses
the same lock, rechecks the active flag and retirement audit, then atomically
disables the model and its published scenes and records its reason.

Tests specifically simulate withdrawal completing after the earlier initial
approval check, a competing engineering sign-off, repeated withdrawal and
withdrawal audit overlap. The system refuses stale transitions and does not
delete the original CAD, mapped registered parts or PM records.

**Boundary:** This milestone serializes the approval-vs-withdrawal
transitions. Concurrent draft-mapping edits are a separate problem; full
industrial commissioning acceptance still requires a live PostgreSQL
concurrency/UAT test plus mapping-write coordination before rollout.

### Work order permission separation

The CAD trace service also honors the Work Orders module's separate
authorization. Read-only Digital Twin access alone does not expose work order
identifiers, descriptions or status. Users lacking broad Work Order view
permission receive an empty work-order evidence list, and maintenance
technicians are likewise excluded from this aggregate because their actual
Work Order visibility is assignment/team-scoped. Their authorized individual
work orders remain available through the normal Work Orders module.

## Milestone 17 — non-mutating staging readiness gate

The standalone `scripts/smart-anatomy/check-staging-readiness.mjs` accepts
**only an explicitly configured staging/UAT/test origin**, refuses the known
production domains, embedded credentials, redirects, arbitrary internet
hosts and non-TLS remote targets. It performs three GET-only checks: health
must be HTTP 200, anonymous private CAD source access must be HTTP 401, and
anonymous maintenance trace access must be HTTP 401. It never sends
credentials or imports CAD, creates PM/work orders or alters the database.
A redirect, unavailable service or unexpected status fails closed.

Run only after a separate staging environment exists:

```bash
IASSETSPRO_STAGING_URL=https://staging.example.com \
  node scripts/smart-anatomy/check-staging-readiness.mjs
```

This is a **pre-UAT smoke gate**, not a substitute for authenticated
cross-plant testing, independent engineering acceptance, licensed OEM
source files, encrypted off-server backup evidence or a verified recovery
drill. Do not point it at the live production origin.

### CI infrastructure repair — Chromium installation without apt

GitHub Actions run `44523189937` on 19 November 2026 passed
TypeScript, unit tests, lint, application build and container build, but
both Playwright jobs failed **before any browser tests ran**. The Ubuntu
package mirror returned HTTP 503 and timeouts during `playwright install
--with-deps chromium`; this was not an application test failure.

Both browser jobs now install the pinned Chromium binary using
`scripts/smart-anatomy/install-ci-chromium.sh`, without mutating the
Ubuntu apt package set. The installer is restricted to Linux CI, retries
one transient download failure and exits nonzero if Chromium cannot be
installed. The browser test suites and required CI gate remain mandatory:
**no skip, ignored failure or weakened acceptance threshold**.

This change is for hosted Ubuntu 24.04 runners only. If the runner lacks
required shared libraries, browser launch will still fail visibly and
must be corrected using a reproducible runner image, not by silently
disabling the suite.
