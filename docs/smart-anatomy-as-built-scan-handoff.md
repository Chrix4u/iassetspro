# Smart Anatomy — As-Built 3D Scan Intake and Commissioning

**Engineering scope:** actual photographed/laser-scanned *visible exterior* of an installed machine. This workflow complements, but never replaces, manufacturer CAD, site asset hierarchy or engineering approval. It does not infer bearings, gears, internal OEM parts, tolerances or a safe dismantling procedure.

## Before scanning

1. Confirm the actual machine asset and its full existing functional location in iAssetsPro. Register its machine, assembly, subassembly, component and part identifiers before adding scan hotspots.
2. Get written authorization from the factory and any OEM whose proprietary drawings/appearance or equipment configuration might be exposed.
3. Record actual machine identification: manufacturer, model, visible serial/nameplate, site, capture date, capture team, scanning device and method. Photograph the nameplate and retain a survey log outside any public URL.
4. Choose a real, stationary physical distance on the equipment (for example, a verified accessible housing width). Record the measured distance **in metres** and the corresponding length in the exported scan. Do not infer scale from a phone photo.
5. Capture multiple overlapping angles and real textures (photogrammetry) or real LiDAR/structured-light geometry. Avoid exposing people, faces, access badges, safety-sensitive controls or other plants.
6. Record occlusions and gaps. A surface that was hidden from the camera should stay missing, not be fabricated as a manufactured interior.

## Convert and export for web

- Prefer a **self-contained GLB 2.0** containing the real scanned geometry and embedded image textures. Avoid external texture links and network fetching from a source GLB.
- For a scan originally in millimetres, centimetres, inches or feet, use a documented offline conversion process and explicitly export positions in glTF **metres**. Confirm with the physical measurement before upload.
- Scan software can export OBJ/PLY/GLB or other supported meshes. When direct GLB export is not available, an engineer may use Blender or another approved offline conversion application to produce a textured GLB; do not assume every raw mobile scan or proprietary scan format is directly compatible.
- For the current on-prem viewer, do not use GLBs requiring DRACO, Meshopt, or KTX2/BasisU decoders. Re-export these with standard embedded geometry and textures using an offline engineering conversion tool; unsupported required compression extensions are explicitly rejected at upload rather than producing an unrenderable machine view.
- For the current bounded intake, output must be **≤25 MB**. Decimate dense surface geometry and resize unnecessary textures *on the engineer's workstation* while retaining a high-quality archival source and the required visual detail. Never make a simplified mesh appear more accurate than the original survey.
- Retain original scans and measurements in a restricted, versioned engineering archive. Browser input is visualization evidence, not a substitute for original raw measurement data.
- Under **Assets → Asset Details → Smart Anatomy → Real 3D Scan**, select the real GLB, capture method, date, scanner, original units, measured reference, permissions/source note and both truthful checkboxes. The scan goes into private protected storage and starts **inactive**.

## Spatial component mapping

1. Select the unapproved scan (manager permissions).
2. Choose an existing registered component, then **Place 3D scan hotspot** and click its actual visible surface. Marker positions are stored in the original model's local coordinate system in metres.
3. Save as a **draft**. Scan surface triangle/object names are **not** binding identifiers for CAD BOM parts or maintenance procedures.
4. A **different** manager/engineer verifies that the capture is of the correct installed machine, the specific physical surface belongs to the registered component and the source scale is correct. The uploader and marker author cannot self-certify.
5. Approve the hotspot, with a detailed evidence note. A scan cannot be commissioned for general plant inspection until at least one independently approved registered-component hotspot exists and a different engineer reviews the source and measured scale.
6. Once approved, plant-scoped viewers can inspect approved hotspots and open existing component/maintenance information. New markers still start unapproved. Approved spatial evidence cannot be silently deleted; withdraw and import a corrected scan revision.

## Meaning of the three visual sources

- **Real 3D Scan:** site-owned, photorealistic *visible surfaces* and as-installed modifications; no genuine internal disassembly tree can be inferred from the surface scan.
- **Engineering 3D CAD:** exact licensed drawing, original revision and machine identity with individually selectable imported OEM geometry; independently reviewed mappings required for maintenance.
- **Site Photos:** six real orthographic/elevation photographs with explicit approved part hotspots for visual identification.

Neither a texture nor a glTF mesh name makes a source legally authorized or physically correct. Approving a scan is approval to **view the surveyed geometry and reviewed component markers**, not approval to use it for clearances, torque specifications, lifting, disassembly, repairs or PM generation.

## Security and release checklist

- Run schema migration `20261124013000_site_scan_hotspots` only after staging DB backup, migration rehearsal, rollback/restore test and explicit production release gate.
- Private, owner-only CAD/scan storage and authenticated access are mandatory. Users without management permission cannot view unapproved scans or private metadata. Only approved markers are visible to ordinary viewers in their authorized plant.
- Per-GLB size limit is currently 25 MB; giant industrial captures require an independently designed isolated conversion/tiling service and storage budget, not larger unbounded HTTP reads.
- Offsite encrypted **backup plus a tested restore** must be provisioned for proprietary CAD/scans before production certification. Local-only encrypted backup does not satisfy disaster recovery.
- Exact installed machine and field engineer acceptance testing require an actual owner-authorized scan. Public test CAD or illustrative boxes do not certify customer-machine fidelity.
- Native manufacturer assembly formats or hosted Matterport/Autodesk/HOOPS services remain **optional adapters**, not required third-party subscriptions.
## Engineering roles and maker-checker release

The `Reliability Engineer` role has `digital_twin.view` and `digital_twin.manage`, allowing authorized engineers to import private source geometry, identify genuine component hotspots and independently review geometry. The existing maintenance manager, planner, supervisor and technician roles receive only `digital_twin.view`, `model_viewer.view` and `hotspots.view` for approved, plant-scoped content. They do **not** receive private-CAD upload/approval rights simply by holding a maintenance role.

Before production rollout, use the dry-run targeted provisioner:

```bash
bunx tsx scripts/smart-anatomy/provision-reliability-role.ts
```

After a database backup, the release operator can explicitly invoke the same provisioner with `--apply` and the authorized `DATABASE_URL`. This idempotently creates only role/permission records; it does **not** create passwords, default users, plant memberships or demonstration data. The administrator must assign **two distinct, named, plant-authorized engineers** in Team & Access. The scan uploader/marker author or CAD uploader cannot approve their own evidence. Engineering model approval and CAD-to-scan registration approval are independently audited.

The disposable CI Repairs UAT creates its own synthetic engineer accounts and owner-only temporary CAD root, verifies the private-file and maker-checker workflow, and runs mobile browser checks. These fixtures are deliberately labelled **synthetic** and are never actual manufacturer CAD or customer plant evidence.

## Approved OEM CAD ↔ as-built scan registration

Once an independently reviewed site scan and separately commissioned OEM/site-owned engineering CAD both exist for **the same registered installed machine**:

1. Open the Real 3D Scan tab and expand **Source CAD ↔ Installed Machine Scan**.
2. Select the exact approved engineering CAD model and manufacturer drawing revision.
3. Pick matching, real physical features in the two 3D viewers (scan and CAD), naming and documenting **3 to 8 uniquely identifiable, noncollinear** physical reference points.
4. The registered solution maps **CAD model-local metres to site scan model-local metres** by a rigid rotation and translation. The software **never scales or stretches** authentic manufacturer geometry to fake correspondence. It rejects incorrect sizes, large landmark residuals, nonfinite coordinates, duplicated features and mirrored geometry.
5. Save a draft alignment. A different engineer independently checks the installed-machine identity, drawing revision, measured scan scale, landmark observations, geometry and residuals before accepting the registration. The scan uploader, CAD uploader and original alignment author cannot self-approve.
6. Only a **separately approved** alignment may superimpose translucent source CAD over the as-built scan. An opacity slider enables visual comparison while the scan and CAD remain separate, unchanged source files. Neither this overlay nor its numerical residuals establish safe lifting clearances, internal part geometry, machining tolerances or work-order authorization.
7. If either original model is withdrawn or superseded, the alignment is unavailable. A corrected scan must be reimported, mapped and independently reviewed rather than secretly changing a certified registration.

The bounded alignment input is at most eight 3D landmark pairs. Registered 3D points and their source-model identities are stored in a dedicated audit-backed alignment table, not embedded into the asset's operational parameters. More advanced multi-scan fusion, native CAD vendor SDK adapters, large-cloud point streaming and fully automated registration remain separately scoped engineering extensions.
