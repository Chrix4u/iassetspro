# Functional Location Asset Assignment / Relocation Plan

## Goal
Add the Phase 2 backend contract that installs assets at configurable Functional Locations while preserving immutable relocation history and keeping legacy location fields intact during transition.

## Invariants
- Asset assignment is separate from Asset parent/child hierarchy and Component Registry hierarchy.
- A functional location must be active and its hierarchy level must allow asset assignment.
- The asset and target functional location must belong to the same plant.
- There can be at most one open/current assignment for an asset in a hierarchy system.
- Reassigning an asset to its existing current location is idempotent.
- Relocation closes the prior row and creates a new row in one database transaction.
- History rows are never rewritten or deleted by normal assignment/relocation operations.
- Assignment and relocation writes are audited in the same transaction.
- Current primary location is derived from the current assignment in the hierarchy system whose `isPrimary=true`; no duplicate mutable `currentLocationId` truth is stored on Asset.
- Existing Asset `location/building/floor/area` fields remain untouched for migration compatibility.

## Schema
Add `AssetFunctionalLocationAssignment` with asset/system/location references, `assignedAt`, nullable `endedAt`, actor references, and optional reason/note. Add PostgreSQL partial unique index for one open row per `(assetId, hierarchySystemId)`.

## Service
Create `src/lib/functional-location/asset-assignment.ts`:
- `assignAssetToFunctionalLocation(...)`
- `getAssetFunctionalLocationAssignments(...)`
- `getCurrentAssetFunctionalLocations(...)`

Use a transaction for assignment/relocation and audit. Preserve current row on idempotent same-location requests.

## API
Add `/api/assets/[id]/functional-locations`:
- GET requires `assets.functional_locations.view` (or admin), enforces asset plant scope, returns current assignments and history with location/system metadata.
- POST requires `assets.functional_locations.assign` (or admin), enforces asset plant scope and target location plant scope, then delegates to the service.

## Tests
TDD contracts first:
- schema/migration relation and partial-unique invariant
- service transactional/idempotent/eligibility/plant/audit behavior contract
- API authentication/RBAC/plant-scope contract
- legacy free-text asset location fields remain present

## Delivery
1. Capture RED contract tests.
2. Implement additive schema + migration.
3. Implement service.
4. Implement GET/POST route.
5. Run focused tests, Prisma generate, lint, touched TypeScript gate, full unit tests as practical.
6. Open PR against `main`; require exact-head full CI before merge.
