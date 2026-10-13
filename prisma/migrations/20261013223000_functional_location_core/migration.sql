-- Configurable Functional Location / Asset Path hierarchy core.
-- Additive only: existing asset location columns remain unchanged.

CREATE TABLE "hierarchy_systems" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'functional_location',
  "description" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "codeMode" TEXT NOT NULL DEFAULT 'mixed',
  "codeSeparator" TEXT NOT NULL DEFAULT '-',
  "allowCodeOverride" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hierarchy_systems_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hierarchy_systems_purpose_check" CHECK ("purpose" IN ('functional_location', 'electrical', 'process', 'utilities', 'facilities', 'custom')),
  CONSTRAINT "hierarchy_systems_code_mode_check" CHECK ("codeMode" IN ('manual', 'generated', 'mixed')),
  CONSTRAINT "hierarchy_systems_separator_check" CHECK ("codeSeparator" ~ '^[^A-Za-z0-9[:space:]]$'),
  CONSTRAINT "hierarchy_systems_code_format_check" CHECK ("code" = upper("code") AND "code" ~ '^[A-Z0-9][A-Z0-9._/:_-]*$')
);

CREATE TABLE "hierarchy_levels" (
  "id" TEXT NOT NULL,
  "hierarchySystemId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "allowAssetAssignment" BOOLEAN NOT NULL DEFAULT false,
  "codePrefix" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hierarchy_levels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hierarchy_levels_hierarchySystemId_order_key" UNIQUE ("hierarchySystemId", "order"),
  CONSTRAINT "hierarchy_levels_order_check" CHECK ("order" > 0),
  CONSTRAINT "hierarchy_levels_prefix_check" CHECK ("codePrefix" IS NULL OR ("codePrefix" = upper("codePrefix") AND "codePrefix" ~ '^[A-Z0-9_-]+$'))
);

CREATE TABLE "functional_locations" (
  "id" TEXT NOT NULL,
  "hierarchySystemId" TEXT NOT NULL,
  "hierarchyLevelId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "codeSegment" TEXT,
  "locationCode" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "plantId" TEXT,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "functional_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "functional_locations_hierarchySystemId_locationCode_key" UNIQUE ("hierarchySystemId", "locationCode"),
  CONSTRAINT "functional_locations_status_check" CHECK ("status" IN ('active', 'inactive', 'retired')),
  CONSTRAINT "functional_locations_depth_check" CHECK ("depth" >= 0),
  CONSTRAINT "functional_locations_not_own_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  CONSTRAINT "functional_locations_code_format_check" CHECK ("locationCode" = upper("locationCode") AND "locationCode" ~ '^[A-Z0-9][A-Z0-9._/:_-]*$'),
  CONSTRAINT "functional_locations_segment_check" CHECK ("codeSegment" IS NULL OR ("codeSegment" = upper("codeSegment") AND "codeSegment" ~ '^[A-Z0-9_-]+$'))
);

CREATE UNIQUE INDEX "hierarchy_systems_code_key" ON "hierarchy_systems"("code");
CREATE INDEX "hierarchy_systems_isPrimary_isActive_idx" ON "hierarchy_systems"("isPrimary", "isActive");
-- Current iAssetsPro installations have one CompanyProfile; this guarantees one active primary hierarchy per installation.
CREATE UNIQUE INDEX "hierarchy_systems_one_active_primary_idx" ON "hierarchy_systems"("isPrimary") WHERE "isPrimary" = true AND "isActive" = true;

CREATE INDEX "hierarchy_levels_hierarchySystemId_isActive_idx" ON "hierarchy_levels"("hierarchySystemId", "isActive");
CREATE INDEX "functional_locations_hierarchySystemId_parentId_idx" ON "functional_locations"("hierarchySystemId", "parentId");
CREATE INDEX "functional_locations_hierarchyLevelId_idx" ON "functional_locations"("hierarchyLevelId");
CREATE INDEX "functional_locations_plantId_idx" ON "functional_locations"("plantId");
CREATE INDEX "functional_locations_status_idx" ON "functional_locations"("status");

ALTER TABLE "hierarchy_systems"
  ADD CONSTRAINT "hierarchy_systems_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hierarchy_levels"
  ADD CONSTRAINT "hierarchy_levels_hierarchySystemId_fkey"
  FOREIGN KEY ("hierarchySystemId") REFERENCES "hierarchy_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "functional_locations"
  ADD CONSTRAINT "functional_locations_hierarchySystemId_fkey"
  FOREIGN KEY ("hierarchySystemId") REFERENCES "hierarchy_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "functional_locations"
  ADD CONSTRAINT "functional_locations_hierarchyLevelId_fkey"
  FOREIGN KEY ("hierarchyLevelId") REFERENCES "hierarchy_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "functional_locations"
  ADD CONSTRAINT "functional_locations_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "functional_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "functional_locations"
  ADD CONSTRAINT "functional_locations_plantId_fkey"
  FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "functional_locations"
  ADD CONSTRAINT "functional_locations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
