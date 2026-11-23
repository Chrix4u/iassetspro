# Smart Anatomy: Actual manufacturer CAD handoff

The installed machine's real STEP, IGES or BREP source geometry—not an AI-generated picture—can be converted offline into a multi-part GLB for the existing protected Digital Twin and exploded-assembly viewer.

## Accepted engineering handoff

STEP/STP carries product structure and supported physical geometry; IGES/IGS and BREP contain real surfaces but may have less assembly information. A standalone STL remains one visual mesh and must not be split into fabricated parts.

Conversion uses Open Cascade through occt-import-js v0.0.23, an LGPL-2.1 package (comply with its license terms). It runs entirely offline on an engineering-controlled workstation, not inside an iAssetsPro HTTP request and not through a paid AI/API converter.

Example (engineer-authorized CAD only):

~~~bash
bun scripts/smart-anatomy/convert-offline-step.ts \
  --input /secure/oem/pump-revision-A.step \
  --output /secure/review/pump-revision-A.glb \
  --origin licensed-oem \
  --source-note "OEM-authorized engineering assembly drawing revision A"
~~~

The converter writes two restricted (0600), no-overwrite files: pump-revision-A.glb and pump-revision-A.glb.source.json. Before uploading, independently verify that the original manufacturer's CAD still matches the provenance manifest with `bun scripts/smart-anatomy/verify-offline-cad-source.ts --source /secure/oem/pump-revision-A.step --glb /secure/review/pump-revision-A.glb --manifest /secure/review/pump-revision-A.glb.source.json`. It records both source and GLB SHA-256, source format, claimed legal origin, mesh count, source assembly ancestry and triangle count. Additional supported origin classifications: site-owned-design and original-training.

In the machine's Asset Details > Digital Twin > Private CAD model library, upload the generated GLB, optionally attach its matching JSON sidecar, select the identical legal origin classification, and document the source/license. The server validates that the sidecar's GLB checksum actually matches the uploaded geometry before recording bounded converter evidence in the private audit. The original STEP checksum is a user-supplied claim until an engineer separately checks the retained source file.

## In-app original CAD source verification

For **converted licensed OEM CAD** with a matching `.glb.source.json` sidecar, the independent Digital Twin manager must now select the *retained original* STEP/IGES/BREP engineering file in the review panel and choose **Verify retained original CAD source**. The browser sends the authorized source once through an authenticated, plant-scoped, size-bounded HTTPS request. The server checks the immutable registered GLB SHA-256 and the actual original source byte length, filename and SHA-256 against the signed-in uploader's conversion manifest, commits a restricted `source_verified` audit, and **does not retain the uploaded original CAD file**. The original uploader cannot verify their own source.

Before approving a converted licensed OEM model, the server requires this independent original-source audit and rejects a missing or mismatched digest even when the reviewer otherwise ticks all boxes. The approval record explicitly distinguishes (1) exact GLB checksum match, (2) verified original source bytes against its conversion manifest, and (3) **unverified actual manufacturer's authenticity and licensing**. Only the first two can be proven cryptographically by this workflow. The engineer still must check source licensing, the machine's actual make/model/serial, drawing revision, dimensions and maintenance catalog. Models imported directly as original OEM GLB still require documented source and physical engineer review, but have no separate STEP manifest to compare.

Use the imported source tree and exact path binding to associate the individual geometry nodes to their registered assembly/subassembly/component/part codes. For multi-surface source objects, surfaces remain explicitly identified as surfaces; they are not invented OEM parts. An independent second engineer must approve original source, geometry and mappings before publishing the 3D scene.

## Engineering boundaries

- BREP geometry does not reliably declare physical units. Conversion **requires** `--units mm|cm|m|in|ft` sourced from engineering documentation. STEP/IGES are interpreted using embedded CAD units and reject manual units override. Never label unitless BREP coordinates as metres without explicit conversion.
- The authentic GLB reflects the **provided CAD file**, which may not be the right machine serial, variant or revision. Manufacturer drawings, part catalog, units, source licensing, and signed machine inspection are still required.
- Triangulated GLB is for visualization, selection, zoom, isolate and explode/reassemble. It is not a source for machining tolerances, lifting plans, disassembly instructions or live safety limits.
- This first implementation limits each source input and GLB output to 25 MB. Large-machine CAD requires an isolated conversion worker and approved larger storage before release.
- The production web app must not run untrusted CAD conversion, nor enable private CAD uploads without owner-only persistent storage, secure off-site encrypted backup, tested restore, staging/plant-scope UAT and independent engineering acceptance.
- PM frequencies remain calendar/time and meter/usage only. No CAD import automatically creates PM schedules, inventory transactions or work orders.

## Verifications

The bundled Open Cascade test STEP assembly, containing 18 real CAD mesh parts and 3,848 triangles, converted to one private GLB preserving source hierarchy. The output passed source-path and binary validators and loaded via Three.js GLTFLoader with 18 mesh instances. This is an **openly bundled converter fixture**, not a real installed factory machine. Engineer-supplied OEM CAD is still needed to verify the installed-asset use case.
