import { notifyUser } from '@/lib/notifications';

export type RepairNotificationEvent =
  | 'assistance_requested'
  | 'assistance_approved'
  | 'assistance_rejected'
  | 'tool_approved'
  | 'tool_ready'
  | 'tool_issued'
  | 'tool_overdue'
  | 'material_approved'
  | 'material_issued'
  | 'completion_submitted'
  | 'rework_requested'
  | 'supervisor_verified'
  | 'planner_closed'
  | 'wo_started'
  | 'wo_on_hold'
  | 'wo_waiting'
  | 'wo_released'
  | 'wo_resumed'
  | 'shift_handover_pending';

interface NotificationPayload {
  userId: string;
  event: RepairNotificationEvent;
  woNumber: string;
  woId: string;
  title?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const EVENT_TEMPLATES: Record<RepairNotificationEvent, { title: string; messageTemplate: string }> = {
  assistance_requested: { title: 'Assistance Requested', messageTemplate: '{actorName} requested assistance on {woNumber}: {details}' },
  assistance_approved: { title: 'Assistance Approved', messageTemplate: 'Your assistance request for {woNumber} has been approved' },
  assistance_rejected: { title: 'Assistance Rejected', messageTemplate: 'Your assistance request for {woNumber} was rejected: {details}' },
  tool_approved: { title: 'Tool Request Approved', messageTemplate: 'Tool request for {woNumber} has been approved' },
  tool_ready: { title: 'Tools Ready for Pickup', messageTemplate: 'Requested tools for {woNumber} are ready at the tool store' },
  tool_issued: { title: 'Tools Issued', messageTemplate: 'Tools for {woNumber} have been issued to {details}' },
  tool_overdue: { title: 'Tool Return Overdue', messageTemplate: 'Tools issued for {woNumber} are overdue for return' },
  material_approved: { title: 'Material Request Approved', messageTemplate: 'Material request for {woNumber} has been approved' },
  material_issued: { title: 'Materials Issued', messageTemplate: 'Materials for {woNumber} have been issued' },
  completion_submitted: { title: 'WO Completion Submitted', messageTemplate: '{actorName} submitted completion for {woNumber}' },
  rework_requested: { title: 'Rework Requested', messageTemplate: 'Supervisor requested rework on {woNumber}: {details}' },
  supervisor_verified: { title: 'WO Verified', messageTemplate: '{actorName} verified {woNumber}' },
  planner_closed: { title: 'WO Closed', messageTemplate: '{actorName} closed {woNumber}' },
  wo_started: { title: 'WO Started', messageTemplate: '{actorName} started work on {woNumber}' },
  wo_on_hold: { title: 'WO On Hold', messageTemplate: '{actorName} placed {woNumber} on hold: {details}' },
  wo_waiting: { title: 'WO Waiting', messageTemplate: '{woNumber} entered a waiting state: {details}' },
  wo_released: { title: 'WO Released for Execution', messageTemplate: '{actorName} released {woNumber} for execution' },
  wo_resumed: { title: 'WO Resumed', messageTemplate: '{actorName} resumed execution on {woNumber}' },
  shift_handover_pending: { title: 'Shift Handover Pending', messageTemplate: 'Shift handover pending for {woNumber}' },
};

/**
 * Send a structured repair notification. Fire-and-forget with error logging.
 */
export function sendRepairNotification(payload: NotificationPayload): void {
  const template = EVENT_TEMPLATES[payload.event];
  if (!template) {
    console.error(`[repair-notifications] Unknown event type: ${payload.event}`);
    return;
  }

  const rawDetails = payload.details?.reason ?? payload.details?.notes ?? payload.message ?? '';
  const detailsStr = typeof rawDetails === 'string' ? rawDetails : String(rawDetails ?? '');

  const message = template.messageTemplate
    .replace('{woNumber}', payload.woNumber)
    .replace('{actorName}', payload.title || 'A team member')
    .replace('{details}', detailsStr);

  const title = payload.title || template.title;

  notifyUser(
    payload.userId,
    `repair_${payload.event}`,
    title,
    message,
    'work_order',
    payload.woId,
    `wo-detail?id=${payload.woId}`,
    { forceSms: ['rework_requested', 'tool_overdue'].includes(payload.event) },
  ).catch((err) => {
    console.error(`[repair-notifications] Failed to send ${payload.event} to ${payload.userId}:`, err);
  });
}

/**
 * Send repair notification to multiple users.
 */
export function sendRepairNotificationMulti(userIds: string[], payload: Omit<NotificationPayload, 'userId'>): void {
  for (const userId of userIds) {
    sendRepairNotification({ ...payload, userId });
  }
}
