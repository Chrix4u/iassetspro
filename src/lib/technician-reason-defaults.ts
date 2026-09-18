type WorkOrderReasonContext = {
  woNumber?: string | null;
  title?: string | null;
};

function workOrderLabel(context: WorkOrderReasonContext) {
  const number = context.woNumber?.trim();
  const title = context.title?.trim();
  if (number && title) return `${number} — ${title}`;
  if (number) return number;
  if (title) return title;
  return 'this work order';
}

export function materialRequestReason(
  context: WorkOrderReasonContext & { itemName?: string | null },
) {
  const item = context.itemName?.trim() || 'Selected material / spare part';
  return `${item} required to execute ${workOrderLabel(context)}`;
}

export function toolRequestReason(
  context: WorkOrderReasonContext & { toolName?: string | null },
) {
  const tool = context.toolName?.trim() || 'Selected tool';
  return `${tool} required to execute ${workOrderLabel(context)}`;
}

export function assistanceRequestReason(
  context: WorkOrderReasonContext & { trade?: string | null },
) {
  const trade = context.trade?.trim() || 'technical';
  return `Additional ${trade} support required to execute ${workOrderLabel(context)}`;
}

export function waitingStateReason(
  context: WorkOrderReasonContext & { targetStatus?: string | null },
) {
  const label = workOrderLabel(context);
  switch (context.targetStatus) {
    case 'waiting_parts':
      return `Waiting for required parts / materials for ${label}`;
    case 'waiting_tools':
      return `Waiting for required tools for ${label}`;
    case 'waiting_shutdown':
      return `Waiting for approved equipment shutdown for ${label}`;
    case 'waiting_permit':
      return `Waiting for required permit / safety clearance for ${label}`;
    default:
      return `Execution temporarily paused for ${label}`;
  }
}

export function handoverReason(
  context: WorkOrderReasonContext & {
    fromShift?: string | null;
    toShift?: string | null;
  },
) {
  const from = context.fromShift?.trim() || 'current';
  const to = context.toShift?.trim() || 'incoming';
  return `Shift handover from ${from} to ${to} for ${workOrderLabel(context)}`;
}

export function downtimeReason(
  context: WorkOrderReasonContext & {
    category?: string | null;
    assetName?: string | null;
  },
) {
  const category = context.category?.trim()?.replaceAll('_', ' ') || 'unplanned';
  const asset = context.assetName?.trim() || 'asset';
  return `${category.charAt(0).toUpperCase() + category.slice(1)} downtime recorded for ${asset} during ${workOrderLabel(context)}`;
}

export function assignmentDeclineReason(context: WorkOrderReasonContext) {
  return `Technician declined assignment for ${workOrderLabel(context)}`;
}

export function pauseReason(context: WorkOrderReasonContext) {
  return `Technician temporarily paused execution of ${workOrderLabel(context)}`;
}
