-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "staffId" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isVendorAdmin" BOOLEAN NOT NULL DEFAULT false,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "notificationPreferences" JSONB,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "primaryTrade" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_modules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "isSystemLicensed" BOOLEAN NOT NULL DEFAULT false,
    "licenseKey" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_modules" (
    "id" TEXT NOT NULL,
    "systemModuleId" TEXT NOT NULL,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "licensedAt" TIMESTAMP(3),
    "licensedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "activationLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "parentId" TEXT,
    "supervisorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_plants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'read',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "workflowStatus" TEXT NOT NULL DEFAULT 'pending',
    "machineDownStatus" BOOLEAN DEFAULT false,
    "assetId" TEXT,
    "assetName" TEXT,
    "location" TEXT,
    "departmentId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "supervisorId" TEXT,
    "approvedBy" TEXT,
    "assignedPlannerId" TEXT,
    "workOrderId" TEXT,
    "plantId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "slaHours" DOUBLE PRECISION,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "lastEscalatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "woNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'corrective',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "maintenanceRequestId" TEXT,
    "pmScheduleId" TEXT,
    "assetId" TEXT,
    "assetName" TEXT,
    "departmentId" TEXT,
    "assignedTo" TEXT,
    "teamLeaderId" TEXT,
    "assignedSupervisorId" TEXT,
    "assignedBy" TEXT,
    "assignmentType" TEXT,
    "assignmentResponseStatus" TEXT NOT NULL DEFAULT 'pending',
    "assignmentRespondedBy" TEXT,
    "assignmentRespondedAt" TIMESTAMP(3),
    "assignmentResponseReason" TEXT,
    "plannerId" TEXT,
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractorCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "failureDescription" TEXT,
    "causeDescription" TEXT,
    "actionDescription" TEXT,
    "tradeActivity" TEXT,
    "safetyNotes" TEXT,
    "ppeRequired" TEXT,
    "plantId" TEXT,
    "notes" TEXT,
    "personalTools" TEXT NOT NULL DEFAULT '[]',
    "suggestedParts" TEXT NOT NULL DEFAULT '[]',
    "suggestedTools" TEXT NOT NULL DEFAULT '[]',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "lastEscalatedAt" TIMESTAMP(3),
    "workPackageId" TEXT,
    "laborRateApplied" DOUBLE PRECISION,
    "laborCurrency" TEXT DEFAULT 'GHS',

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_team_members" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "accessLevel" TEXT NOT NULL DEFAULT 'full',
    "addedById" TEXT,
    "addedVia" TEXT NOT NULL DEFAULT 'direct',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wo_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_team_member_requests" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedUserId" TEXT,
    "requestedTrade" TEXT,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wo_team_member_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_time_logs" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "notes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT,
    "isTeamLog" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "activityType" TEXT NOT NULL DEFAULT 'maintenance',
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "pauseReason" TEXT,
    "sessionId" TEXT,

    CONSTRAINT "wo_time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_materials" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wo_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_comments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "plantId" TEXT,
    "assignedToId" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "shift" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "totalEstimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalActualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_task_executions" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "templateTaskId" TEXT,
    "taskNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'check',
    "requiredParts" TEXT,
    "estimatedMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "findings" TEXT,
    "photos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wo_task_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_transitions" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "allowedRoleSlugs" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "plantId" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notifiedUsers" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "tradingName" TEXT,
    "logo" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "employeeCount" TEXT,
    "fiscalYearStart" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "isSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "setupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "yearManufactured" INTEGER,
    "condition" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'operational',
    "criticality" TEXT NOT NULL DEFAULT 'medium',
    "location" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "area" TEXT,
    "plantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "warrantyExpiry" TIMESTAMP(3),
    "installedDate" TIMESTAMP(3),
    "expectedLifeYears" INTEGER,
    "currentValue" DOUBLE PRECISION,
    "depreciationRate" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "drawingsUrl" TEXT,
    "manualUrl" TEXT,
    "specification" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'each',
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStockLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxStockLevel" DOUBLE PRECISION,
    "reorderQuantity" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "supplier" TEXT,
    "supplierPartNumber" TEXT,
    "location" TEXT,
    "binLocation" TEXT,
    "shelfLocation" TEXT,
    "plantId" TEXT NOT NULL,
    "locationId" TEXT,
    "supplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "specification" TEXT NOT NULL,
    "imageUrls" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousStock" DOUBLE PRECISION NOT NULL,
    "newStock" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_schedules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assetId" TEXT NOT NULL,
    "componentId" TEXT,
    "frequencyType" TEXT NOT NULL,
    "frequencyValue" INTEGER NOT NULL,
    "lastCompletedDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "estimatedDuration" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignedToId" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerateWO" BOOLEAN NOT NULL DEFAULT true,
    "leadDays" INTEGER NOT NULL DEFAULT 3,
    "woTypeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "pm_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'preventive',
    "category" TEXT,
    "estimatedDuration" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "requiredSkills" TEXT,
    "requiredTools" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pm_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_template_tasks" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'check',
    "requiredParts" TEXT,
    "estimatedMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pm_template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_triggers" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerValue" DOUBLE PRECISION NOT NULL,
    "triggerConfig" TEXT,
    "lastTriggeredAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pm_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_status_history" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wo_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mr_comments" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mr_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "proficiencyLevel" TEXT NOT NULL DEFAULT 'intermediate',
    "yearsExperience" INTEGER,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "location" TEXT,
    "plantId" TEXT,
    "assetId" TEXT,
    "groupId" TEXT,
    "parameter" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "thresholdMin" DOUBLE PRECISION,
    "thresholdMax" DOUBLE PRECISION,
    "lastReading" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "batteryLevel" INTEGER,
    "signalStrength" INTEGER,
    "firmwareVersion" TEXT,
    "pollingInterval" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iot_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_readings" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "iot_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_alerts" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ruleId" TEXT,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_alert_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iot_alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "toolCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "condition" TEXT NOT NULL DEFAULT 'good',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT,
    "plantId" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "manufacturer" TEXT,
    "model" TEXT,
    "assignedToId" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "expectedReturn" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_transactions" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "notes" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workOrderId" TEXT,

    CONSTRAINT "tool_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'warehouse',
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "requestedById" TEXT NOT NULL,
    "departmentId" TEXT,
    "plantId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityRequested" DOUBLE PRECISION NOT NULL,
    "quantityFulfilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "inventory_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "website" TEXT,
    "rating" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "expectedDelivery" TIMESTAMP(3),
    "notes" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "quantityReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_records" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityReceived" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "receivedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receiving_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" TEXT NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "assetId" TEXT,
    "departmentId" TEXT,
    "plantId" TEXT,
    "reportedById" TEXT NOT NULL,
    "investigatedById" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "daysLost" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "lastEscalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_inspections" (
    "id" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "location" TEXT,
    "departmentId" TEXT,
    "inspectorId" TEXT,
    "findings" TEXT NOT NULL,
    "score" INTEGER,
    "maxScore" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_training" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "trainer" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "location" TEXT,
    "attendees" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "location" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "expiryDate" TIMESTAMP(3),
    "lastInspected" TIMESTAMP(3),
    "nextInspection" TIMESTAMP(3),
    "condition" TEXT NOT NULL DEFAULT 'good',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_permits" (
    "id" TEXT NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "hazardAssessment" TEXT,
    "precautions" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orderId" TEXT,
    "assetId" TEXT,
    "itemId" TEXT,
    "plantId" TEXT,
    "inspectedById" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "result" TEXT,
    "defects" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformance_reports" (
    "id" TEXT NOT NULL,
    "ncrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "status" TEXT NOT NULL DEFAULT 'open',
    "type" TEXT NOT NULL,
    "sourceInspectionId" TEXT,
    "assetId" TEXT,
    "itemId" TEXT,
    "departmentId" TEXT,
    "raisedById" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "non_conformance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_audits" (
    "id" TEXT NOT NULL,
    "auditNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "auditedById" TEXT,
    "departmentId" TEXT,
    "scope" TEXT,
    "findings" TEXT NOT NULL,
    "score" INTEGER,
    "maxScore" INTEGER,
    "recommendation" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_control_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemId" TEXT,
    "assetId" TEXT,
    "type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "characteristics" TEXT NOT NULL,
    "sampleSize" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_control_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" TEXT NOT NULL,
    "capaNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "rootCause" TEXT,
    "correctiveAction" TEXT NOT NULL,
    "preventiveAction" TEXT,
    "responsibleId" TEXT,
    "dueDate" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "effectiveness" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpcProcess" (
    "id" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "specMin" DOUBLE PRECISION,
    "specMax" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "samples" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpcProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "location" TEXT,
    "capacity" INTEGER,
    "capacityUnit" TEXT NOT NULL DEFAULT 'units/hour',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "productId" TEXT,
    "productName" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "completedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "workCenterId" TEXT,
    "plantId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "completedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "yield_" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "readingNumber" TEXT NOT NULL,
    "assetId" TEXT,
    "plantId" TEXT,
    "meterName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "consumption" DOUBLE PRECISION,
    "notes" TEXT,
    "readById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "instructor" TEXT,
    "maxParticipants" INTEGER,
    "certification" BOOLEAN NOT NULL DEFAULT false,
    "validForMonths" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_handovers" (
    "id" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "shiftType" TEXT NOT NULL,
    "fromShift" TEXT,
    "toShift" TEXT,
    "departmentId" TEXT,
    "workOrderId" TEXT,
    "handedOverById" TEXT NOT NULL,
    "receivedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tasksSummary" TEXT NOT NULL,
    "pendingIssues" TEXT NOT NULL,
    "safetyNotes" TEXT,
    "equipmentStatus" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "departmentId" TEXT,
    "assetId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_responses" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "completedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pass',
    "responses" TEXT NOT NULL,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "targetGroup" TEXT,
    "questions" TEXT NOT NULL,
    "responses" TEXT NOT NULL,
    "totalResponses" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" TEXT NOT NULL,
    "calibrationNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assetId" TEXT,
    "instrumentName" TEXT,
    "serialNumber" TEXT,
    "calibrationDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'calibrated',
    "standardUsed" TEXT,
    "result" TEXT,
    "asFound" TEXT,
    "asLeft" TEXT,
    "uncertainty" DOUBLE PRECISION,
    "performedById" TEXT,
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "assessmentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assetId" TEXT,
    "departmentId" TEXT,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "nextReview" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "likelihood" INTEGER,
    "consequence" INTEGER,
    "riskLevel" TEXT,
    "hazards" TEXT NOT NULL,
    "controls" TEXT NOT NULL,
    "residualRisk" TEXT,
    "assessorId" TEXT,
    "reviewerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loto_records" (
    "id" TEXT NOT NULL,
    "lotoNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assetId" TEXT,
    "departmentId" TEXT,
    "plantId" TEXT,
    "workOrderId" TEXT,
    "lotoType" TEXT NOT NULL DEFAULT 'routine',
    "energySource" TEXT NOT NULL,
    "energySourceDesc" TEXT,
    "requestedById" TEXT,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledDate" TIMESTAMP(3),
    "requiredFromDate" TIMESTAMP(3),
    "requiredToDate" TIMESTAMP(3),
    "supervisorId" TEXT,
    "supervisorApprovedAt" TIMESTAMP(3),
    "safetyOfficerId" TEXT,
    "safetyOfficerApprovedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "isolationPoints" TEXT NOT NULL,
    "lockDevices" TEXT NOT NULL,
    "tagNumbers" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "verificationDate" TIMESTAMP(3),
    "affectedWorkers" TEXT,
    "workerCount" INTEGER,
    "appliedBy" TEXT,
    "removedBy" TEXT,
    "removedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loto_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_of_materials" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childAssetId" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "specification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_twins" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "parameters" TEXT NOT NULL,
    "connections" TEXT NOT NULL,
    "specification" TEXT,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "syncInterval" TEXT NOT NULL DEFAULT '5min',
    "lastSynced" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_twins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'glb',
    "boundingBox" TEXT,
    "meshCount" INTEGER NOT NULL DEFAULT 0,
    "vertexCount" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "uploadedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_mesh_bindings" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "meshName" TEXT NOT NULL,
    "meshPath" TEXT,
    "meshType" TEXT NOT NULL DEFAULT 'component',
    "isClickable" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "colorOverride" TEXT,
    "opacity" DOUBLE PRECISION,
    "explodeOffset" TEXT,
    "metadata" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_mesh_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_twin_scenes" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sceneType" TEXT NOT NULL DEFAULT '3d',
    "environment" TEXT NOT NULL DEFAULT 'warehouse',
    "backgroundColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "groundPlane" BOOLEAN NOT NULL DEFAULT true,
    "gridEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ambientLight" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "directionalLight" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "defaultCameraPosition" TEXT,
    "defaultCameraTarget" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "modelFileId" TEXT,

    CONSTRAINT "digital_twin_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twin_hotspots" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "bindingId" TEXT,
    "assetId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "position" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'info',
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "isAlwaysVisible" BOOLEAN NOT NULL DEFAULT false,
    "isPulsing" BOOLEAN NOT NULL DEFAULT false,
    "dataPoint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twin_hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twin_camera_presets" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "fov" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "transitionDuration" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twin_camera_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twin_annotations" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "assetId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "priority" TEXT NOT NULL DEFAULT 'low',
    "color" TEXT NOT NULL DEFAULT '#fbbf24',
    "position" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twin_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_diagrams" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'process',
    "nodes" TEXT NOT NULL,
    "edges" TEXT NOT NULL,
    "viewport" TEXT,
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_diagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'direct',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_material_requests" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "componentRegistryId" TEXT,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantityRequested" DOUBLE PRECISION NOT NULL,
    "quantityApproved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantityIssued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantityReturned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "unitCost" DOUBLE PRECISION,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "plantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'technician',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "supervisorApprovedQuantity" DOUBLE PRECISION,
    "storekeeperApprovedQuantity" DOUBLE PRECISION,
    "stockReserved" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "supervisorApprovedById" TEXT,
    "supervisorApprovedAt" TIMESTAMP(3),
    "storekeeperApprovedById" TEXT,
    "storekeeperApprovedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "consumedQty" DOUBLE PRECISION,
    "wastedQty" DOUBLE PRECISION,
    "declaredConsumedQty" DOUBLE PRECISION,
    "declaredWastedQty" DOUBLE PRECISION,
    "declaredReturnQty" DOUBLE PRECISION,
    "usageDeclarationNotes" TEXT,
    "usageDeclaredById" TEXT,
    "usageDeclaredAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "pickedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_tool_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT,
    "workOrderId" TEXT NOT NULL,
    "toolId" TEXT,
    "toolName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "plantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'technician',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "rejectionReason" TEXT,
    "toolConditionAtIssue" TEXT,
    "toolConditionAtReturn" TEXT,
    "requestedById" TEXT NOT NULL,
    "supervisorApprovedById" TEXT,
    "supervisorApprovedAt" TIMESTAMP(3),
    "storekeeperApprovedById" TEXT,
    "storekeeperApprovedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnConfirmedById" TEXT,
    "returnConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_tool_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_tool_request_items" (
    "id" TEXT NOT NULL,
    "repairToolRequestId" TEXT NOT NULL,
    "toolId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolCode" TEXT,
    "category" TEXT,
    "quantityRequested" INTEGER NOT NULL DEFAULT 1,
    "quantityApproved" INTEGER,
    "quantityIssued" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityTransferred" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "availabilityStatus" TEXT,
    "issueNotes" TEXT,
    "conditionAtIssue" TEXT,
    "conditionAtReturn" TEXT,
    "pendingReturnQty" INTEGER,
    "pendingReturnCondition" TEXT,
    "pendingReturnNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_tool_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_transfer_requests" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "plantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "toolConditionAtTransfer" TEXT,
    "fromUserAcceptedAt" TIMESTAMP(3),
    "toUserAcceptedAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "storekeeperApprovedById" TEXT,
    "storekeeperApprovedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_downtimes" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "assetId" TEXT,
    "assetName" TEXT NOT NULL,
    "downtimeStart" TIMESTAMP(3) NOT NULL,
    "downtimeEnd" TIMESTAMP(3),
    "durationMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'unplanned',
    "impactLevel" TEXT NOT NULL DEFAULT 'medium',
    "productionLoss" DOUBLE PRECISION,
    "notes" TEXT,
    "plantId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wo_downtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_completions" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "completionNotes" TEXT,
    "findings" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "materialsUsedSummary" TEXT NOT NULL DEFAULT '[]',
    "toolsUsedSummary" TEXT NOT NULL DEFAULT '[]',
    "totalLaborHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMaterialCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalToolCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDowntimeMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supervisorReviewNotes" TEXT,
    "supervisorApprovedById" TEXT,
    "supervisorApprovedAt" TIMESTAMP(3),
    "supervisorStatus" TEXT NOT NULL DEFAULT 'pending_review',
    "reworkReason" TEXT,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "plannerClosedById" TEXT,
    "plannerClosedAt" TIMESTAMP(3),
    "plannerStatus" TEXT NOT NULL DEFAULT 'pending_closure',
    "closureNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_part_returns" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "componentId" TEXT,
    "materialRequestId" TEXT,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "partSerialNumber" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "conditionOnReturn" TEXT NOT NULL DEFAULT 'used',
    "damageDescription" TEXT,
    "refurbishmentNeeded" BOOLEAN NOT NULL DEFAULT false,
    "refurbishmentNotes" TEXT,
    "estimatedRefurbCost" DOUBLE PRECISION,
    "actualRefurbCost" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inspectedById" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "inspectionNotes" TEXT,
    "refurbisherId" TEXT,
    "refurbishmentStart" TIMESTAMP(3),
    "refurbishmentEnd" TIMESTAMP(3),
    "returnedToStoreById" TEXT,
    "returnedToStoreAt" TIMESTAMP(3),
    "disposedById" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalReason" TEXT,
    "plantId" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spare_part_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damaged_tool_reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "toolRequestId" TEXT,
    "damageType" TEXT NOT NULL,
    "damageSeverity" TEXT NOT NULL DEFAULT 'medium',
    "damageDescription" TEXT NOT NULL,
    "damagePhotoUrls" TEXT NOT NULL DEFAULT '[]',
    "occurredAt" TIMESTAMP(3),
    "reportedById" TEXT NOT NULL,
    "technicianId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "assessmentNotes" TEXT,
    "estimatedRepairCost" DOUBLE PRECISION,
    "actualRepairCost" DOUBLE PRECISION,
    "repairVendorId" TEXT,
    "repairVendorName" TEXT,
    "repairStartedAt" TIMESTAMP(3),
    "repairCompletedAt" TIMESTAMP(3),
    "repairCompletedById" TEXT,
    "writtenOffById" TEXT,
    "writtenOffAt" TIMESTAMP(3),
    "writeOffReason" TEXT,
    "replacedWithToolId" TEXT,
    "plantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damaged_tool_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_registry" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "assetId" TEXT,
    "twinId" TEXT,
    "componentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "componentType" TEXT NOT NULL DEFAULT 'component',
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "specification" TEXT,
    "operatingParams" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'medium',
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'operational',
    "installedDate" TIMESTAMP(3),
    "expectedLifeHours" DOUBLE PRECISION,
    "operatingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastInspection" TIMESTAMP(3),
    "nextInspectionDue" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "component_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_spare_parts" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "sparePartName" TEXT NOT NULL,
    "sparePartCode" TEXT NOT NULL,
    "quantityRequired" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION,
    "leadTimeDays" INTEGER,
    "criticality" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT,

    CONSTRAINT "component_spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_tool_requirements" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "toolId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolCode" TEXT NOT NULL,
    "quantityRequired" INTEGER NOT NULL DEFAULT 1,
    "taskType" TEXT NOT NULL DEFAULT 'general',
    "notes" TEXT,

    CONSTRAINT "component_tool_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_records" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "assetId" TEXT,
    "workOrderId" TEXT,
    "failureCode" TEXT,
    "failureMode" TEXT NOT NULL,
    "failureModeId" TEXT,
    "failureCause" TEXT,
    "failureSeverity" TEXT NOT NULL DEFAULT 'medium',
    "symptoms" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "repairCost" DOUBLE PRECISION,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "reportedById" TEXT,

    CONSTRAINT "failure_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_versions" (
    "id" TEXT NOT NULL,
    "assetModelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "changelog" TEXT,
    "uploadedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelLibraryId" TEXT,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twin_audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" TEXT,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictive_models" (
    "id" TEXT NOT NULL,
    "componentId" TEXT,
    "assetId" TEXT,
    "modelName" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "algorithm" TEXT,
    "description" TEXT,
    "parameters" TEXT,
    "trainingStatus" TEXT NOT NULL DEFAULT 'pending',
    "accuracy" DOUBLE PRECISION,
    "lastTrainedAt" TIMESTAMP(3),
    "dataPoints" INTEGER NOT NULL DEFAULT 0,
    "alertThreshold" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predictive_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_alerts" (
    "id" TEXT NOT NULL,
    "predictiveModelId" TEXT NOT NULL,
    "componentId" TEXT,
    "assetId" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "confidence" DOUBLE PRECISION,
    "predictedFailureAt" TIMESTAMP(3),
    "message" TEXT NOT NULL,
    "recommendations" TEXT,
    "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_runtime_counters" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "counterType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'hours',
    "lastResetAt" TIMESTAMP(3),
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_runtime_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_condition_readings" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "parameterKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 100,
    "minThreshold" DOUBLE PRECISION,
    "maxThreshold" DOUBLE PRECISION,
    "isAlarm" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "component_condition_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_maintenance_history" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "maintenanceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "findings" TEXT,
    "actionsTaken" TEXT,
    "partsUsed" TEXT,
    "cost" DOUBLE PRECISION,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "component_maintenance_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_inspection_points" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inspectionType" TEXT NOT NULL DEFAULT 'visual',
    "parameterKey" TEXT,
    "normalRange" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "lastInspected" TIMESTAMP(3),
    "nextInspection" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "component_inspection_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_inspection_records" (
    "id" TEXT NOT NULL,
    "inspectionPointId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "value" TEXT,
    "result" TEXT NOT NULL DEFAULT 'pass',
    "findings" TEXT,
    "recommendation" TEXT,
    "inspectorId" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_inspection_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_lubrication_schedules" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "lubricantType" TEXT NOT NULL,
    "lubricantName" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'grams',
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "frequencyHours" DOUBLE PRECISION,
    "lastLubricated" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "component_lubrication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_lubrication_records" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "lubricantName" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "operatingHoursAt" DOUBLE PRECISION,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "component_lubrication_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_replacement_history" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "partCode" TEXT,
    "serialNumberOld" TEXT,
    "serialNumberNew" TEXT,
    "reason" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "vendor" TEXT,
    "performedById" TEXT NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedNextReplacement" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "component_replacement_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spatial_nodes" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "nodeType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "coordinates" TEXT,
    "floorMapUrl" TEXT,
    "capacity" TEXT,
    "metadata" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spatial_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_instructions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "componentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "maintenanceType" TEXT NOT NULL DEFAULT 'corrective',
    "estimatedDuration" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT NOT NULL DEFAULT 'intermediate',
    "safetyLevel" TEXT NOT NULL DEFAULT 'medium',
    "requiresLockout" BOOLEAN NOT NULL DEFAULT false,
    "requiresPermit" BOOLEAN NOT NULL DEFAULT false,
    "prerequisites" TEXT NOT NULL DEFAULT '[]',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "requiredTools" TEXT NOT NULL DEFAULT '[]',
    "requiredParts" TEXT NOT NULL DEFAULT '[]',
    "safetyCheckpoints" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_instruction_executions" (
    "id" TEXT NOT NULL,
    "workInstructionId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL DEFAULT '',
    "technicianId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "totalDuration" INTEGER,
    "stepResults" TEXT NOT NULL DEFAULT '[]',
    "safetyResults" TEXT NOT NULL DEFAULT '[]',
    "toolVerifications" TEXT NOT NULL DEFAULT '[]',
    "partVerifications" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "completionEvidence" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "work_instruction_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_library" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "originalFile" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'model/gltf-binary',
    "format" TEXT NOT NULL DEFAULT 'glb',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "thumbnail" TEXT,
    "boundingBox" TEXT,
    "geometryStats" TEXT,
    "dracoCompressed" BOOLEAN NOT NULL DEFAULT false,
    "optimizedForWeb" BOOLEAN NOT NULL DEFAULT false,
    "maxLodPolygons" INTEGER,
    "metadata" TEXT,
    "processingLog" TEXT,
    "processingError" TEXT,
    "assetId" TEXT,
    "plantId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesh_component_mappings" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "meshName" TEXT NOT NULL,
    "meshPath" TEXT NOT NULL,
    "mappingType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "color" TEXT,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mesh_component_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_tours" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL,
    "estimatedTime" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT NOT NULL DEFAULT 'basic',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_processing_jobs" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "queuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_view_bookmarks" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cameraPosition" TEXT NOT NULL,
    "cameraTarget" TEXT NOT NULL,
    "cameraUp" TEXT,
    "cameraFov" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "isOrthographic" BOOLEAN NOT NULL DEFAULT false,
    "zoomLevel" DOUBLE PRECISION,
    "hiddenMeshes" TEXT,
    "highlightedMeshes" TEXT,
    "sectionPlane" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_view_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_revisions" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "description" TEXT,
    "effectivityFrom" TIMESTAMP(3),
    "effectivityTo" TIMESTAMP(3),
    "changeReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_revision_items" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "parentItemId" TEXT,
    "componentId" TEXT,
    "inventoryItemId" TEXT,
    "itemNumber" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
    "assemblySequence" INTEGER,
    "relationshipType" TEXT NOT NULL DEFAULT 'mechanical',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "leadTimeDays" INTEGER,
    "notes" TEXT,

    CONSTRAINT "bom_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternate_parts" (
    "id" TEXT NOT NULL,
    "primaryPartId" TEXT NOT NULL,
    "alternatePartId" TEXT NOT NULL,
    "interchangeability" TEXT NOT NULL DEFAULT 'equivalent',
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alternate_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_change_requests" (
    "id" TEXT NOT NULL,
    "ecrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impact" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "implementedAt" TIMESTAMP(3),
    "bomId" TEXT,
    "assetId" TEXT,
    "plantId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_spare_analysis" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "criticalityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadTimeRisk" TEXT NOT NULL DEFAULT 'low',
    "stockoutRisk" TEXT NOT NULL DEFAULT 'low',
    "recommendedStock" INTEGER,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "annualUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "stockValue" DOUBLE PRECISION,
    "lastAnalysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "analyzedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "critical_spare_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_data_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "connectionConfig" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "plantId" TEXT,
    "lastConnectionAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" TEXT,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gatewayId" TEXT,

    CONSTRAINT "telemetry_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_mappings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "externalId" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "parameterUnit" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'float',
    "scaleFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "offset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadband" DOUBLE PRECISION,
    "qualityRule" TEXT,
    "isActve" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_streams" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 100,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "anomalyScore" DOUBLE PRECISION,
    "metadata" TEXT,

    CONSTRAINT "telemetry_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_aggregations" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "avgValue" DOUBLE PRECISION,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "sumValue" DOUBLE PRECISION,
    "count" INTEGER NOT NULL,
    "stdDev" DOUBLE PRECISION,

    CONSTRAINT "telemetry_aggregations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "escalationPath" TEXT,
    "notification" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarm_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_events" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_modes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "detectionMethod" TEXT,
    "iso14224Code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failure_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rcm_analyses" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "methodology" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "analysisDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "resultSummary" TEXT,
    "riskMatrix" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rcm_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weibull_analyses" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shape" DOUBLE PRECISION,
    "scale" DOUBLE PRECISION,
    "location" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "timeRange" TEXT,
    "resultSummary" TEXT,
    "dataPoints" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedById" TEXT NOT NULL,

    CONSTRAINT "weibull_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_analyses" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalDowntime" DOUBLE PRECISION NOT NULL,
    "plannedDowntime" DOUBLE PRECISION NOT NULL,
    "unplannedDowntime" DOUBLE PRECISION NOT NULL,
    "downtimeCost" DOUBLE PRECISION,
    "mtbf" DOUBLE PRECISION,
    "mttr" DOUBLE PRECISION,
    "availability" DOUBLE PRECISION,
    "reliability" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downtime_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remaining_useful_life" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "currentHealth" DOUBLE PRECISION NOT NULL,
    "degradationRate" DOUBLE PRECISION NOT NULL,
    "estimatedRul" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedById" TEXT NOT NULL,

    CONSTRAINT "remaining_useful_life_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_readings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'good',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edge_gateways" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gatewayCode" TEXT NOT NULL,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "firmwareVersion" TEXT,
    "protocolVersion" TEXT,
    "plantId" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "bufferingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bufferSize" INTEGER NOT NULL DEFAULT 10000,
    "batchSize" INTEGER NOT NULL DEFAULT 500,
    "syncIntervalMs" INTEGER NOT NULL DEFAULT 5000,
    "config" JSONB,
    "capabilities" JSONB,
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edge_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connectivity_sessions" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "protocol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesOut" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectivity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_batches" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "batchNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "readingCount" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_stream_records" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "entityId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payload" JSONB,
    "correlationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_stream_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downsampling_policies" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "rawRetentionDays" INTEGER NOT NULL DEFAULT 7,
    "minuteRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "hourlyRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "dailyRetentionDays" INTEGER NOT NULL DEFAULT 730,
    "weeklyRetentionDays" INTEGER NOT NULL DEFAULT 3650,
    "aggregationMethod" TEXT NOT NULL DEFAULT 'avg',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downsampling_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downsampled_readings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "avgValue" DOUBLE PRECISION NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION NOT NULL,
    "sumValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "stdDev" DOUBLE PRECISION DEFAULT 0,
    "quality" DOUBLE PRECISION DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downsampled_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceId" TEXT,
    "keepDays" INTEGER NOT NULL,
    "aggregationKeepDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastExecutedAt" TIMESTAMP(3),
    "totalDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_detection_configs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "mappingId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'zscore',
    "windowSize" INTEGER NOT NULL DEFAULT 30,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "confirmationCount" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_detection_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_records" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "mappingId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "expectedValue" DOUBLE PRECISION,
    "anomalyScore" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_reports" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "reportPeriod" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgQuality" DOUBLE PRECISION,
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbi_assessments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "equipmentType" TEXT,
    "corrosionCircuit" TEXT,
    "operatingConditions" JSONB,
    "degradationMechanisms" JSONB,
    "probabilityOfFailure" DOUBLE PRECISION NOT NULL,
    "consequenceOfFailure" DOUBLE PRECISION NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "currentDamageFactor" DOUBLE PRECISION,
    "inspectionEffectiveness" TEXT,
    "nextInspectionDate" TIMESTAMP(3),
    "remainingLifeYears" DOUBLE PRECISION,
    "thinningRate" DOUBLE PRECISION,
    "currentThickness" DOUBLE PRECISION,
    "minimumThickness" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "assessedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rbi_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sil_assessments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sifName" TEXT NOT NULL,
    "sifDescription" TEXT,
    "silTarget" INTEGER NOT NULL,
    "silAchieved" INTEGER,
    "pfdRequired" DOUBLE PRECISION,
    "pfdCalculated" DOUBLE PRECISION,
    "sffRequired" DOUBLE PRECISION,
    "sffCalculated" DOUBLE PRECISION,
    "architecture" TEXT,
    "proofTestIntervalMonths" INTEGER NOT NULL DEFAULT 12,
    "demandRate" DOUBLE PRECISION,
    "meanTimeToFailSpurious" DOUBLE PRECISION,
    "lopaLayers" JSONB,
    "components" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "assessedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sil_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "degradation_profiles" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "unit" TEXT,
    "modelType" TEXT NOT NULL DEFAULT 'linear',
    "modelParams" JSONB,
    "currentValue" DOUBLE PRECISION,
    "healthIndex" DOUBLE PRECISION,
    "degradationStage" TEXT NOT NULL DEFAULT 'normal',
    "alertThreshold" DOUBLE PRECISION,
    "alarmThreshold" DOUBLE PRECISION,
    "criticalThreshold" DOUBLE PRECISION,
    "predictedFailureDate" TIMESTAMP(3),
    "degradationRate" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "dataPoints" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "degradation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_forecasts" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "forecastType" TEXT NOT NULL,
    "forecastPeriodMonths" INTEGER NOT NULL DEFAULT 36,
    "data" JSONB,
    "totalCost" DOUBLE PRECISION,
    "acquisitionCost" DOUBLE PRECISION,
    "operatingCost" DOUBLE PRECISION,
    "maintenanceCost" DOUBLE PRECISION,
    "disposalCost" DOUBLE PRECISION,
    "replacementDate" TIMESTAMP(3),
    "replacementReason" TEXT,
    "healthTrajectory" JSONB,
    "monthlyCostForecast" JSONB,
    "recommendedAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_optimizations" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "abcClassification" TEXT,
    "xyzClassification" TEXT,
    "annualDemand" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "holdingCostPercent" DOUBLE PRECISION DEFAULT 25,
    "orderingCost" DOUBLE PRECISION,
    "leadTimeDays" DOUBLE PRECISION,
    "serviceLevel" DOUBLE PRECISION DEFAULT 0.95,
    "eoq" DOUBLE PRECISION,
    "reorderPoint" DOUBLE PRECISION,
    "safetyStock" DOUBLE PRECISION,
    "stockOutRisk" DOUBLE PRECISION,
    "criticality" TEXT,
    "recommendedStock" DOUBLE PRECISION,
    "currentStock" DOUBLE PRECISION,
    "annualHoldingCost" DOUBLE PRECISION,
    "annualOrderingCost" DOUBLE PRECISION,
    "totalAnnualCost" DOUBLE PRECISION,
    "savingsPotential" DOUBLE PRECISION,
    "analysisPeriod" TEXT,
    "analyzedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spare_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "description" TEXT,
    "stepsJson" JSONB,
    "transitionsJson" JSONB,
    "triggersJson" JSONB,
    "variablesSchema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "currentStepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "variables" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "startedById" TEXT,
    "completedById" TEXT,
    "cancelledById" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_history" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "assignedTo" TEXT,
    "performedBy" TEXT,
    "comment" TEXT,
    "durationMs" INTEGER,
    "variables" JSONB,
    "slaStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_step_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT,
    "priority" TEXT,
    "responseMinutes" INTEGER,
    "resolutionMinutes" INTEGER,
    "escalationRules" JSONB,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "warningPercent" INTEGER NOT NULL DEFAULT 75,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_tracking" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "responseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "totalPausedMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_calendars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "workingDays" JSONB,
    "workingHours" JSONB,
    "holidays" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sto_events" (
    "id" TEXT NOT NULL,
    "stoNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'turnaround',
    "plantId" TEXT NOT NULL,
    "unitId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "estimatedDurationHours" DOUBLE PRECISION,
    "actualDurationHours" DOUBLE PRECISION,
    "budgetAmount" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scopeJson" JSONB,
    "milestonesJson" JSONB,
    "riskAssessment" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sto_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sto_tasks" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "earlyStart" TIMESTAMP(3),
    "earlyFinish" TIMESTAMP(3),
    "lateStart" TIMESTAMP(3),
    "lateFinish" TIMESTAMP(3),
    "totalFloat" DOUBLE PRECISION,
    "freeFloat" DOUBLE PRECISION,
    "isOnCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "predecessorIds" JSONB,
    "successorIds" JSONB,
    "assignedToId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sto_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sto_contractors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "company" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "specialties" JSONB,
    "qualificationLevel" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "safetyCertExpiry" TIMESTAMP(3),
    "rating" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sto_contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sto_contractor_assignments" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "taskIds" JSONB,
    "laborCount" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budgetAmount" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "accessPermitId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "performanceRating" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sto_contractor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sto_progress_reports" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksTotal" INTEGER NOT NULL DEFAULT 0,
    "tasksInProgress" INTEGER NOT NULL DEFAULT 0,
    "issuesCount" INTEGER NOT NULL DEFAULT 0,
    "holdsCount" INTEGER NOT NULL DEFAULT 0,
    "incidentsCount" INTEGER NOT NULL DEFAULT 0,
    "manHoursToday" DOUBLE PRECISION,
    "manHoursTotal" DOUBLE PRECISION,
    "budgetSpent" DOUBLE PRECISION,
    "budgetRemaining" DOUBLE PRECISION,
    "highlights" TEXT,
    "issues" JSONB,
    "notes" TEXT,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sto_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "frequency" TEXT,
    "estimatedMinutes" INTEGER,
    "sectionsJson" JSONB,
    "passThreshold" DOUBLE PRECISION DEFAULT 0.8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_inspections" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assetId" TEXT,
    "workOrderId" TEXT,
    "inspectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "conditionalCount" INTEGER NOT NULL DEFAULT 0,
    "naCount" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "resultsJson" JSONB,
    "findingsJson" JSONB,
    "photosJson" JSONB,
    "signatureData" TEXT,
    "gpsCoordinates" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "zoneType" TEXT NOT NULL DEFAULT 'radius',
    "coordinates" JSONB,
    "plantId" TEXT,
    "alertOnEnter" BOOLEAN NOT NULL DEFAULT false,
    "alertOnExit" BOOLEAN NOT NULL DEFAULT false,
    "requiresPermit" BOOLEAN NOT NULL DEFAULT false,
    "hazardLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "coordinates" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_operations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "operationType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "dataJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "conflictReason" TEXT,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_documents" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "discipline" TEXT,
    "plantId" TEXT,
    "area" TEXT,
    "folderPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "fileSize" INTEGER,
    "fileMimeType" TEXT,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "extractedText" TEXT,
    "metadata" JSONB,
    "tags" JSONB,
    "linkedAssetIds" JSONB,
    "linkedTagNumbers" JSONB,
    "issuedById" TEXT,
    "approvedById" TEXT,
    "reviewNotes" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" TEXT NOT NULL,
    "changeDescription" TEXT,
    "fileSize" INTEGER,
    "fileUrl" TEXT,
    "changeType" TEXT,
    "changedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pid_tag_links" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "tagType" TEXT,
    "assetId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pid_tag_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_search_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "clickedDocumentId" TEXT,
    "zeroResults" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityName" TEXT,
    "entityId" TEXT,
    "payload" JSONB,
    "correlationId" TEXT,
    "causationId" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observability_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "service" TEXT,
    "message" TEXT NOT NULL,
    "traceId" TEXT,
    "correlationId" TEXT,
    "userId" TEXT,
    "requestId" TEXT,
    "durationMs" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "tags" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observability_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observability_traces" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "serviceName" TEXT,
    "durationMs" DOUBLE PRECISION,
    "status" TEXT,
    "attributes" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observability_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observability_metric_snapshots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "labels" TEXT,
    "unit" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observability_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zai_sdk',
    "llmModel" TEXT NOT NULL DEFAULT 'default',
    "llmEndpoint" TEXT NOT NULL DEFAULT '',
    "llmApiKey" TEXT NOT NULL DEFAULT '',
    "llmTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "llmMaxTokens" INTEGER NOT NULL DEFAULT 8000,
    "imageModel" TEXT NOT NULL DEFAULT 'default',
    "imageApiKey" TEXT NOT NULL DEFAULT '',
    "meshyApiKey" TEXT NOT NULL DEFAULT '',
    "provider3d" TEXT NOT NULL DEFAULT 'programmatic',
    "generationSettings" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_components" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "componentRegistryId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_calibration_requirements" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "calibrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastCalibrationDate" TIMESTAMP(3),
    "nextCalibrationDue" TIMESTAMP(3),
    "calibrationStatus" TEXT NOT NULL DEFAULT 'not_required',
    "calibrationCertId" TEXT,
    "calibratedById" TEXT,
    "calibrationIntervalDays" INTEGER,
    "emergencyOverride" BOOLEAN NOT NULL DEFAULT false,
    "emergencyOverrideReason" TEXT,
    "emergencyOverrideById" TEXT,
    "emergencyOverrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_calibration_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseHash" TEXT NOT NULL,
    "responseData" TEXT,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_rates" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tradeId" TEXT,
    "plantId" TEXT,
    "normalHourlyRate" DOUBLE PRECISION NOT NULL,
    "overtimeHourlyRate" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SpatialAsset" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SpatialAsset_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_staffId_key" ON "users"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permissionId_key" ON "user_permissions"("userId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "system_modules_code_key" ON "system_modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_modules_systemModuleId_companyId_key" ON "company_modules"("systemModuleId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "plants_code_key" ON "plants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_plants_userId_plantId_key" ON "user_plants"("userId", "plantId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_requestNumber_key" ON "maintenance_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_workOrderId_key" ON "maintenance_requests"("workOrderId");

-- CreateIndex
CREATE INDEX "maintenance_requests_plantId_idx" ON "maintenance_requests"("plantId");

-- CreateIndex
CREATE INDEX "maintenance_requests_status_idx" ON "maintenance_requests"("status");

-- CreateIndex
CREATE INDEX "maintenance_requests_priority_idx" ON "maintenance_requests"("priority");

-- CreateIndex
CREATE INDEX "maintenance_requests_departmentId_idx" ON "maintenance_requests"("departmentId");

-- CreateIndex
CREATE INDEX "maintenance_requests_createdAt_idx" ON "maintenance_requests"("createdAt");

-- CreateIndex
CREATE INDEX "maintenance_requests_status_priority_idx" ON "maintenance_requests"("status", "priority");

-- CreateIndex
CREATE INDEX "maintenance_requests_plantId_workflowStatus_idx" ON "maintenance_requests"("plantId", "workflowStatus");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_woNumber_key" ON "work_orders"("woNumber");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_maintenanceRequestId_key" ON "work_orders"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "work_orders_plantId_idx" ON "work_orders"("plantId");

-- CreateIndex
CREATE INDEX "work_orders_workPackageId_idx" ON "work_orders"("workPackageId");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_priority_idx" ON "work_orders"("priority");

-- CreateIndex
CREATE INDEX "work_orders_assignedTo_idx" ON "work_orders"("assignedTo");

-- CreateIndex
CREATE INDEX "work_orders_assetId_idx" ON "work_orders"("assetId");

-- CreateIndex
CREATE INDEX "work_orders_createdAt_idx" ON "work_orders"("createdAt");

-- CreateIndex
CREATE INDEX "work_orders_status_priority_idx" ON "work_orders"("status", "priority");

-- CreateIndex
CREATE INDEX "work_orders_assignedTo_status_idx" ON "work_orders"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "work_orders_assignedTo_assignmentResponseStatus_idx" ON "work_orders"("assignedTo", "assignmentResponseStatus");

-- CreateIndex
CREATE INDEX "work_orders_plantId_status_idx" ON "work_orders"("plantId", "status");

-- CreateIndex
CREATE INDEX "wo_team_members_workOrderId_idx" ON "wo_team_members"("workOrderId");

-- CreateIndex
CREATE INDEX "wo_team_members_userId_idx" ON "wo_team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wo_team_members_workOrderId_userId_key" ON "wo_team_members"("workOrderId", "userId");

-- CreateIndex
CREATE INDEX "wo_time_logs_workOrderId_timestamp_idx" ON "wo_time_logs"("workOrderId", "timestamp");

-- CreateIndex
CREATE INDEX "wo_time_logs_userId_idx" ON "wo_time_logs"("userId");

-- CreateIndex
CREATE INDEX "work_packages_plantId_idx" ON "work_packages"("plantId");

-- CreateIndex
CREATE INDEX "work_packages_status_idx" ON "work_packages"("status");

-- CreateIndex
CREATE INDEX "work_packages_assignedToId_idx" ON "work_packages"("assignedToId");

-- CreateIndex
CREATE INDEX "work_packages_scheduledDate_idx" ON "work_packages"("scheduledDate");

-- CreateIndex
CREATE INDEX "work_packages_createdAt_idx" ON "work_packages"("createdAt");

-- CreateIndex
CREATE INDEX "status_transitions_entityType_toStatus_idx" ON "status_transitions"("entityType", "toStatus");

-- CreateIndex
CREATE UNIQUE INDEX "status_transitions_entityType_fromStatus_toStatus_key" ON "status_transitions"("entityType", "fromStatus", "toStatus");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_createdAt_idx" ON "audit_logs"("entityType", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_code_key" ON "asset_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assetTag_key" ON "assets"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serialNumber_key" ON "assets"("serialNumber");

-- CreateIndex
CREATE INDEX "assets_plantId_idx" ON "assets"("plantId");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_categoryId_idx" ON "assets"("categoryId");

-- CreateIndex
CREATE INDEX "assets_criticality_idx" ON "assets"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_itemCode_key" ON "inventory_items"("itemCode");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_createdAt_idx" ON "stock_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "pm_schedules_componentId_idx" ON "pm_schedules"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "pm_triggers_scheduleId_key" ON "pm_triggers"("scheduleId");

-- CreateIndex
CREATE INDEX "wo_status_history_workOrderId_idx" ON "wo_status_history"("workOrderId");

-- CreateIndex
CREATE INDEX "wo_status_history_createdAt_idx" ON "wo_status_history"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trades_name_key" ON "trades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "trades_code_key" ON "trades"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_userId_tradeId_key" ON "user_skills"("userId", "tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "iot_devices_deviceCode_key" ON "iot_devices"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "tools_toolCode_key" ON "tools"("toolCode");

-- CreateIndex
CREATE UNIQUE INDEX "tools_serialNumber_key" ON "tools"("serialNumber");

-- CreateIndex
CREATE INDEX "tool_transactions_workOrderId_idx" ON "tool_transactions"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_locations_code_key" ON "inventory_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_adjustmentNumber_key" ON "inventory_adjustments"("adjustmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_requests_requestNumber_key" ON "inventory_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_transferNumber_key" ON "inventory_transfers"("transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "safety_incidents_incidentNumber_key" ON "safety_incidents"("incidentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "safety_inspections_inspectionNumber_key" ON "safety_inspections"("inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "safety_equipment_code_key" ON "safety_equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "safety_permits_permitNumber_key" ON "safety_permits"("permitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quality_inspections_inspectionNumber_key" ON "quality_inspections"("inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformance_reports_ncrNumber_key" ON "non_conformance_reports"("ncrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quality_audits_auditNumber_key" ON "quality_audits"("auditNumber");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_capaNumber_key" ON "corrective_actions"("capaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "work_centers_code_key" ON "work_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_orderNumber_key" ON "production_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_batchNumber_key" ON "production_batches"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_readingNumber_key" ON "meter_readings"("readingNumber");

-- CreateIndex
CREATE INDEX "shift_handovers_workOrderId_idx" ON "shift_handovers"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "calibration_records_calibrationNumber_key" ON "calibration_records"("calibrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_assessmentNumber_key" ON "risk_assessments"("assessmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "loto_records_lotoNumber_key" ON "loto_records"("lotoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bill_of_materials_parentId_childAssetId_key" ON "bill_of_materials"("parentId", "childAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_twins_assetId_key" ON "digital_twins"("assetId");

-- CreateIndex
CREATE INDEX "digital_twins_assetId_idx" ON "digital_twins"("assetId");

-- CreateIndex
CREATE INDEX "digital_twins_createdById_idx" ON "digital_twins"("createdById");

-- CreateIndex
CREATE INDEX "digital_twins_isActive_idx" ON "digital_twins"("isActive");

-- CreateIndex
CREATE INDEX "asset_models_assetId_idx" ON "asset_models"("assetId");

-- CreateIndex
CREATE INDEX "asset_models_uploadedById_idx" ON "asset_models"("uploadedById");

-- CreateIndex
CREATE INDEX "asset_mesh_bindings_modelId_idx" ON "asset_mesh_bindings"("modelId");

-- CreateIndex
CREATE INDEX "asset_mesh_bindings_assetId_idx" ON "asset_mesh_bindings"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_mesh_bindings_modelId_meshName_key" ON "asset_mesh_bindings"("modelId", "meshName");

-- CreateIndex
CREATE INDEX "digital_twin_scenes_twinId_idx" ON "digital_twin_scenes"("twinId");

-- CreateIndex
CREATE INDEX "digital_twin_scenes_modelId_idx" ON "digital_twin_scenes"("modelId");

-- CreateIndex
CREATE INDEX "digital_twin_scenes_createdById_idx" ON "digital_twin_scenes"("createdById");

-- CreateIndex
CREATE INDEX "digital_twin_scenes_modelFileId_idx" ON "digital_twin_scenes"("modelFileId");

-- CreateIndex
CREATE INDEX "twin_hotspots_sceneId_idx" ON "twin_hotspots"("sceneId");

-- CreateIndex
CREATE INDEX "twin_hotspots_assetId_idx" ON "twin_hotspots"("assetId");

-- CreateIndex
CREATE INDEX "twin_hotspots_bindingId_idx" ON "twin_hotspots"("bindingId");

-- CreateIndex
CREATE INDEX "twin_camera_presets_sceneId_idx" ON "twin_camera_presets"("sceneId");

-- CreateIndex
CREATE INDEX "twin_annotations_sceneId_idx" ON "twin_annotations"("sceneId");

-- CreateIndex
CREATE INDEX "twin_annotations_authorId_idx" ON "twin_annotations"("authorId");

-- CreateIndex
CREATE INDEX "twin_annotations_assetId_idx" ON "twin_annotations"("assetId");

-- CreateIndex
CREATE INDEX "system_diagrams_plantId_idx" ON "system_diagrams"("plantId");

-- CreateIndex
CREATE INDEX "system_diagrams_assetId_idx" ON "system_diagrams"("assetId");

-- CreateIndex
CREATE INDEX "system_diagrams_createdById_idx" ON "system_diagrams"("createdById");

-- CreateIndex
CREATE INDEX "system_diagrams_type_idx" ON "system_diagrams"("type");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_userId_conversationId_key" ON "conversation_participants"("userId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "repair_material_requests_componentRegistryId_idx" ON "repair_material_requests"("componentRegistryId");

-- CreateIndex
CREATE UNIQUE INDEX "repair_tool_requests_requestNumber_key" ON "repair_tool_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "repair_tool_request_items_repairToolRequestId_idx" ON "repair_tool_request_items"("repairToolRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "repair_completions_workOrderId_key" ON "repair_completions"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "spare_part_returns_returnNumber_key" ON "spare_part_returns"("returnNumber");

-- CreateIndex
CREATE INDEX "spare_part_returns_workOrderId_idx" ON "spare_part_returns"("workOrderId");

-- CreateIndex
CREATE INDEX "spare_part_returns_status_idx" ON "spare_part_returns"("status");

-- CreateIndex
CREATE INDEX "spare_part_returns_plantId_idx" ON "spare_part_returns"("plantId");

-- CreateIndex
CREATE INDEX "spare_part_returns_itemId_idx" ON "spare_part_returns"("itemId");

-- CreateIndex
CREATE INDEX "spare_part_returns_componentId_idx" ON "spare_part_returns"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "damaged_tool_reports_reportNumber_key" ON "damaged_tool_reports"("reportNumber");

-- CreateIndex
CREATE INDEX "damaged_tool_reports_toolId_idx" ON "damaged_tool_reports"("toolId");

-- CreateIndex
CREATE INDEX "damaged_tool_reports_workOrderId_idx" ON "damaged_tool_reports"("workOrderId");

-- CreateIndex
CREATE INDEX "damaged_tool_reports_status_idx" ON "damaged_tool_reports"("status");

-- CreateIndex
CREATE INDEX "damaged_tool_reports_plantId_idx" ON "damaged_tool_reports"("plantId");

-- CreateIndex
CREATE UNIQUE INDEX "component_registry_serialNumber_key" ON "component_registry"("serialNumber");

-- CreateIndex
CREATE INDEX "component_registry_parentId_idx" ON "component_registry"("parentId");

-- CreateIndex
CREATE INDEX "component_registry_assetId_idx" ON "component_registry"("assetId");

-- CreateIndex
CREATE INDEX "component_registry_twinId_idx" ON "component_registry"("twinId");

-- CreateIndex
CREATE INDEX "component_registry_componentType_idx" ON "component_registry"("componentType");

-- CreateIndex
CREATE INDEX "component_registry_criticality_idx" ON "component_registry"("criticality");

-- CreateIndex
CREATE INDEX "component_registry_lifecycleStatus_idx" ON "component_registry"("lifecycleStatus");

-- CreateIndex
CREATE UNIQUE INDEX "component_registry_componentCode_key" ON "component_registry"("componentCode");

-- CreateIndex
CREATE INDEX "component_spare_parts_componentId_idx" ON "component_spare_parts"("componentId");

-- CreateIndex
CREATE INDEX "component_spare_parts_inventoryItemId_idx" ON "component_spare_parts"("inventoryItemId");

-- CreateIndex
CREATE INDEX "component_tool_requirements_componentId_idx" ON "component_tool_requirements"("componentId");

-- CreateIndex
CREATE INDEX "component_tool_requirements_toolId_idx" ON "component_tool_requirements"("toolId");

-- CreateIndex
CREATE INDEX "failure_records_componentId_idx" ON "failure_records"("componentId");

-- CreateIndex
CREATE INDEX "failure_records_assetId_idx" ON "failure_records"("assetId");

-- CreateIndex
CREATE INDEX "failure_records_failureMode_idx" ON "failure_records"("failureMode");

-- CreateIndex
CREATE INDEX "failure_records_failureModeId_idx" ON "failure_records"("failureModeId");

-- CreateIndex
CREATE INDEX "failure_records_failureSeverity_idx" ON "failure_records"("failureSeverity");

-- CreateIndex
CREATE INDEX "failure_records_detectedAt_idx" ON "failure_records"("detectedAt");

-- CreateIndex
CREATE INDEX "model_versions_assetModelId_idx" ON "model_versions"("assetModelId");

-- CreateIndex
CREATE INDEX "model_versions_modelLibraryId_idx" ON "model_versions"("modelLibraryId");

-- CreateIndex
CREATE UNIQUE INDEX "model_versions_assetModelId_version_key" ON "model_versions"("assetModelId", "version");

-- CreateIndex
CREATE INDEX "twin_audit_logs_entityType_entityId_idx" ON "twin_audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "twin_audit_logs_userId_idx" ON "twin_audit_logs"("userId");

-- CreateIndex
CREATE INDEX "twin_audit_logs_createdAt_idx" ON "twin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "twin_audit_logs_action_idx" ON "twin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "predictive_models_componentId_idx" ON "predictive_models"("componentId");

-- CreateIndex
CREATE INDEX "predictive_models_assetId_idx" ON "predictive_models"("assetId");

-- CreateIndex
CREATE INDEX "predictive_models_trainingStatus_idx" ON "predictive_models"("trainingStatus");

-- CreateIndex
CREATE INDEX "predictive_models_createdById_idx" ON "predictive_models"("createdById");

-- CreateIndex
CREATE INDEX "prediction_alerts_predictiveModelId_idx" ON "prediction_alerts"("predictiveModelId");

-- CreateIndex
CREATE INDEX "prediction_alerts_componentId_idx" ON "prediction_alerts"("componentId");

-- CreateIndex
CREATE INDEX "prediction_alerts_assetId_idx" ON "prediction_alerts"("assetId");

-- CreateIndex
CREATE INDEX "prediction_alerts_severity_idx" ON "prediction_alerts"("severity");

-- CreateIndex
CREATE INDEX "prediction_alerts_isAcknowledged_idx" ON "prediction_alerts"("isAcknowledged");

-- CreateIndex
CREATE INDEX "prediction_alerts_createdAt_idx" ON "prediction_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "component_runtime_counters_componentId_idx" ON "component_runtime_counters"("componentId");

-- CreateIndex
CREATE INDEX "component_runtime_counters_counterType_idx" ON "component_runtime_counters"("counterType");

-- CreateIndex
CREATE UNIQUE INDEX "component_runtime_counters_componentId_counterType_key" ON "component_runtime_counters"("componentId", "counterType");

-- CreateIndex
CREATE INDEX "component_condition_readings_componentId_parameterKey_idx" ON "component_condition_readings"("componentId", "parameterKey");

-- CreateIndex
CREATE INDEX "component_condition_readings_componentId_recordedAt_idx" ON "component_condition_readings"("componentId", "recordedAt");

-- CreateIndex
CREATE INDEX "component_condition_readings_parameterKey_idx" ON "component_condition_readings"("parameterKey");

-- CreateIndex
CREATE INDEX "component_condition_readings_isAlarm_idx" ON "component_condition_readings"("isAlarm");

-- CreateIndex
CREATE INDEX "component_maintenance_history_componentId_idx" ON "component_maintenance_history"("componentId");

-- CreateIndex
CREATE INDEX "component_maintenance_history_workOrderId_idx" ON "component_maintenance_history"("workOrderId");

-- CreateIndex
CREATE INDEX "component_maintenance_history_maintenanceType_idx" ON "component_maintenance_history"("maintenanceType");

-- CreateIndex
CREATE INDEX "component_maintenance_history_performedById_idx" ON "component_maintenance_history"("performedById");

-- CreateIndex
CREATE INDEX "component_maintenance_history_completedAt_idx" ON "component_maintenance_history"("completedAt");

-- CreateIndex
CREATE INDEX "component_inspection_points_componentId_idx" ON "component_inspection_points"("componentId");

-- CreateIndex
CREATE INDEX "component_inspection_points_isActive_idx" ON "component_inspection_points"("isActive");

-- CreateIndex
CREATE INDEX "component_inspection_records_inspectionPointId_idx" ON "component_inspection_records"("inspectionPointId");

-- CreateIndex
CREATE INDEX "component_inspection_records_componentId_idx" ON "component_inspection_records"("componentId");

-- CreateIndex
CREATE INDEX "component_inspection_records_inspectorId_idx" ON "component_inspection_records"("inspectorId");

-- CreateIndex
CREATE INDEX "component_inspection_records_inspectedAt_idx" ON "component_inspection_records"("inspectedAt");

-- CreateIndex
CREATE INDEX "component_lubrication_schedules_componentId_idx" ON "component_lubrication_schedules"("componentId");

-- CreateIndex
CREATE INDEX "component_lubrication_schedules_nextDueDate_idx" ON "component_lubrication_schedules"("nextDueDate");

-- CreateIndex
CREATE INDEX "component_lubrication_records_scheduleId_idx" ON "component_lubrication_records"("scheduleId");

-- CreateIndex
CREATE INDEX "component_lubrication_records_componentId_idx" ON "component_lubrication_records"("componentId");

-- CreateIndex
CREATE INDEX "component_lubrication_records_performedAt_idx" ON "component_lubrication_records"("performedAt");

-- CreateIndex
CREATE INDEX "component_replacement_history_componentId_idx" ON "component_replacement_history"("componentId");

-- CreateIndex
CREATE INDEX "component_replacement_history_replacedAt_idx" ON "component_replacement_history"("replacedAt");

-- CreateIndex
CREATE INDEX "spatial_nodes_parentId_idx" ON "spatial_nodes"("parentId");

-- CreateIndex
CREATE INDEX "spatial_nodes_nodeType_idx" ON "spatial_nodes"("nodeType");

-- CreateIndex
CREATE INDEX "spatial_nodes_level_idx" ON "spatial_nodes"("level");

-- CreateIndex
CREATE UNIQUE INDEX "spatial_nodes_code_key" ON "spatial_nodes"("code");

-- CreateIndex
CREATE INDEX "work_instructions_componentId_idx" ON "work_instructions"("componentId");

-- CreateIndex
CREATE INDEX "work_instructions_assetId_idx" ON "work_instructions"("assetId");

-- CreateIndex
CREATE INDEX "work_instructions_maintenanceType_idx" ON "work_instructions"("maintenanceType");

-- CreateIndex
CREATE INDEX "work_instructions_isActive_idx" ON "work_instructions"("isActive");

-- CreateIndex
CREATE INDEX "work_instruction_executions_workInstructionId_idx" ON "work_instruction_executions"("workInstructionId");

-- CreateIndex
CREATE INDEX "work_instruction_executions_technicianId_idx" ON "work_instruction_executions"("technicianId");

-- CreateIndex
CREATE INDEX "work_instruction_executions_workOrderId_idx" ON "work_instruction_executions"("workOrderId");

-- CreateIndex
CREATE INDEX "work_instruction_executions_status_idx" ON "work_instruction_executions"("status");

-- CreateIndex
CREATE INDEX "model_library_assetId_idx" ON "model_library"("assetId");

-- CreateIndex
CREATE INDEX "model_library_plantId_idx" ON "model_library"("plantId");

-- CreateIndex
CREATE INDEX "model_library_uploadedById_idx" ON "model_library"("uploadedById");

-- CreateIndex
CREATE INDEX "model_library_status_idx" ON "model_library"("status");

-- CreateIndex
CREATE INDEX "model_library_format_idx" ON "model_library"("format");

-- CreateIndex
CREATE INDEX "mesh_component_mappings_modelId_idx" ON "mesh_component_mappings"("modelId");

-- CreateIndex
CREATE INDEX "mesh_component_mappings_meshName_idx" ON "mesh_component_mappings"("meshName");

-- CreateIndex
CREATE INDEX "mesh_component_mappings_mappingType_idx" ON "mesh_component_mappings"("mappingType");

-- CreateIndex
CREATE INDEX "mesh_component_mappings_targetId_idx" ON "mesh_component_mappings"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "mesh_component_mappings_modelId_meshName_mappingType_target_key" ON "mesh_component_mappings"("modelId", "meshName", "mappingType", "targetId");

-- CreateIndex
CREATE INDEX "inspection_tours_twinId_idx" ON "inspection_tours"("twinId");

-- CreateIndex
CREATE INDEX "inspection_tours_isPublished_idx" ON "inspection_tours"("isPublished");

-- CreateIndex
CREATE INDEX "model_processing_jobs_modelId_idx" ON "model_processing_jobs"("modelId");

-- CreateIndex
CREATE INDEX "model_processing_jobs_status_idx" ON "model_processing_jobs"("status");

-- CreateIndex
CREATE INDEX "model_processing_jobs_jobType_idx" ON "model_processing_jobs"("jobType");

-- CreateIndex
CREATE INDEX "asset_view_bookmarks_sceneId_idx" ON "asset_view_bookmarks"("sceneId");

-- CreateIndex
CREATE INDEX "asset_view_bookmarks_createdById_idx" ON "asset_view_bookmarks"("createdById");

-- CreateIndex
CREATE INDEX "bom_revisions_bomId_idx" ON "bom_revisions"("bomId");

-- CreateIndex
CREATE INDEX "bom_revisions_status_idx" ON "bom_revisions"("status");

-- CreateIndex
CREATE INDEX "bom_revisions_isActive_idx" ON "bom_revisions"("isActive");

-- CreateIndex
CREATE INDEX "bom_revision_items_revisionId_idx" ON "bom_revision_items"("revisionId");

-- CreateIndex
CREATE INDEX "bom_revision_items_parentItemId_idx" ON "bom_revision_items"("parentItemId");

-- CreateIndex
CREATE INDEX "bom_revision_items_componentId_idx" ON "bom_revision_items"("componentId");

-- CreateIndex
CREATE INDEX "bom_revision_items_inventoryItemId_idx" ON "bom_revision_items"("inventoryItemId");

-- CreateIndex
CREATE INDEX "alternate_parts_primaryPartId_idx" ON "alternate_parts"("primaryPartId");

-- CreateIndex
CREATE INDEX "alternate_parts_alternatePartId_idx" ON "alternate_parts"("alternatePartId");

-- CreateIndex
CREATE UNIQUE INDEX "alternate_parts_primaryPartId_alternatePartId_key" ON "alternate_parts"("primaryPartId", "alternatePartId");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_change_requests_ecrNumber_key" ON "engineering_change_requests"("ecrNumber");

-- CreateIndex
CREATE INDEX "engineering_change_requests_status_idx" ON "engineering_change_requests"("status");

-- CreateIndex
CREATE INDEX "engineering_change_requests_bomId_idx" ON "engineering_change_requests"("bomId");

-- CreateIndex
CREATE INDEX "engineering_change_requests_assetId_idx" ON "engineering_change_requests"("assetId");

-- CreateIndex
CREATE INDEX "engineering_change_requests_plantId_idx" ON "engineering_change_requests"("plantId");

-- CreateIndex
CREATE INDEX "engineering_change_requests_requestedById_idx" ON "engineering_change_requests"("requestedById");

-- CreateIndex
CREATE INDEX "critical_spare_analysis_criticalityScore_idx" ON "critical_spare_analysis"("criticalityScore");

-- CreateIndex
CREATE INDEX "critical_spare_analysis_leadTimeRisk_idx" ON "critical_spare_analysis"("leadTimeRisk");

-- CreateIndex
CREATE UNIQUE INDEX "critical_spare_analysis_componentId_key" ON "critical_spare_analysis"("componentId");

-- CreateIndex
CREATE INDEX "telemetry_data_sources_sourceType_idx" ON "telemetry_data_sources"("sourceType");

-- CreateIndex
CREATE INDEX "telemetry_data_sources_status_idx" ON "telemetry_data_sources"("status");

-- CreateIndex
CREATE INDEX "telemetry_data_sources_plantId_idx" ON "telemetry_data_sources"("plantId");

-- CreateIndex
CREATE INDEX "telemetry_mappings_sourceId_idx" ON "telemetry_mappings"("sourceId");

-- CreateIndex
CREATE INDEX "telemetry_mappings_deviceId_idx" ON "telemetry_mappings"("deviceId");

-- CreateIndex
CREATE INDEX "telemetry_mappings_parameterName_idx" ON "telemetry_mappings"("parameterName");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_mappings_sourceId_externalId_key" ON "telemetry_mappings"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "telemetry_streams_mappingId_idx" ON "telemetry_streams"("mappingId");

-- CreateIndex
CREATE INDEX "telemetry_streams_sourceId_idx" ON "telemetry_streams"("sourceId");

-- CreateIndex
CREATE INDEX "telemetry_streams_timestamp_idx" ON "telemetry_streams"("timestamp");

-- CreateIndex
CREATE INDEX "telemetry_streams_sourceId_timestamp_idx" ON "telemetry_streams"("sourceId", "timestamp");

-- CreateIndex
CREATE INDEX "telemetry_streams_isAnomaly_idx" ON "telemetry_streams"("isAnomaly");

-- CreateIndex
CREATE INDEX "telemetry_aggregations_mappingId_idx" ON "telemetry_aggregations"("mappingId");

-- CreateIndex
CREATE INDEX "telemetry_aggregations_periodType_idx" ON "telemetry_aggregations"("periodType");

-- CreateIndex
CREATE INDEX "telemetry_aggregations_periodStart_idx" ON "telemetry_aggregations"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_aggregations_mappingId_periodType_periodStart_key" ON "telemetry_aggregations"("mappingId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "alarm_rules_mappingId_idx" ON "alarm_rules"("mappingId");

-- CreateIndex
CREATE INDEX "alarm_rules_severity_idx" ON "alarm_rules"("severity");

-- CreateIndex
CREATE INDEX "alarm_rules_isActive_idx" ON "alarm_rules"("isActive");

-- CreateIndex
CREATE INDEX "alarm_events_ruleId_idx" ON "alarm_events"("ruleId");

-- CreateIndex
CREATE INDEX "alarm_events_mappingId_idx" ON "alarm_events"("mappingId");

-- CreateIndex
CREATE INDEX "alarm_events_status_idx" ON "alarm_events"("status");

-- CreateIndex
CREATE INDEX "alarm_events_severity_idx" ON "alarm_events"("severity");

-- CreateIndex
CREATE INDEX "alarm_events_createdAt_idx" ON "alarm_events"("createdAt");

-- CreateIndex
CREATE INDEX "alarm_events_mappingId_severity_status_idx" ON "alarm_events"("mappingId", "severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "failure_modes_code_key" ON "failure_modes"("code");

-- CreateIndex
CREATE INDEX "failure_modes_category_idx" ON "failure_modes"("category");

-- CreateIndex
CREATE INDEX "failure_modes_severity_idx" ON "failure_modes"("severity");

-- CreateIndex
CREATE INDEX "rcm_analyses_assetId_idx" ON "rcm_analyses"("assetId");

-- CreateIndex
CREATE INDEX "rcm_analyses_status_idx" ON "rcm_analyses"("status");

-- CreateIndex
CREATE INDEX "weibull_analyses_componentId_idx" ON "weibull_analyses"("componentId");

-- CreateIndex
CREATE INDEX "downtime_analyses_assetId_idx" ON "downtime_analyses"("assetId");

-- CreateIndex
CREATE INDEX "downtime_analyses_periodStart_idx" ON "downtime_analyses"("periodStart");

-- CreateIndex
CREATE INDEX "remaining_useful_life_estimatedRul_idx" ON "remaining_useful_life"("estimatedRul");

-- CreateIndex
CREATE UNIQUE INDEX "remaining_useful_life_componentId_key" ON "remaining_useful_life"("componentId");

-- CreateIndex
CREATE INDEX "telemetry_readings_sourceId_idx" ON "telemetry_readings"("sourceId");

-- CreateIndex
CREATE INDEX "telemetry_readings_timestamp_idx" ON "telemetry_readings"("timestamp");

-- CreateIndex
CREATE INDEX "telemetry_readings_sourceId_timestamp_idx" ON "telemetry_readings"("sourceId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "edge_gateways_gatewayCode_key" ON "edge_gateways"("gatewayCode");

-- CreateIndex
CREATE INDEX "edge_gateways_status_idx" ON "edge_gateways"("status");

-- CreateIndex
CREATE INDEX "edge_gateways_plantId_idx" ON "edge_gateways"("plantId");

-- CreateIndex
CREATE INDEX "connectivity_sessions_sourceId_idx" ON "connectivity_sessions"("sourceId");

-- CreateIndex
CREATE INDEX "connectivity_sessions_status_idx" ON "connectivity_sessions"("status");

-- CreateIndex
CREATE INDEX "connectivity_sessions_gatewayId_idx" ON "connectivity_sessions"("gatewayId");

-- CreateIndex
CREATE INDEX "telemetry_batches_sourceId_idx" ON "telemetry_batches"("sourceId");

-- CreateIndex
CREATE INDEX "telemetry_batches_status_idx" ON "telemetry_batches"("status");

-- CreateIndex
CREATE INDEX "telemetry_batches_gatewayId_idx" ON "telemetry_batches"("gatewayId");

-- CreateIndex
CREATE INDEX "event_stream_records_eventType_idx" ON "event_stream_records"("eventType");

-- CreateIndex
CREATE INDEX "event_stream_records_sourceId_idx" ON "event_stream_records"("sourceId");

-- CreateIndex
CREATE INDEX "event_stream_records_severity_idx" ON "event_stream_records"("severity");

-- CreateIndex
CREATE INDEX "event_stream_records_timestamp_idx" ON "event_stream_records"("timestamp");

-- CreateIndex
CREATE INDEX "downsampled_readings_sourceId_interval_bucketStart_idx" ON "downsampled_readings"("sourceId", "interval", "bucketStart");

-- CreateIndex
CREATE INDEX "downsampled_readings_sourceId_interval_idx" ON "downsampled_readings"("sourceId", "interval");

-- CreateIndex
CREATE UNIQUE INDEX "downsampled_readings_sourceId_interval_bucketStart_key" ON "downsampled_readings"("sourceId", "interval", "bucketStart");

-- CreateIndex
CREATE INDEX "anomaly_records_sourceId_detectedAt_idx" ON "anomaly_records"("sourceId", "detectedAt");

-- CreateIndex
CREATE INDEX "anomaly_records_severity_idx" ON "anomaly_records"("severity");

-- CreateIndex
CREATE INDEX "anomaly_records_confirmed_idx" ON "anomaly_records"("confirmed");

-- CreateIndex
CREATE INDEX "data_quality_reports_sourceId_periodStart_idx" ON "data_quality_reports"("sourceId", "periodStart");

-- CreateIndex
CREATE INDEX "rbi_assessments_assetId_idx" ON "rbi_assessments"("assetId");

-- CreateIndex
CREATE INDEX "rbi_assessments_riskCategory_idx" ON "rbi_assessments"("riskCategory");

-- CreateIndex
CREATE INDEX "rbi_assessments_status_idx" ON "rbi_assessments"("status");

-- CreateIndex
CREATE INDEX "sil_assessments_assetId_idx" ON "sil_assessments"("assetId");

-- CreateIndex
CREATE INDEX "sil_assessments_silTarget_idx" ON "sil_assessments"("silTarget");

-- CreateIndex
CREATE INDEX "sil_assessments_status_idx" ON "sil_assessments"("status");

-- CreateIndex
CREATE INDEX "degradation_profiles_assetId_parameterName_idx" ON "degradation_profiles"("assetId", "parameterName");

-- CreateIndex
CREATE INDEX "degradation_profiles_degradationStage_idx" ON "degradation_profiles"("degradationStage");

-- CreateIndex
CREATE INDEX "lifecycle_forecasts_assetId_idx" ON "lifecycle_forecasts"("assetId");

-- CreateIndex
CREATE INDEX "spare_optimizations_inventoryItemId_idx" ON "spare_optimizations"("inventoryItemId");

-- CreateIndex
CREATE INDEX "spare_optimizations_abcClassification_idx" ON "spare_optimizations"("abcClassification");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_key_key" ON "workflow_definitions"("key");

-- CreateIndex
CREATE INDEX "workflow_definitions_key_idx" ON "workflow_definitions"("key");

-- CreateIndex
CREATE INDEX "workflow_definitions_category_idx" ON "workflow_definitions"("category");

-- CreateIndex
CREATE INDEX "workflow_definitions_isActive_idx" ON "workflow_definitions"("isActive");

-- CreateIndex
CREATE INDEX "workflow_instances_entityType_entityId_idx" ON "workflow_instances"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_instances_status_idx" ON "workflow_instances"("status");

-- CreateIndex
CREATE INDEX "workflow_instances_definitionId_idx" ON "workflow_instances"("definitionId");

-- CreateIndex
CREATE INDEX "workflow_step_history_instanceId_idx" ON "workflow_step_history"("instanceId");

-- CreateIndex
CREATE INDEX "workflow_step_history_stepId_idx" ON "workflow_step_history"("stepId");

-- CreateIndex
CREATE INDEX "sla_tracking_policyId_idx" ON "sla_tracking"("policyId");

-- CreateIndex
CREATE INDEX "sla_tracking_status_idx" ON "sla_tracking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sla_tracking_entityType_entityId_key" ON "sla_tracking"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "sto_events_stoNumber_key" ON "sto_events"("stoNumber");

-- CreateIndex
CREATE INDEX "sto_events_plantId_idx" ON "sto_events"("plantId");

-- CreateIndex
CREATE INDEX "sto_events_status_idx" ON "sto_events"("status");

-- CreateIndex
CREATE INDEX "sto_events_plannedStartDate_idx" ON "sto_events"("plannedStartDate");

-- CreateIndex
CREATE INDEX "sto_tasks_eventId_idx" ON "sto_tasks"("eventId");

-- CreateIndex
CREATE INDEX "sto_tasks_isOnCriticalPath_idx" ON "sto_tasks"("isOnCriticalPath");

-- CreateIndex
CREATE INDEX "sto_tasks_status_idx" ON "sto_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sto_contractors_code_key" ON "sto_contractors"("code");

-- CreateIndex
CREATE INDEX "sto_contractor_assignments_contractorId_idx" ON "sto_contractor_assignments"("contractorId");

-- CreateIndex
CREATE INDEX "sto_contractor_assignments_eventId_idx" ON "sto_contractor_assignments"("eventId");

-- CreateIndex
CREATE INDEX "sto_progress_reports_eventId_reportDate_idx" ON "sto_progress_reports"("eventId", "reportDate");

-- CreateIndex
CREATE INDEX "mobile_inspections_templateId_idx" ON "mobile_inspections"("templateId");

-- CreateIndex
CREATE INDEX "mobile_inspections_assetId_idx" ON "mobile_inspections"("assetId");

-- CreateIndex
CREATE INDEX "mobile_inspections_inspectorId_idx" ON "mobile_inspections"("inspectorId");

-- CreateIndex
CREATE INDEX "mobile_inspections_status_idx" ON "mobile_inspections"("status");

-- CreateIndex
CREATE INDEX "geofence_zones_plantId_idx" ON "geofence_zones"("plantId");

-- CreateIndex
CREATE INDEX "geofence_events_zoneId_timestamp_idx" ON "geofence_events"("zoneId", "timestamp");

-- CreateIndex
CREATE INDEX "geofence_events_userId_idx" ON "geofence_events"("userId");

-- CreateIndex
CREATE INDEX "sync_operations_userId_status_idx" ON "sync_operations"("userId", "status");

-- CreateIndex
CREATE INDEX "sync_operations_status_idx" ON "sync_operations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_documents_documentNumber_key" ON "engineering_documents"("documentNumber");

-- CreateIndex
CREATE INDEX "engineering_documents_category_idx" ON "engineering_documents"("category");

-- CreateIndex
CREATE INDEX "engineering_documents_plantId_idx" ON "engineering_documents"("plantId");

-- CreateIndex
CREATE INDEX "engineering_documents_status_idx" ON "engineering_documents"("status");

-- CreateIndex
CREATE INDEX "engineering_documents_discipline_idx" ON "engineering_documents"("discipline");

-- CreateIndex
CREATE INDEX "engineering_documents_documentNumber_idx" ON "engineering_documents"("documentNumber");

-- CreateIndex
CREATE INDEX "document_revisions_documentId_version_idx" ON "document_revisions"("documentId", "version");

-- CreateIndex
CREATE INDEX "pid_tag_links_documentId_idx" ON "pid_tag_links"("documentId");

-- CreateIndex
CREATE INDEX "pid_tag_links_tagNumber_idx" ON "pid_tag_links"("tagNumber");

-- CreateIndex
CREATE INDEX "pid_tag_links_assetId_idx" ON "pid_tag_links"("assetId");

-- CreateIndex
CREATE INDEX "document_search_logs_query_idx" ON "document_search_logs"("query");

-- CreateIndex
CREATE INDEX "document_search_logs_createdAt_idx" ON "document_search_logs"("createdAt");

-- CreateIndex
CREATE INDEX "domain_events_eventType_idx" ON "domain_events"("eventType");

-- CreateIndex
CREATE INDEX "domain_events_correlationId_idx" ON "domain_events"("correlationId");

-- CreateIndex
CREATE INDEX "domain_events_status_idx" ON "domain_events"("status");

-- CreateIndex
CREATE INDEX "domain_events_createdAt_idx" ON "domain_events"("createdAt");

-- CreateIndex
CREATE INDEX "domain_events_entityName_entityId_idx" ON "domain_events"("entityName", "entityId");

-- CreateIndex
CREATE INDEX "domain_events_eventType_createdAt_idx" ON "domain_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_level_idx" ON "observability_logs"("level");

-- CreateIndex
CREATE INDEX "observability_logs_service_idx" ON "observability_logs"("service");

-- CreateIndex
CREATE INDEX "observability_logs_timestamp_idx" ON "observability_logs"("timestamp");

-- CreateIndex
CREATE INDEX "observability_logs_traceId_idx" ON "observability_logs"("traceId");

-- CreateIndex
CREATE INDEX "observability_traces_traceId_idx" ON "observability_traces"("traceId");

-- CreateIndex
CREATE INDEX "observability_traces_serviceName_idx" ON "observability_traces"("serviceName");

-- CreateIndex
CREATE INDEX "observability_traces_timestamp_idx" ON "observability_traces"("timestamp");

-- CreateIndex
CREATE INDEX "observability_metric_snapshots_name_idx" ON "observability_metric_snapshots"("name");

-- CreateIndex
CREATE INDEX "observability_metric_snapshots_timestamp_idx" ON "observability_metric_snapshots"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "work_order_components_workOrderId_idx" ON "work_order_components"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_components_componentRegistryId_idx" ON "work_order_components"("componentRegistryId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_components_workOrderId_componentRegistryId_key" ON "work_order_components"("workOrderId", "componentRegistryId");

-- CreateIndex
CREATE UNIQUE INDEX "tool_calibration_requirements_toolId_key" ON "tool_calibration_requirements"("toolId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_key_idx" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_entityType_entityId_idx" ON "idempotency_records"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "labor_rates_userId_effectiveFrom_effectiveTo_idx" ON "labor_rates"("userId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "labor_rates_tradeId_effectiveFrom_effectiveTo_idx" ON "labor_rates"("tradeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "labor_rates_plantId_idx" ON "labor_rates"("plantId");

-- CreateIndex
CREATE INDEX "_SpatialAsset_B_index" ON "_SpatialAsset"("B");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_systemModuleId_fkey" FOREIGN KEY ("systemModuleId") REFERENCES "system_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assignedPlannerId_fkey" FOREIGN KEY ("assignedPlannerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pmScheduleId_fkey" FOREIGN KEY ("pmScheduleId") REFERENCES "pm_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedSupervisorId_fkey" FOREIGN KEY ("assignedSupervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_lockedBy_fkey" FOREIGN KEY ("lockedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "work_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_members" ADD CONSTRAINT "wo_team_members_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_members" ADD CONSTRAINT "wo_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_members" ADD CONSTRAINT "wo_team_members_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_member_requests" ADD CONSTRAINT "wo_team_member_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_member_requests" ADD CONSTRAINT "wo_team_member_requests_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_member_requests" ADD CONSTRAINT "wo_team_member_requests_requestedUserId_fkey" FOREIGN KEY ("requestedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_team_member_requests" ADD CONSTRAINT "wo_team_member_requests_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_time_logs" ADD CONSTRAINT "wo_time_logs_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_time_logs" ADD CONSTRAINT "wo_time_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_time_logs" ADD CONSTRAINT "wo_time_logs_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_materials" ADD CONSTRAINT "wo_materials_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_materials" ADD CONSTRAINT "wo_materials_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_materials" ADD CONSTRAINT "wo_materials_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_materials" ADD CONSTRAINT "wo_materials_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_comments" ADD CONSTRAINT "wo_comments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_comments" ADD CONSTRAINT "wo_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_task_executions" ADD CONSTRAINT "wo_task_executions_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_task_executions" ADD CONSTRAINT "wo_task_executions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_task_executions" ADD CONSTRAINT "wo_task_executions_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "pm_template_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "pm_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_templates" ADD CONSTRAINT "pm_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_template_tasks" ADD CONSTRAINT "pm_template_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "pm_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_triggers" ADD CONSTRAINT "pm_triggers_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "pm_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_status_history" ADD CONSTRAINT "wo_status_history_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_status_history" ADD CONSTRAINT "wo_status_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mr_comments" ADD CONSTRAINT "mr_comments_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mr_comments" ADD CONSTRAINT "mr_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_devices" ADD CONSTRAINT "iot_devices_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_devices" ADD CONSTRAINT "iot_devices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_readings" ADD CONSTRAINT "iot_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_alerts" ADD CONSTRAINT "iot_alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_alerts" ADD CONSTRAINT "iot_alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "iot_alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_alert_rules" ADD CONSTRAINT "iot_alert_rules_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_alert_rules" ADD CONSTRAINT "iot_alert_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transactions" ADD CONSTRAINT "tool_transactions_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transactions" ADD CONSTRAINT "tool_transactions_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transactions" ADD CONSTRAINT "tool_transactions_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transactions" ADD CONSTRAINT "tool_transactions_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transactions" ADD CONSTRAINT "tool_transactions_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_items" ADD CONSTRAINT "inventory_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "inventory_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_items" ADD CONSTRAINT "inventory_request_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_records" ADD CONSTRAINT "receiving_records_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_records" ADD CONSTRAINT "receiving_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_records" ADD CONSTRAINT "receiving_records_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_investigatedById_fkey" FOREIGN KEY ("investigatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_permits" ADD CONSTRAINT "safety_permits_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_permits" ADD CONSTRAINT "safety_permits_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpcProcess" ADD CONSTRAINT "SpcProcess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_readById_fkey" FOREIGN KEY ("readById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_childAssetId_fkey" FOREIGN KEY ("childAssetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twins" ADD CONSTRAINT "digital_twins_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twins" ADD CONSTRAINT "digital_twins_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_mesh_bindings" ADD CONSTRAINT "asset_mesh_bindings_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_mesh_bindings" ADD CONSTRAINT "asset_mesh_bindings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_scenes" ADD CONSTRAINT "digital_twin_scenes_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_scenes" ADD CONSTRAINT "digital_twin_scenes_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_scenes" ADD CONSTRAINT "digital_twin_scenes_modelFileId_fkey" FOREIGN KEY ("modelFileId") REFERENCES "model_library"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_scenes" ADD CONSTRAINT "digital_twin_scenes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_hotspots" ADD CONSTRAINT "twin_hotspots_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "digital_twin_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_hotspots" ADD CONSTRAINT "twin_hotspots_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "asset_mesh_bindings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_hotspots" ADD CONSTRAINT "twin_hotspots_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_camera_presets" ADD CONSTRAINT "twin_camera_presets_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "digital_twin_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_annotations" ADD CONSTRAINT "twin_annotations_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "digital_twin_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_annotations" ADD CONSTRAINT "twin_annotations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_diagrams" ADD CONSTRAINT "system_diagrams_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_diagrams" ADD CONSTRAINT "system_diagrams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_diagrams" ADD CONSTRAINT "system_diagrams_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_componentRegistryId_fkey" FOREIGN KEY ("componentRegistryId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_supervisorApprovedById_fkey" FOREIGN KEY ("supervisorApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_storekeeperApprovedById_fkey" FOREIGN KEY ("storekeeperApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_material_requests" ADD CONSTRAINT "repair_material_requests_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_supervisorApprovedById_fkey" FOREIGN KEY ("supervisorApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_storekeeperApprovedById_fkey" FOREIGN KEY ("storekeeperApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_requests" ADD CONSTRAINT "repair_tool_requests_returnConfirmedById_fkey" FOREIGN KEY ("returnConfirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_request_items" ADD CONSTRAINT "repair_tool_request_items_repairToolRequestId_fkey" FOREIGN KEY ("repairToolRequestId") REFERENCES "repair_tool_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tool_request_items" ADD CONSTRAINT "repair_tool_request_items_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transfer_requests" ADD CONSTRAINT "tool_transfer_requests_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transfer_requests" ADD CONSTRAINT "tool_transfer_requests_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transfer_requests" ADD CONSTRAINT "tool_transfer_requests_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transfer_requests" ADD CONSTRAINT "tool_transfer_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_transfer_requests" ADD CONSTRAINT "tool_transfer_requests_storekeeperApprovedById_fkey" FOREIGN KEY ("storekeeperApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_downtimes" ADD CONSTRAINT "wo_downtimes_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_downtimes" ADD CONSTRAINT "wo_downtimes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_completions" ADD CONSTRAINT "repair_completions_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_completions" ADD CONSTRAINT "repair_completions_supervisorApprovedById_fkey" FOREIGN KEY ("supervisorApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_completions" ADD CONSTRAINT "repair_completions_plannerClosedById_fkey" FOREIGN KEY ("plannerClosedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "repair_material_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_refurbisherId_fkey" FOREIGN KEY ("refurbisherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_returnedToStoreById_fkey" FOREIGN KEY ("returnedToStoreById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_returns" ADD CONSTRAINT "spare_part_returns_disposedById_fkey" FOREIGN KEY ("disposedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_toolRequestId_fkey" FOREIGN KEY ("toolRequestId") REFERENCES "repair_tool_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_repairCompletedById_fkey" FOREIGN KEY ("repairCompletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damaged_tool_reports" ADD CONSTRAINT "damaged_tool_reports_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_registry" ADD CONSTRAINT "component_registry_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_registry" ADD CONSTRAINT "component_registry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_registry" ADD CONSTRAINT "component_registry_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "digital_twins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_spare_parts" ADD CONSTRAINT "component_spare_parts_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_spare_parts" ADD CONSTRAINT "component_spare_parts_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_tool_requirements" ADD CONSTRAINT "component_tool_requirements_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_tool_requirements" ADD CONSTRAINT "component_tool_requirements_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_failureModeId_fkey" FOREIGN KEY ("failureModeId") REFERENCES "failure_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_assetModelId_fkey" FOREIGN KEY ("assetModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_modelLibraryId_fkey" FOREIGN KEY ("modelLibraryId") REFERENCES "model_library"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_audit_logs" ADD CONSTRAINT "twin_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictive_models" ADD CONSTRAINT "predictive_models_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictive_models" ADD CONSTRAINT "predictive_models_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictive_models" ADD CONSTRAINT "predictive_models_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_alerts" ADD CONSTRAINT "prediction_alerts_predictiveModelId_fkey" FOREIGN KEY ("predictiveModelId") REFERENCES "predictive_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_alerts" ADD CONSTRAINT "prediction_alerts_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_alerts" ADD CONSTRAINT "prediction_alerts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_alerts" ADD CONSTRAINT "prediction_alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_runtime_counters" ADD CONSTRAINT "component_runtime_counters_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_condition_readings" ADD CONSTRAINT "component_condition_readings_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_condition_readings" ADD CONSTRAINT "component_condition_readings_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_maintenance_history" ADD CONSTRAINT "component_maintenance_history_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_maintenance_history" ADD CONSTRAINT "component_maintenance_history_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_maintenance_history" ADD CONSTRAINT "component_maintenance_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_inspection_points" ADD CONSTRAINT "component_inspection_points_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_inspection_records" ADD CONSTRAINT "component_inspection_records_inspectionPointId_fkey" FOREIGN KEY ("inspectionPointId") REFERENCES "component_inspection_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_inspection_records" ADD CONSTRAINT "component_inspection_records_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_inspection_records" ADD CONSTRAINT "component_inspection_records_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_lubrication_schedules" ADD CONSTRAINT "component_lubrication_schedules_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_lubrication_records" ADD CONSTRAINT "component_lubrication_records_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "component_lubrication_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_lubrication_records" ADD CONSTRAINT "component_lubrication_records_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_lubrication_records" ADD CONSTRAINT "component_lubrication_records_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_replacement_history" ADD CONSTRAINT "component_replacement_history_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_replacement_history" ADD CONSTRAINT "component_replacement_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spatial_nodes" ADD CONSTRAINT "spatial_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "spatial_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_instructions" ADD CONSTRAINT "work_instructions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_instruction_executions" ADD CONSTRAINT "work_instruction_executions_workInstructionId_fkey" FOREIGN KEY ("workInstructionId") REFERENCES "work_instructions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_library" ADD CONSTRAINT "model_library_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_library" ADD CONSTRAINT "model_library_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_library" ADD CONSTRAINT "model_library_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesh_component_mappings" ADD CONSTRAINT "mesh_component_mappings_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "model_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesh_component_mappings" ADD CONSTRAINT "mesh_component_mappings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tours" ADD CONSTRAINT "inspection_tours_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tours" ADD CONSTRAINT "inspection_tours_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_processing_jobs" ADD CONSTRAINT "model_processing_jobs_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "model_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_processing_jobs" ADD CONSTRAINT "model_processing_jobs_queuedById_fkey" FOREIGN KEY ("queuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_view_bookmarks" ADD CONSTRAINT "asset_view_bookmarks_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "digital_twin_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_view_bookmarks" ADD CONSTRAINT "asset_view_bookmarks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revisions" ADD CONSTRAINT "bom_revisions_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revisions" ADD CONSTRAINT "bom_revisions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revisions" ADD CONSTRAINT "bom_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revision_items" ADD CONSTRAINT "bom_revision_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "bom_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revision_items" ADD CONSTRAINT "bom_revision_items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "bom_revision_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revision_items" ADD CONSTRAINT "bom_revision_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_revision_items" ADD CONSTRAINT "bom_revision_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_parts" ADD CONSTRAINT "alternate_parts_primaryPartId_fkey" FOREIGN KEY ("primaryPartId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_parts" ADD CONSTRAINT "alternate_parts_alternatePartId_fkey" FOREIGN KEY ("alternatePartId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_parts" ADD CONSTRAINT "alternate_parts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_parts" ADD CONSTRAINT "alternate_parts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_spare_analysis" ADD CONSTRAINT "critical_spare_analysis_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_spare_analysis" ADD CONSTRAINT "critical_spare_analysis_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_data_sources" ADD CONSTRAINT "telemetry_data_sources_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_data_sources" ADD CONSTRAINT "telemetry_data_sources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_data_sources" ADD CONSTRAINT "telemetry_data_sources_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "edge_gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_mappings" ADD CONSTRAINT "telemetry_mappings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "telemetry_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_mappings" ADD CONSTRAINT "telemetry_mappings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_streams" ADD CONSTRAINT "telemetry_streams_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "telemetry_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_streams" ADD CONSTRAINT "telemetry_streams_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "telemetry_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_aggregations" ADD CONSTRAINT "telemetry_aggregations_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "telemetry_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_rules" ADD CONSTRAINT "alarm_rules_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "telemetry_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_rules" ADD CONSTRAINT "alarm_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alarm_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "telemetry_mappings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_modes" ADD CONSTRAINT "failure_modes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rcm_analyses" ADD CONSTRAINT "rcm_analyses_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rcm_analyses" ADD CONSTRAINT "rcm_analyses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rcm_analyses" ADD CONSTRAINT "rcm_analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weibull_analyses" ADD CONSTRAINT "weibull_analyses_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weibull_analyses" ADD CONSTRAINT "weibull_analyses_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_analyses" ADD CONSTRAINT "downtime_analyses_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_analyses" ADD CONSTRAINT "downtime_analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remaining_useful_life" ADD CONSTRAINT "remaining_useful_life_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remaining_useful_life" ADD CONSTRAINT "remaining_useful_life_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edge_gateways" ADD CONSTRAINT "edge_gateways_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edge_gateways" ADD CONSTRAINT "edge_gateways_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectivity_sessions" ADD CONSTRAINT "connectivity_sessions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "telemetry_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectivity_sessions" ADD CONSTRAINT "connectivity_sessions_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "edge_gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_history" ADD CONSTRAINT "workflow_step_history_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sto_tasks" ADD CONSTRAINT "sto_tasks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "sto_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sto_contractor_assignments" ADD CONSTRAINT "sto_contractor_assignments_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "sto_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sto_contractor_assignments" ADD CONSTRAINT "sto_contractor_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "sto_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sto_progress_reports" ADD CONSTRAINT "sto_progress_reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "sto_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_inspections" ADD CONSTRAINT "mobile_inspections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "engineering_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_components" ADD CONSTRAINT "work_order_components_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_components" ADD CONSTRAINT "work_order_components_componentRegistryId_fkey" FOREIGN KEY ("componentRegistryId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calibration_requirements" ADD CONSTRAINT "tool_calibration_requirements_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calibration_requirements" ADD CONSTRAINT "tool_calibration_requirements_calibrationCertId_fkey" FOREIGN KEY ("calibrationCertId") REFERENCES "calibration_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calibration_requirements" ADD CONSTRAINT "tool_calibration_requirements_calibratedById_fkey" FOREIGN KEY ("calibratedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calibration_requirements" ADD CONSTRAINT "tool_calibration_requirements_emergencyOverrideById_fkey" FOREIGN KEY ("emergencyOverrideById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_rates" ADD CONSTRAINT "labor_rates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_rates" ADD CONSTRAINT "labor_rates_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_rates" ADD CONSTRAINT "labor_rates_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SpatialAsset" ADD CONSTRAINT "_SpatialAsset_A_fkey" FOREIGN KEY ("A") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SpatialAsset" ADD CONSTRAINT "_SpatialAsset_B_fkey" FOREIGN KEY ("B") REFERENCES "spatial_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

