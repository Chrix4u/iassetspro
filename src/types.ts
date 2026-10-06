// Compatibility facade for shared application types.
// Explicit PM exports below override the legacy PM relation shapes from
// ./types/index while all other shared types continue to re-export unchanged.
export * from './types/index';

import type { Asset, PmTemplate } from './types/index';

export interface PmSchedule {
  id: string;
  title: string;
  description?: string;
  assetId: string;
  componentId?: string | null;
  frequencyType: string;
  frequencyValue: number;
  lastCompletedDate?: string;
  nextDueDate?: string;
  estimatedDuration?: number;
  priority: string;
  assignedToId?: string | null;
  departmentId?: string | null;
  isActive: boolean;
  autoGenerateWO: boolean;
  leadDays: number;
  createdById?: string;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
  asset?: Asset;
  component?: {
    id: string;
    name: string;
    componentCode: string;
    componentType: string;
    parentId?: string | null;
    assetId?: string | null;
  } | null;
  template?: PmTemplate | null;
  assignedTo?: { id: string; fullName: string; username: string } | null;
  department?: { id: string; name: string; code: string } | null;
}

export interface PmTrigger {
  id: string;
  scheduleId: string;
  triggerType: string;
  triggerValue: number;
  triggerConfig?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  schedule?: PmSchedule & {
    asset?: Asset;
    department?: { id: string; name: string; code: string };
  };
}
