-- Repair MR→WO conversions created before the canonical planner-material pipeline
-- was added. Those conversions persisted a wo_materials compatibility row but
-- omitted repair_material_requests, so the WO details/material approval flow
-- could not see the planner-selected spare part.
--
-- Backfill only conversion-origin planned material rows and only when the
-- canonical planner_suggested request does not already exist.

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
  `notes`,
  `plantId`,
  `source`,
  `status`,
  `requestedById`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT('rmr_backfill_', REPLACE(UUID(), '-', '')),
  wom.`workOrderId`,
  wom.`itemId`,
  COALESCE(wom.`itemName`, ii.`name`, 'Planned Material'),
  COALESCE(wom.`quantity`, 1),
  0,
  0,
  0,
  COALESCE(ii.`unitOfMeasure`, 'each'),
  COALESCE(wom.`unitCost`, ii.`unitCost`, 0),
  COALESCE(
    wom.`totalCost`,
    COALESCE(wom.`quantity`, 1) * COALESCE(wom.`unitCost`, ii.`unitCost`, 0)
  ),
  'normal',
  CONCAT('Planned for ', w.`woNumber`),
  'Backfilled planner-selected material from maintenance-request conversion',
  w.`plantId`,
  'planner_suggested',
  'pending',
  COALESCE(wom.`requestedBy`, w.`plannerId`, w.`assignedBy`),
  COALESCE(wom.`createdAt`, NOW(3)),
  NOW(3)
FROM `wo_materials` wom
JOIN `work_orders` w
  ON w.`id` = wom.`workOrderId`
LEFT JOIN `inventory_items` ii
  ON ii.`id` = wom.`itemId`
WHERE w.`maintenanceRequestId` IS NOT NULL
  AND wom.`status` = 'planned'
  AND wom.`itemId` IS NOT NULL
  AND COALESCE(wom.`requestedBy`, w.`plannerId`, w.`assignedBy`) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `repair_material_requests` rmr
    WHERE rmr.`workOrderId` = wom.`workOrderId`
      AND rmr.`itemId` = wom.`itemId`
      AND rmr.`source` = 'planner_suggested'
  );
