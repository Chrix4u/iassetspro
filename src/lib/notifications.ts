import { db } from '@/lib/db';
import { enqueueNotificationEmail } from '@/lib/notification-email-queue';
import { wsNotify } from '@/lib/ws-notify';

// ============================================================================
// Types
// ============================================================================

interface NotificationPreferences {
  channels?: {
    inApp?: boolean;
    email?: boolean;
    emailAddr?: string;
    sms?: boolean;
    phone?: string;
  };
  quietHours?: {
    enabled?: boolean;
    start?: string;
    end?: string;
    timezone?: string;
  };
  types?: {
    woAssigned?: boolean;
    woStatusChange?: boolean;
    mrApprovedRejected?: boolean;
    pmDue?: boolean;
    lowStockAlert?: boolean;
    assetConditionAlert?: boolean;
    systemNotifications?: boolean;
    safetyAlerts?: boolean;
    qualityAlerts?: boolean;
  };
}

interface UserNotificationProfile {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  notificationPreferences: NotificationPreferences | null;
}

// Map notification types to preference keys for opt-out control. `types` is an
// optional preference group, so strip `undefined` before taking keyof.
const TYPE_TO_PREF_KEY: Record<string, keyof NonNullable<NotificationPreferences['types']>> = {
  wo_assigned: 'woAssigned',
  wo_started: 'woStatusChange',
  wo_completed: 'woStatusChange',
  wo_closed: 'woStatusChange',
  wo_on_hold: 'woStatusChange',
  wo_cancelled: 'woStatusChange',
  wo_approved: 'woStatusChange',
  wo_rework: 'woStatusChange',
  mr_assigned: 'mrApprovedRejected',
  mr_approved: 'mrApprovedRejected',
  mr_rejected: 'mrApprovedRejected',
  mr_cancelled: 'mrApprovedRejected',
  mr_converted: 'mrApprovedRejected',
  pm_due: 'pmDue',
  pm_overdue: 'pmDue',
  low_stock_alert: 'lowStockAlert',
  asset_condition: 'assetConditionAlert',
  safety_incident: 'safetyAlerts',
  safety_alert: 'safetyAlerts',
  quality_ncr: 'qualityAlerts',
  quality_inspection: 'qualityAlerts',
  quality_audit: 'qualityAlerts',
  escalation_l1: 'woStatusChange',
  escalation_l2: 'woStatusChange',
};

const URGENT_TYPES = new Set([
  'safety_incident',
  'safety_alert',
  'escalation_l2',
]);

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}) {
  try {
    return await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        actionUrl: params.actionUrl || null,
      },
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

function isQuietHours(prefs: NotificationPreferences | null): boolean {
  if (!prefs?.quietHours?.enabled) return false;

  const now = new Date();
  const startParts = (prefs.quietHours.start || '22:00').split(':');
  const endParts = (prefs.quietHours.end || '07:00').split(':');

  const startHour = parseInt(startParts[0], 10);
  const startMin = parseInt(startParts[1], 10);
  const endHour = parseInt(endParts[0], 10);
  const endMin = parseInt(endParts[1], 10);

  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function isTypeEnabled(prefs: NotificationPreferences | null, type: string): boolean {
  if (!prefs?.types) return true;
  const prefKey = TYPE_TO_PREF_KEY[type];
  if (!prefKey) return true;
  return prefs.types[prefKey] !== false;
}

async function sendNotificationSms(phone: string, title: string, message: string, actionUrl?: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    const { sendSms } = await import('@/lib/sms');
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
    let smsContent = `[iAssetsPro] ${title}\n${message}`;
    if (actionUrl && appUrl) {
      const fullLink = `${appUrl}/#/${actionUrl.replace(/^\//, '')}`;
      smsContent += `\n\nView: ${fullLink}`;
    }
    smsContent = smsContent.substring(0, 500);
    const result = await sendSms(phone, smsContent);
    return { success: result.success, error: result.error };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown SMS error';
    console.error('[SMS] Failed to send notification:', err);
    return { success: false, error: errorMsg };
  }
}

export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  actionUrl?: string,
  options?: {
    forceSms?: boolean;
    forceEmail?: boolean;
    skipQuietHours?: boolean;
  },
) {
  const notification = await createNotification({
    userId,
    type,
    title,
    message,
    entityType,
    entityId,
    actionUrl,
  });

  wsNotify(userId, 'notification', {
    type,
    title,
    message,
    entityType,
    entityId,
    actionUrl,
  }).catch(() => {});

  // External channels are deliberately detached from the lifecycle mutation.
  // In-app persistence above remains the authoritative notification record;
  // email is durably queued and SMS retains its existing best-effort dispatch.
  setImmediate(async () => {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          notificationPreferences: true,
        },
      });

      if (!user) {
        console.warn(`[Notification] User ${userId} not found for email/SMS dispatch`);
        return;
      }

      const prefs = (user.notificationPreferences as NotificationPreferences) || null;

      if (!isTypeEnabled(prefs, type)) {
        console.log(`[Notification] User ${userId} opted out of type "${type}"`);
        return;
      }

      const isUrgent = URGENT_TYPES.has(type);
      if (!options?.skipQuietHours && !isUrgent && isQuietHours(prefs)) {
        console.log(`[Notification] Quiet hours active for user ${userId}, skipping email/SMS`);
        return;
      }

      const emailEnabled = options?.forceEmail || prefs?.channels?.email !== false;
      const targetEmail = prefs?.channels?.emailAddr?.trim() || user.email;
      if (emailEnabled && targetEmail) {
        try {
          await enqueueNotificationEmail({
            notificationId: notification?.id,
            userId,
            type,
            title,
            message,
            actionUrl,
            targetEmail,
          });
        } catch (err) {
          // Never fall back to synchronous SMTP here. Queue unavailability must
          // be visible, but it must not recouple lifecycle writes to email I/O.
          console.error('[Email] Failed to queue notification delivery:', err);
        }
      }

      const phone = prefs?.channels?.phone || user.phone;
      const userOptedOut = prefs?.channels?.sms === false;
      const smsEnabled = !!phone && !userOptedOut;

      if (smsEnabled) {
        if (!phone) {
          console.warn(`[SMS] SKIPPED for user ${userId} (${user.fullName}): No phone number found. User.phone="${user.phone || 'null'}", Prefs.phone="${prefs?.channels?.phone || 'not set'}". Set phone in user profile or notification preferences.`);
        } else {
          console.log(`[SMS] Dispatching to ${phone} for user ${userId} (${user.fullName}) — type: ${type}, forceSms: ${!!options?.forceSms}`);
          const result = await sendNotificationSms(phone, title, message, actionUrl);
          console.log(`[SMS] Result for ${phone}: ${JSON.stringify(result)}`);
        }
      } else {
        console.log(`[SMS] User opted out for user ${userId} (${user.fullName})`);
      }
    } catch (err) {
      console.error('[Notification] Failed to dispatch email/SMS:', err);
    }
  });

  return notification;
}

export async function notifyMultipleUsers(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  actionUrl?: string,
  options?: Parameters<typeof notifyUser>[7],
) {
  const promises = userIds.map(userId =>
    notifyUser(userId, type, title, message, entityType, entityId, actionUrl, options)
  );
  await Promise.allSettled(promises);
}

export async function notifyAdmins(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  actionUrl?: string,
  options?: Parameters<typeof notifyUser>[7],
) {
  try {
    const admins = await db.user.findMany({
      where: {
        status: 'active',
        userRoles: {
          some: {
            role: {
              slug: 'admin',
            },
          },
        },
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await notifyMultipleUsers(
      admins.map(a => a.id),
      type,
      title,
      message,
      entityType,
      entityId,
      actionUrl,
      options,
    );
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err);
  }
}

export async function notifyDepartmentSupervisor(
  departmentId: string,
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  actionUrl?: string,
  options?: Parameters<typeof notifyUser>[7],
) {
  try {
    const dept = await db.department.findUnique({
      where: { id: departmentId },
      select: { supervisorId: true },
    });
    if (dept?.supervisorId) {
      await notifyUser(dept.supervisorId, type, title, message, entityType, entityId, actionUrl, options);
    }
  } catch (err) {
    console.error('[Notification] Failed to notify department supervisor:', err);
  }
}
