# iAssetsPro — Real machine commissioning acceptance protocol

**Status:** Engineering preflight for unreleased Smart Anatomy. Completing automated CI or a demonstration assembly does **not** certify the installed machine, OEM source, operating limits, PM safety, or production results.

## Evidence that must exist before the final site acceptance
1. Installed machine nameplate photograph with exact manufacturer, model, serial, variant and drawing revision. Obtain the actual vendor-authorized assembly STEP/STP, IGES/IGS, BREP, or self-contained GLB and genuine parts catalogue and maintenance manual. Verify license and drawing applicability; do not substitute AI-generated internal geometry.
2. Six **real** site photos, each explicitly labelled front, back, left, right, top and bottom. Links and hotspots must identify a registered component, not a guessed hidden piece.
3. A working off-site **encrypted** CAD backup destination, a recorded independent restore verification and a dedicated owner-only CAD storage directory. A successful same-host Restic snapshot alone cannot satisfy this requirement.
4. A test plant with actual functional-location hierarchy, machine/component register, inspection-parameter ranges, real unit-bearing meters, at least one planner, assigned shift leader, operator, independent production reviewer, storekeeper, supervisor and technician.
5. Engineer's latest production-survey workbook and confirmed sample numeric inputs/results. Compare every relevant aggregate/formula against the authoritative file, not a fabricated demonstration total.

## Exact witnessed role sequence

### 1. Administration and asset register
- Create plant/facility/area/position in the functional-location hierarchy, then register the actual machine at that complete hierarchy path.
- Enter nameplate identity and **verified** inspection parameters, each with visual/measurement type, minimum, maximum, unit and source reference.
- Register relevant production-output and actual cumulative running-hour meters. Record an observed opening value when evidence exists; the software must not turn a default zero into an observed reading.
- Confirm asset list has readable responsive columns, full location path is in Asset Details, dates display dd-mm-yyyy or dd/mm/yyyy, and no redundant location fields are required.

### 2. Engineer — hierarchy, diagrams and CAD
- Build/approve assembly → subassembly → component → part hierarchy with original codes and source parts book. AI proposals must stay **uncommissioned** until independently reviewed.
- Convert only approved real source CAD using the pinned offline OpenCascade converter. Check units, source hierarchy, number of distinct **physical product groups**, not merely tessellated surfaces, and save the provenance sidecar.
- Upload the verified GLB and sidecar privately. Another authorized Digital Twin manager must inspect the retained original source (exact SHA-256), manufacturer model/serial/revision, dimensions, source licensing and node-to-registered-part bindings before commissioning.
- Verify private unapproved CAD gives 403 to ordinary plant viewers; approved scenes remain plant-scoped. One genuine CAD part tessellated into several surfaces moves together during exploded/reassembled views. A monolithic geometry cannot be falsely disassembled.
- Attach all six actual photos and manually map clickable hotspot coordinates to registered components.

### 3. Planner — schedules and production targets
- Create optional morning, afternoon and night templates with correct Ghana (UTC/GMT) date semantics. Use any valid enterprise shift pattern (not three compulsory shifts).
- For each scheduled machine/day/shift, set starting/ending clock, available minutes, product/design code, target quantity and unit, standard speed/utilization, team leader and assigned active crew.
- Confirm overlapping machine or worker shift allocations, including overnight and cross-plant double-booking, are rejected atomically.
- Confirm operator with another plant/machine/shift cannot see or submit the protected roster.

### 4. Operator → independent supervisor/production manager
- After shift ends, assigned operator records gross output, defects, start delay, every stoppage category, and genuine observed production/output counter and optional actual cumulative hour-meter value with evidence.
- Unassigned users and submissions before shift end are rejected. Absent shifts are **missing**; never silently impute zero output.
- Independent reviewer approves/rejects with audit. The recorder cannot approve their own shift.
- One approval posts each output quantity **once** to the production meter; an actual runtime observation is separately verified before any runtime meter update. Repeated approval cannot double-post readings.

### 5. Production report, PM and repair evidence
- Match the engineer's workbook on daily, Sunday–Saturday weekly, monthly, quarterly and yearly reports: planned vs approved shifts, gross/good/defective quantities, downtimes, productive minutes, utilization, speed, targets, achievement and true cumulative output across period boundaries.
- Register **only two PM frequency families**, calendar/time and meter/usage. Test a 5,000-tonne output threshold before, at and after the due point. Pending/unapproved production must not advance PM usage.
- Follow the full repair and PM work order sequence: request → supervisor approval → planner assessment → WO/tasks → assignments → materials/tools → evidence → used/wasted/returned/replaced stock → storekeeper reconciliation → closure.
- Retain technical source/meter-reading provenance, audit history and screenshots/report exports. Test both desktop and mobile layouts and all affected modal controls.

## Automated release gate and operational boundaries
- Keep the complete implementation in the GitHub Smart Anatomy draft branch until full GitHub CI passes on its **final** head, the real OEM file/parts book is verified, storage recovery works off-site, and the workflow above is witnessed.
- The Asset Details “Machine commissioning preflight” reads actual plant-scoped database records. “Configured” means the expected record/setup exists, **not** that an engineer physically inspected the machine. CAD physical authenticity remains unverified until there is independent manufacturer evidence and signed site acceptance.
- Do not write production CAD or credentials into public, static or repository paths. Keep only the currently deployed immutable release and the rollback release on the VPS; release/version via GitHub first.
