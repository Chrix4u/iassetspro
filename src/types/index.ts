// ============================================================================
// SHARED TYPESCRIPT TYPES FOR EAM SYSTEM
// ============================================================================

// User & Auth
export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatar?: string;
  phone?: string;
  staffId?: string;
  department?: string;
  departmentId?: string;
  supervisorId?: string;
  plantId?: string;
  status: string;
  isVendorAdmin?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  plant?: Plant;
  roles?: Role[];
  permissions?: string[];
  plantAccess?: Plant[];
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  level: number;
  isSystem: boolean;
  color?: string;
  permissionCount?: number;
}

export interface Permission {
  id: string;
  slug: string;
  name: string;
  module: string;
  action: string;
  description?: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role: Role;
}

// Organization
export interface Plant {
  id: string;
  code: string;
  name: string;
  location?: string;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string;
  level: number;
  isActive: boolean;
}

// Modules
export interface Module {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  version: string;
  isCore: boolean;
  isActive: boolean;
  sortOrder: number;
  routePath?: string;
  isEnabled?: boolean; // company activation
  // Vendor licensing fields
  isSystemLicensed?: boolean;
  licenseKey?: string;
  validFrom?: string;
  validUntil?: string;
  licensedAt?: string;
  licensedBy?: string;
  licensedByUser?: { id: string; fullName: string };
  activatedAt?: string;
  activationLocked?: boolean;
}

// Maintenance Requests
export interface MaintenanceRequest {
  id: string;
  requestNumber: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  machineDownStatus: boolean;
  assetId?: string;
  assetName?: string;
  location?: string;
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  workflowStatus: string;
  category?: string;
  requestedBy: string;
  supervisorId?: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  assignedPlannerId?: string;
  workOrderId?: string;
  slaHours?: number;
  createdAt: string;
  updatedAt: string;
  // Joined
  requester?: { id: string; fullName: string; username: string; department?: { id: string; name: string } | string };
  supervisor?: { id: string; fullName: string; username: string };
  approver?: { id: string; fullName: string; username: string };
  assignedPlanner?: { id: string; fullName: string; username: string };
  comments?: MRComment[];
  statusHistory?: MRStatusHistory[];
  workOrder?: { id: string; woNumber: string; title: string; status: string };
}

export interface MRComment {
  id: string;
  maintenanceRequestId: string;
  userId: string;
  content: string;
  createdAt: string;
  user?: { id: string; fullName: string };
}

export interface MRStatusHistory {
  id: string;
  maintenanceRequestId: string;
  fromStatus?: string;
  toStatus: string;
  changedById?: string;
  reason?: string;
  createdAt: string;
  changedBy?: { id: string; fullName: string };
}

// Work Orders
export interface WorkOrder {
  id: string;
  woNumber: string;
  title: string;
  description?: string;
  type: 'preventive' | 'corrective' | 'predictive' | 'inspection' | 'emergency' | 'project';
  priority: 'low' | 'medium' | 'high' | 'critical' | 'emergency';
  status: 'draft' | 'requested' | 'approved' | 'planned' | 'assigned' | 'in_progress' | 'waiting_parts' | 'waiting_tools' | 'waiting_shutdown' | 'waiting_permit' | 'on_hold' | 'pending_handover' | 'completed' | 'verified' | 'closed' | 'cancelled';
  assetId?: string;
  assetName?: string;
  departmentId?: string;
  requestId?: string;
  assignedToId?: string;
  assignedToName?: string;
  teamLeaderId?: string;
  supervisorId?: string;
  plannerId?: string;
  assignedById?: string;
  assignedAt?: string;
  assignmentType?: string;
  assignmentResponseStatus?: 'pending' | 'accepted' | 'declined';
  assignmentRespondedBy?: string;
  assignmentRespondedAt?: string;
  assignmentResponseReason?: string;
  estimatedHours?: number;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  actualHours?: number;
  totalCost: number;
  materialCost: number;
  laborCost: number;
  slaHours?: number;
  slaStartedAt?: string;
  slaBreached: boolean;
  responseDue?: string;
  resolutionDue?: string;
  failureDescription?: string;
  causeDescription?: string;
  actionDescription?: string;
  isLocked: boolean;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  teamMembers?: WOTeamMember[];
  timeLogs?: WOTimeLog[];
  materials?: WOMaterial[];
  comments?: WOComment[];
  statusHistory?: WOStatusHistory[];
  personalTools?: PersonalTool[];
  creator?: { id: string; fullName: string };
  request?: {
    id: string;
    requestNumber: string;
    title: string;
    requester?: { id: string; fullName: string };
  };
}

export interface WOTeamMember {
  id: string;
  workOrderId: string;
  userId?: string;
  userName?: string;
  role: string;
  accessLevel?: 'full' | 'read_only';
  hours?: number;
  createdAt: string;
  user?: { id: string; fullName: string; username: string; department?: string };
}

export interface WOTimeLog {
  id: string;
  workOrderId: string;
  userId?: string;
  userName?: string;
  action: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  note?: string;
  createdAt: string;
}

export interface WOMaterial {
  id: string;
  workOrderId: string;
  itemName?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  status: string;
  createdAt: string;
}

export interface WOComment {
  id: string;
  workOrderId: string;
  userId?: string;
  userName?: string;
  content: string;
  createdAt: string;
}

export interface WOStatusHistory {
  id: string;
  workOrderId: string;
  fromStatus?: string;
  toStatus: string;
  changedById?: string;
  changedByName?: string;
  reason?: string;
  createdAt: string;
}

export interface WOTeamMemberExtended {
  id: string;
  workOrderId: string;
  userId: string;
  role: string;
  accessLevel: 'full' | 'read_only';
  assignedAt: string;
  user?: { id: string; fullName: string; username: string; department?: string };
}

export interface PersonalTool {
  id?: string;
  toolName: string;
  toolCode?: string;
  condition: 'new' | 'good' | 'fair' | 'poor';
  notes?: string;
}

// Repair Module
export type RepairMaterialRequestStatus = 'pending' | 'supervisor_approved' | 'storekeeper_approved' | 'store_approved' | 'picking' | 'issued' | 'returned' | 'closed' | 'partially_returned' | 'fully_returned' | 'rejected';
export type RepairToolRequestStatus = 'pending' | 'supervisor_approved' | 'storekeeper_approved' | 'issued' | 'pending_return' | 'returned' | 'transferred' | 'rejected';
export type ToolTransferStatus = 'pending' | 'storekeeper_approved' | 'awaiting_handover' | 'transferred' | 'rejected';

export interface RepairMaterialRequest {
  id: string;
  workOrderId: string;
  itemId?: string;
  itemName: string;
  quantityRequested: number;
  quantityApproved: number;
  quantityIssued: number;
  quantityReturned: number;
  unit: string;
  unitCost?: number;
  estimatedCost: number;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  reason: string;
  notes?: string;
  rejectionReason?: string;
  status: RepairMaterialRequestStatus;
  requestedById: string;
  supervisorApprovedById?: string;
  supervisorApprovedAt?: string;
  supervisorApprovedQuantity?: number;
  storekeeperApprovedById?: string;
  storekeeperApprovedAt?: string;
  storekeeperApprovedQuantity?: number;
  issuedById?: string;
  issuedAt?: string;
  returnedById?: string;
  returnedAt?: string;
  consumedQty?: number;
  wastedQty?: number;
  pickedAt?: string;
  pickedBy?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  workOrder?: { id: string; woNumber: string; title: string; status: string };
  item?: { id: string; itemCode: string; name: string; currentStock: number; unitOfMeasure: string };
  requestedBy?: { id: string; fullName: string; username: string; department?: { id: string; name: string } };
  supervisorApprovedBy?: { id: string; fullName: string; username: string };
  storekeeperApprovedBy?: { id: string; fullName: string; username: string };
  issuedByUser?: { id: string; fullName: string; username: string };
  returnedByUser?: { id: string; fullName: string; username: string };
  pickedByUser?: { id: string; fullName: string; username: string };
}

export interface RepairToolRequest {
  id: string;
  workOrderId: string;
  toolId?: string;
  toolName: string;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  reason: string;
  notes?: string;
  rejectionReason?: string;
  status: RepairToolRequestStatus;
  requestedById: string;
  supervisorApprovedById?: string;
  supervisorApprovedAt?: string;
  storekeeperApprovedById?: string;
  storekeeperApprovedAt?: string;
  issuedById?: string;
  issuedAt?: string;
  returnedById?: string;
  returnedAt?: string;
  toolConditionAtIssue?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  workOrder?: { id: string; woNumber: string; title: string; status: string };
  tool?: { id: string; toolCode: string; name: string; category: string; status: string; condition: string; serialNumber?: string; assignedToId?: string };
  requestedBy?: { id: string; fullName: string; username: string; department?: { id: string; name: string } };
  supervisorApprovedBy?: { id: string; fullName: string; username: string };
  storekeeperApprovedBy?: { id: string; fullName: string; username: string };
  issuedByUser?: { id: string; fullName: string; username: string };
  returnedByUser?: { id: string; fullName: string; username: string };
}

export interface ToolTransferRequest {
  id: string;
  toolId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  notes?: string;
  rejectionReason?: string;
  toolConditionAtTransfer?: string;
  status: ToolTransferStatus;
  requestedById: string;
  storekeeperApprovedById?: string;
  storekeeperApprovedAt?: string;
  fromUserAcceptedAt?: string;
  toUserAcceptedAt?: string;
  transferredAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  tool?: { id: string; toolCode: string; name: string; category: string; status: string; condition: string; serialNumber?: string };
  fromUser?: { id: string; fullName: string; username: string; department?: { id: string; name: string } };
  toUser?: { id: string; fullName: string; username: string; department?: { id: string; name: string } };
  requestedBy?: { id: string; fullName: string; username: string };
  storekeeperApprovedBy?: { id: string; fullName: string; username: string };
}

// Dashboard
export interface DashboardStats {
  totalRequests: number;
  pendingRequests: number;
  pendingApprovals: number;
  approvedRequests: number;
  rejectedRequests: number;
  convertedRequests: number;
  totalWorkOrders: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  overdueWorkOrders: number;
  createdTodayMR: number;
  createdTodayWO: number;
  completedTodayWO: number;
  pendingMR: number;
  inProgressMR: number;
  approvedMR: number;
  rejectedMR: number;
  convertedMR: number;
  draftWO: number;
  requestedWO: number;
  approvedWO: number;
  assignedWO: number;
  inProgressWO: number;
  completedWO: number;
  closedWO: number;
  preventiveWO: number;
  correctiveWO: number;
  emergencyWO: number;
  inspectionWO: number;
  predictiveWO: number;
  highPriorityMR: number;
  mediumPriorityMR: number;
  lowPriorityMR: number;
  recentRequests: MaintenanceRequest[];
  recentWorkOrders: WorkOrder[];
  // Cross-module KPIs
  assetHealth: { poor: number; critical: number; total: number; byCondition: Record<string, number> };
  safetyAlerts: { openIncidents: number; overdueInspections: number };
  production: { activeOrders: number; overdueOrders: number; completionRate: number };
  iotStatus: { totalDevices: number; offlineCount: number; alertCount: number };
  quality: { openNcrs: number; failedInspections: number; pendingAudits: number };
  inventoryAlerts: { lowStock: number; pendingRequests: number };
  weeklyTrends: {
    workOrders: number[];
    maintenanceRequests: number[];
    productionOrders: number[];
  };
  // Enhanced KPIs
  maintenanceKPIs: {
    mtbf: number;
    mttr: number;
    plannedRatio: number;
    preventiveCount: number;
    reactiveCount: number;
  };
  pmScheduleAlerts: {
    dueSoon: number;
    overdue: number;
  };
  costAnalysis: {
    thisMonthTotal: number;
    lastMonthTotal: number;
    changePercent: number;
    thisMonthLabor: number;
    thisMonthParts: number;
    thisMonthContractor: number;
    byCategory: Record<string, { totalCost: number; laborCost: number; partsCost: number }>;
  };
  // Role-based personal KPIs
  myKPIs: {
    activeWorkOrders: number;
    pendingTasks: number;
    completedThisWeek: number;
    toolsCheckedOut: number;
    unreadNotifications: number;
  };
  supervisorKPIs: {
    pendingApprovals: number;
    teamActiveWOs: number;
  };
  plannerKPIs: {
    planningQueue: number;
    pmSchedulesDue: number;
  };
  userRoles: string[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

// Asset Categories & Assets
export interface AssetCategory { id: string; name: string; code: string; description?: string; parentId?: string; isActive: boolean; createdAt: string; updatedAt: string; parent?: AssetCategory; children?: AssetCategory[]; _count?: { assets: number }; }

export interface Asset { id: string; name: string; assetTag: string; description?: string; categoryId?: string; serialNumber?: string; manufacturer?: string; model?: string; yearManufactured?: number; condition: string; status: string; criticality: string; location?: string; building?: string; floor?: string; area?: string; plantId?: string; departmentId?: string; purchaseDate?: string; purchaseCost?: number; warrantyExpiry?: string; installedDate?: string; expectedLifeYears?: number; currentValue?: number; depreciationRate?: number; imageUrl?: string; parentId?: string; isActive: boolean; createdById?: string; assignedToId?: string; createdAt: string; updatedAt: string; category?: AssetCategory; plant?: { id: string; name: string; code: string }; department?: { id: string; name: string; code: string }; assignedTo?: { id: string; fullName: string; username: string }[]; pmSchedules?: any[]; }

export interface InventoryItem { id: string; itemCode: string; name: string; description?: string; category: string; unitOfMeasure: string; currentStock: number; minStockLevel: number; maxStockLevel?: number; reorderQuantity?: number; unitCost?: number; supplier?: string; supplierPartNumber?: string; location?: string; binLocation?: string; shelfLocation?: string; plantId?: string; isActive: boolean; createdById?: string; createdAt: string; updatedAt: string; plant?: { id: string; name: string }; stockMovements?: any[]; }

export interface PmSchedule { id: string; title: string; description?: string; assetId: string; frequencyType: string; frequencyValue: number; lastCompletedDate?: string; nextDueDate?: string; estimatedDuration?: number; priority: string; assignedToId?: string; departmentId?: string; isActive: boolean; autoGenerateWO: boolean; leadDays: number; createdById?: string; templateId?: string; createdAt: string; updatedAt: string; asset?: Asset; template?: PmTemplate; assignedTo?: { id: string; fullName: string; username: string }[]; department?: { id: string; name: string; code: string }; }

export interface PmTemplate { id: string; title: string; description?: string; type: string; category?: string; estimatedDuration: number; priority: string; requiredSkills?: string; requiredTools?: string; isActive: boolean; createdById: string; createdAt: string; updatedAt: string; createdBy?: { id: string; fullName: string; username: string }; tasks?: PmTemplateTask[]; _count?: { tasks: number; schedules: number }; }

export interface PmTemplateTask { id: string; templateId: string; taskNumber: number; description: string; taskType: string; requiredParts?: string; estimatedMinutes?: number; sortOrder: number; isActive: boolean; }

export interface PmTrigger { id: string; scheduleId: string; triggerType: string; triggerValue: number; triggerConfig?: string; isActive: boolean; createdAt: string; updatedAt: string; schedule?: PmSchedule & { asset?: Asset; department?: { id: string; name: string; code: string } }; }

// Company Profile
export interface CompanyProfile {
  id: string;
  companyName: string;
  tradingName?: string;
  logo?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  industry?: string;
  employeeCount?: string;
  fiscalYearStart?: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  isSetupComplete: boolean;
  setupCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Navigation — Full EAM module pages matching reference project
export type PageName =
  // Core
  | 'dashboard'
  | 'chat'
  | 'notifications'
  // Assets (7 subpages)
  | 'asset-categories'
  | 'assets-machines'
  | 'assets-hierarchy'
  | 'assets-bom'
  | 'assets-condition-monitoring'
  | 'assets-digital-twin'
  | 'digital-twin-viewer'
  | 'system-diagrams'
  | 'assets-health'
  // AI Intelligence
  | 'ai-hub'
  | 'ai-config'
  | 'ai-history'
  // Maintenance (8 subpages)
  | 'maintenance-work-orders'
  | 'wo-detail'
  | 'maintenance-requests'
  | 'mr-detail'
  | 'create-mr'
  | 'maintenance-dashboard'
  | 'maintenance-analytics'
  | 'maintenance-calibration'
  | 'maintenance-risk-assessment'
  | 'maintenance-tools'
  | 'pm-schedules'
  | 'pm-templates'
  | 'pm-triggers'
  | 'pm-calendar'
  // Planner Workbench
  | 'planner-workbench'
  | 'enterprise-reports'
  // Repairs Module (6 subpages)
  | 'repairs-material-requests'
  | 'repairs-tool-requests'
  | 'repairs-tool-transfers'
  | 'repairs-downtime'
  | 'repairs-completion'
  | 'repairs-analytics'
  | 'repairs-spare-part-returns'
  | 'repairs-damaged-tools'
  | 'repairs-reports'
  | 'wo-reports'
  // IoT (3 subpages)
  | 'iot-devices'
  | 'iot-monitoring'
  | 'iot-rules'
  // Analytics (4 subpages)
  | 'analytics-kpi'
  | 'analytics-oee'
  | 'analytics-downtime'
  | 'analytics-energy'
  // Operations (6 subpages)
  | 'operations-meter-readings'
  | 'operations-training'
  | 'operations-surveys'
  | 'operations-time-logs'
  | 'operations-shift-handover'
  | 'operations-checklists'
  | 'technician-timesheet'
  | 'connectivity'
  | 'reliability-engineering'
  | 'observability-dashboard'
  | 'historian-dashboard'
  // Production (8 subpages)
  | 'production-work-centers'
  | 'production-resource-planning'
  | 'production-scheduling'
  | 'production-capacity'
  | 'production-efficiency'
  | 'production-bottlenecks'
  | 'production-orders'
  | 'production-batches'
  // Quality (6 subpages)
  | 'quality-inspections'
  | 'quality-ncr'
  | 'quality-audits'
  | 'quality-control-plans'
  | 'quality-spc'
  | 'quality-capa'
  // Safety (5 subpages)
  | 'safety-incidents'
  | 'safety-inspections'
  | 'safety-training'
  | 'safety-equipment'
  | 'safety-permits'
  // Inventory (10 subpages)
  | 'inventory-items'
  | 'inventory-categories'
  | 'inventory-locations'
  | 'inventory-transactions'
  | 'inventory-adjustments'
  | 'inventory-requests'
  | 'inventory-transfers'
  | 'inventory-suppliers'
  | 'inventory-purchase-orders'
  | 'inventory-receiving'
  // Reports (8 subpages)
  | 'reports-asset'
  | 'machine-availability'
  | 'equipment-history'
  | 'failure-analysis'
  | 'reports-maintenance'
  | 'reports-inventory'
  | 'reports-production'
  | 'reports-quality'
  | 'reports-safety'
  | 'reports-financial'
  | 'reports-custom'
  // Settings (8 subpages)
  | 'settings-general'
  | 'settings-users'
  | 'settings-roles'
  | 'settings-modules'
  | 'settings-notifications'
  | 'settings-integrations'
  | 'settings-backup'
  | 'settings-audit'
  | 'settings-company'
  | 'settings-plants'
  | 'settings-departments'
  | 'settings-security'
  | 'settings-health'
  | 'settings-queues'
  | 'settings-preferences'
  // Legacy fallbacks
  | 'assets'
  | 'asset-detail'
  | 'inventory'
  | 'analytics';

// ============================================================================
// Digital Twin Component Registry
// ============================================================================

export interface ComponentRegistryItem {
  id: string;
  parentId: string | null;
  assetId: string | null;
  twinId: string | null;
  componentCode: string;
  name: string;
  description: string | null;
  componentType: string;
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  specification: string | null;
  operatingParams: string | null;
  criticality: string;
  lifecycleStatus: string;
  installedDate: string | null;
  expectedLifeHours: number | null;
  operatingHours: number;
  lastInspection: string | null;
  nextInspectionDue: string | null;
  healthScore: number;
  notes: string | null;
  children?: ComponentRegistryItem[];
  _count?: { children: number; failureRecords: number; sparePartLinks: number };
}

export interface FailureRecord {
  id: string;
  componentId: string;
  assetId: string | null;
  workOrderId: string | null;
  failureCode: string | null;
  failureMode: string;
  failureCause: string | null;
  failureSeverity: string;
  symptoms: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  downtimeMinutes: number;
  repairCost: number | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  component?: { name: string; componentCode: string };
}

export interface FailureAnalysisData {
  failureCount: number;
  mtbf: number | null;
  mttr: number | null;
  totalDowntimeMinutes: number;
  totalRepairCost: number;
  byMode: { mode: string; count: number; percentage: number }[];
  bySeverity: { severity: string; count: number }[];
  byMonth: { month: string; failures: number; downtimeMinutes: number; cost: number }[];
  topFailingComponents: { id: string; name: string; code: string; failureCount: number }[];
  reliabilityScore: number;
}

export interface PredictionAlertData {
  id: string;
  predictiveModelId: string;
  componentId: string | null;
  assetId: string | null;
  alertType: string;
  severity: string;
  confidence: number | null;
  predictedFailureAt: string | null;
  message: string;
  recommendations: string | null;
  isAcknowledged: boolean;
  acknowledgedById: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  predictiveModel?: { name: string; modelType: string };
  component?: { name: string; componentCode: string };
}

export interface PredictiveModelData {
  id: string;
  componentId: string | null;
  assetId: string | null;
  modelName: string;
  modelType: string;
  algorithm: string | null;
  description: string | null;
  trainingStatus: string;
  accuracy: number | null;
  lastTrainedAt: string | null;
  dataPoints: number;
  isActive: boolean;
}

// ============================================================================
// DIGITAL WORK INSTRUCTIONS
// ============================================================================

export interface WorkInstruction {
  id: string;
  title: string;
  description: string;
  componentId: string;
  assetId: string;
  maintenanceType: string;
  estimatedDuration: number;
  difficulty: string;
  safetyLevel: string;
  requiresLockout: boolean;
  requiresPermit: boolean;
  prerequisites: string[];
  steps: WorkInstructionStep[];
  requiredTools: WorkInstructionTool[];
  requiredParts: WorkInstructionPart[];
  safetyCheckpoints: SafetyCheckpoint[];
  version: number;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
  component?: { id: string; name: string; componentCode: string };
}

export interface WorkInstructionStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  type: string;
  mediaUrls: string[];
  tips: string[];
  warnings: string[];
  estimatedMinutes: number;
  verificationRequired: boolean;
  verificationType: string;
  verificationSpec: string | null;
  acknowledgmentRequired: boolean;
  isCheckpoint: boolean;
}

export interface WorkInstructionTool {
  id: string;
  toolName: string;
  toolCode: string;
  quantity: number;
  specification?: string;
  verified: boolean;
}

export interface WorkInstructionPart {
  id: string;
  partName: string;
  partCode: string;
  quantity: number;
  source: string;
  verified: boolean;
}

export interface SafetyCheckpoint {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  type: string;
  ppeRequired: string[];
  acknowledgmentRequired: boolean;
  isPassed: boolean;
  acknowledgedById?: string;
  acknowledgedAt?: string;
}

export interface WorkInstructionExecution {
  id: string;
  workInstructionId: string;
  workOrderId: string;
  technicianId: string;
  status: string;
  currentStep: number;
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  totalDuration: number | null;
  stepResults: StepResult[];
  safetyResults: SafetyResult[];
  toolVerifications: ToolVerification[];
  partVerifications: PartVerification[];
  notes: string;
  completionEvidence: string[];
}

export interface StepResult {
  stepNumber: number;
  status: string;
  completedAt: string | null;
  verificationResult: string | null;
  verificationValue: string | null;
  notes: string | null;
  mediaUrls: string[];
  duration: number | null;
}

export interface SafetyResult {
  stepNumber: number;
  isPassed: boolean;
  acknowledgedById: string;
  acknowledgedAt: string;
  notes: string | null;
}

export interface ToolVerification {
  toolId: string;
  toolName: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedById: string | null;
  notes: string | null;
}

export interface PartVerification {
  partId: string;
  partName: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedById: string | null;
  quantityVerified: number | null;
  notes: string | null;
}
