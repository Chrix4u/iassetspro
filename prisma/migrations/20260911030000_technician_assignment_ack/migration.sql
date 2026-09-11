ALTER TABLE `work_orders`
  ADD COLUMN `assignmentResponseStatus` VARCHAR(191) NOT NULL DEFAULT 'pending' AFTER `assignmentType`,
  ADD COLUMN `assignmentRespondedBy` VARCHAR(191) NULL AFTER `assignmentResponseStatus`,
  ADD COLUMN `assignmentRespondedAt` DATETIME(3) NULL AFTER `assignmentRespondedBy`,
  ADD COLUMN `assignmentResponseReason` TEXT NULL AFTER `assignmentRespondedAt`;

CREATE INDEX `work_orders_assignedTo_assignmentResponseStatus_idx`
  ON `work_orders`(`assignedTo`, `assignmentResponseStatus`);

-- Existing work already beyond assignment is treated as historically accepted.
UPDATE `work_orders`
SET `assignmentResponseStatus` = 'accepted',
    `assignmentRespondedAt` = COALESCE(`actualStart`, `updatedAt`)
WHERE `status` IN (
  'in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown',
  'waiting_permit', 'on_hold', 'pending_handover', 'completed', 'verified', 'closed'
);
