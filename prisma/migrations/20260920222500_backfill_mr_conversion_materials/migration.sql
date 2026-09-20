-- Backfill planner-selected materials from the legacy MR -> WO conversion path.
--
-- Historical conversions wrote a wo_materials row with status='planned' but did
-- not create the canonical repair_material_requests record. That made the part
-- disappear from the normal Materials & Parts workflow even though the planner
-- had selected it during conversion.
--
-- This migration is idempotent: an existing planner_suggested request for the
-- same WO/item prevents another row from being inserted.

INSERT INTO `repair_material_requests` (
  `id`,
  `workOrderId`,
  `itemId`,
  `itemName`,
  `quantityRequested`,
  `quantityApproved`,
  `quantityIssued`,
  `quantityReturned`,
  `unit`,
  `unitCost`,
  `estimatedCost`,
  `urgency`,
  `reason`,
  `plantId`,
  `source`,
  `status`,
  `requestedById`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT('rmr_', REPLACE(UUID(), '-', '')),
  wm.`workOrderId`,
  wm.`itemId`,
  COALESCE(NULLIF(wm.`itemName`, ''), ii.`name`),
  COALESCE(wm.`quantity`, 1),
  0,
  0,
  0,
  COALESCE(NULLIF(ii.`unitOfMeasure`, ''), 'each'),
  COALESCE(wm.`unitCost`, ii.`unitCost`, 0),
  COALESCE(wm.`totalCost`, COALESCE(wm.`quantity`, 1) * COALESCE(wm.`unitCost`, ii.`unitCost`, 0)),
  'normal',
  CONCAT('Planner suggested material (legacy MR conversion backfill for ', wo.`woNumber`, ')'),
  COALESCE(wo.`plantId`, ii.`plantId`),
  'planner_suggested',
  'pending',
  COALESCE(wm.`requestedBy`, wo.`plannerId`, wo.`assignedBy`),
  COALESCE(wm.`createdAt`, NOW(3)),
  NOW(3)
FROM `wo_materials` wm
JOIN `work_orders` wo
  ON wo.`id` = wm.`workOrderId`
JOIN `inventory_items` ii
  ON ii.`id` = wm.`itemId`
WHERE wm.`status` = 'planned'
  AND wm.`itemId` IS NOT NULL
  AND COALESCE(wm.`requestedBy`, wo.`plannerId`, wo.`assignedBy`) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `repair_material_requests` rmr
    WHERE rmr.`workOrderId` = wm.`workOrderId`
      AND rmr.`itemId` = wm.`itemId`
      AND rmr.`source` = 'planner_suggested'
  );
