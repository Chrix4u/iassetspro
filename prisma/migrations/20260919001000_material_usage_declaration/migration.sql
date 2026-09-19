-- Preserve technician material declarations separately from store-authoritative reconciliation.
ALTER TABLE `repair_material_requests`
  ADD COLUMN `declaredConsumedQty` DOUBLE NULL,
  ADD COLUMN `declaredWastedQty` DOUBLE NULL,
  ADD COLUMN `declaredReturnQty` DOUBLE NULL,
  ADD COLUMN `usageDeclarationNotes` TEXT NULL,
  ADD COLUMN `usageDeclaredById` VARCHAR(191) NULL,
  ADD COLUMN `usageDeclaredAt` DATETIME(3) NULL;
