# Configurable Functional Location & Asset Path Hierarchy Design

Date: 2026-10-12
Status: Approved
Project: iAssetsPro EAM

## Goal
Create a first-class configurable functional-location / asset-path subsystem so each customer can define its own hierarchy labels and depth without hard-coding Plant/Department/Area. Keep this separate from asset-to-asset equipment hierarchy and internal machine/component hierarchy. Location Codes are first-class identifiers used in search, assignment, labels/QRs, imports/exports, work orders, PM and reporting.

## Architecture
A company can create multiple named hierarchy systems, such as Primary Functional Location, Electrical Distribution, Process Flow, Utilities, Facilities, or Custom. One active system is primary. Each system has ordered customer-defined levels, e.g. `Company -> Factory -> Department -> Area -> Line -> Functional Location` or `Company -> Location -> Block -> Floor -> Section -> Position`.

Three structures stay independent:
1. Functional/location path: where an asset is installed.
2. Asset/equipment hierarchy: maintainable assets under other maintainable assets.
3. Machine/component hierarchy: assembly -> subassembly -> component -> part.

## Data model
### HierarchySystem
Fields: id, name, code, purpose, description, isPrimary, isActive, codeMode, codeSeparator, tenant/company scope, creator, timestamps. `purpose` supports functional_location, electrical, process, utilities, facilities, custom. `codeMode` supports manual, generated, mixed.

### HierarchyLevel
Fields: id, hierarchySystemId, order, label, description, isRequired, allowAssetAssignment, codePrefix, isActive. Labels are display metadata, never relational keys.

### FunctionalLocation
Fields: id, hierarchySystemId, hierarchyLevelId, parentId, name, codeSegment, locationCode, description, status, plantId bridge for existing scope controls, depth, creator, timestamps. Enforce unique `(hierarchySystemId, locationCode)`, no cross-system parent, no cycles, and configured level order.

### AssetLocationAssignment
Fields: id, assetId, hierarchySystemId, functionalLocationId, isPrimary, assignedAt, unassignedAt, assignedBy, reason. This preserves multiple hierarchy systems and relocation history. Enforce one current assignment per asset/system and one current primary functional location. Relocation closes the old assignment and creates the new one transactionally.

## Location Codes
Location Code is a human identifier, not a database primary key. Examples: `TEMA-PRT-L01-P03`, `PLT1-BLK-A-YD02`, `SUBA-MCC04-P12-F07`.

Modes:
- Manual: user enters full code.
- Generated: parent code + configured segment/prefix.
- Mixed: system proposes a generated code and authorized users may override it. Mixed is the default.

Controls include separator, level prefix, manual override permission, uppercase normalization, allowed characters, uniqueness validation, live preview, optional max length, and audit history for code changes. Stable node IDs ensure code changes do not break maintenance history.

## UX
### Settings -> Asset Management -> Hierarchy Systems
Admins can create/edit/archive systems, mark one primary, add/remove/rename/reorder levels, make levels required/optional, choose assignable levels, configure code mode/separator/prefixes, and preview the path/code. Default starter template: `Company -> Site / Plant -> Area -> Line / System -> Functional Location`, fully configurable.

### Functional Locations
Tree browser with system selector, name/code search, expand/collapse, Add Child, Edit, guarded Move, Archive/Retire, asset count, breadcrumb/path, location code, and import/export. Initial release uses guarded Move rather than drag/drop.

### Add/Edit Asset
Add a Functional Location selector that shows both code and breadcrumb, e.g. `TEMA-PRT-L01-P03 - Tema Factory > Printing > Line 01 > Position 03`. Existing plantId, departmentId, location, building, floor and area remain during migration but structured location becomes the preferred source of truth.

### Asset detail
Show separate sections for Installed At / Asset Path, Asset / Equipment Structure, and Machine Structure. Replace generic `No Hierarchy` with precise states such as `No functional location assigned`, `No child assets`, and `No machine components registered`.

## API/service boundaries
Route families: `/api/hierarchy-systems`, `/api/hierarchy-systems/:id/levels`, `/api/functional-locations`, `/api/functional-locations/:id/move`, `/api/functional-locations/:id/path`, `/api/assets/:id/location-assignments`, and aggregated `/api/assets/:id/hierarchy`.

Shared services enforce code normalization/generation, uniqueness, cycle prevention, level ordering, subtree moves, plant scope, relocation history, breadcrumb assembly and audit logging.

## Security
Integrate with existing RBAC and plant scope. Recommended permissions: `assets.hierarchy.view/manage`, `assets.functional_locations.view/manage/assign`. Hierarchy configuration remains admin/settings-only. Server APIs enforce scope; UI hiding is not sufficient.

## Migration
1. Additive schema and seed default Primary Functional Location system.
2. Idempotent preview/import from existing Plant, Department, Asset location/building/floor/area data.
3. Assign assets to structured locations while preserving old fields.
4. Update asset forms/detail, work orders, PM, reports and search to use structured paths first with legacy fallback.
5. Retire legacy free-text inputs only after production migration and report parity; column removal is a separate future decision.

## Reporting
Expose paths/codes to asset register, maintenance requests, work orders, PM, downtime/KPI reports, spare analysis, inspections, QR/labels, imports/exports, audit and future AI. Reports must support descendant rollup from any selected hierarchy node.

## Performance
Use self-referencing `parentId` adjacency list initially, with `depth` and indexed system/parent queries. Resolve breadcrumbs through a shared path service. Defer PostgreSQL ltree/closure-table optimization until load testing proves need.

## Required tests
Cover system-code uniqueness, one primary system, level ordering, optional-level skips, code normalization/uniqueness, manual/generated/mixed codes, cross-system parent rejection, cycle prevention, move validation, plant scope, assignable-level rules, transactional relocation, one current assignment per asset/system, breadcrumbs, legacy fallback, audit logs, and responsive tree/breadcrumb UI contracts.

## Acceptance criteria
An admin can create hierarchy systems and levels, configure Location Codes, build/search the tree, assign/relocate assets with history, see full coded breadcrumbs on asset detail, view equipment and component hierarchies separately, roll reports up through hierarchy nodes, and migrate existing location data without loss.

## Non-goals for v1
GIS/maps, arbitrary graph relationships, drag/drop moves before guarded Move is proven, deleting legacy location columns, and ltree/closure-table optimization without evidence.
