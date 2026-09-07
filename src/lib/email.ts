import nodemailer from 'nodemailer';

// Create transporter lazily. SMTP is an optional delivery channel: it is only
// enabled when SMTP_HOST is explicitly configured. This prevents production,
// CI, and UAT processes from silently attempting localhost:587.
let transporter: nodemailer.Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeEmailHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface NotificationEmailTemplateInput {
  appName: string;
  appUrl: string;
  fullName: string;
  subject: string;
  message: string;
  actionUrl?: string;
}

/**
 * Render a notification email using escaped text/attribute values only.
 * Notification subjects and messages can contain user-authored work-order
 * content, so they must never be interpolated into HTML as trusted markup.
 */
export function buildNotificationEmailHtml({
  appName,
  appUrl,
  fullName,
  subject,
  message,
  actionUrl,
}: NotificationEmailTemplateInput): string {
  const safeAppName = escapeEmailHtml(appName);
  const safeFullName = escapeEmailHtml(fullName);
  const safeSubject = escapeEmailHtml(subject);
  const safeMessage = escapeEmailHtml(message).replace(/\r?\n/g, '<br>');
  const actionHref = actionUrl
    ? `${appUrl.replace(/\/$/, '')}/#/${actionUrl.replace(/^\/+/, '')}`
    : '';
  const actionLink = actionHref
    ? `\n\n<a href="${escapeEmailHtml(actionHref)}" style="background:#059669;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">View Details</a>`
    : '';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="background:#059669;padding:20px;border-radius:8px 8px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">${safeAppName}</h1>
      </div>
      <div style="padding:24px;">
        <h2 style="margin-top:0;color:#111827;">${safeSubject}</h2>
        <p style="color:#374151;line-height:1.6;">Hello ${safeFullName},</p>
        <p style="color:#374151;line-height:1.6;">${safeMessage}</p>
        ${actionLink}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#6b7280;font-size:12px;">This is an automated notification from ${safeAppName}. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

function getTransporter(): nodemailer.Transporter {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP_HOST is not configured');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
  }
  return transporter;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  if (!isSmtpConfigured()) return false;

  try {
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'iAssetsPro EAM';
    const companyEmail = process.env.SMTP_FROM
      || `${appName} <noreply@localhost>`;

    const t = getTransporter();
    await t.sendMail({
      from: companyEmail,
      to,
      subject: normalizeEmailHeader(subject),
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return false;
  }
}

// Send notification email to a user. The optional target address lets the
// notification preference layer select an alternate address without sending a
// duplicate copy to the profile email first.
export async function sendNotificationEmail(
  userId: string,
  subject: string,
  message: string,
  actionUrl?: string,
  targetEmail?: string,
): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, fullName: true },
  });
  const recipient = targetEmail?.trim() || user?.email;
  if (!user || !recipient) return false;

  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'iAssetsPro EAM';
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const normalizedAppName = normalizeEmailHeader(appName);
  const normalizedSubject = normalizeEmailHeader(subject);
  const html = buildNotificationEmailHtml({
    appName: normalizedAppName,
    appUrl,
    fullName: user.fullName,
    subject: normalizedSubject,
    message,
    actionUrl,
  });
  const actionHref = actionUrl
    ? `${appUrl.replace(/\/$/, '')}/#/${actionUrl.replace(/^\/+/, '')}`
    : '';
  const text = [
    `Hello ${user.fullName},`,
    '',
    message,
    ...(actionHref ? ['', `View details: ${actionHref}`] : []),
    '',
    `This is an automated notification from ${normalizedAppName}. Please do not reply to this email.`,
  ].join('\n');

  return sendEmail({
    to: recipient,
    subject: `[${normalizedAppName}] ${normalizedSubject}`,
    html,
    text,
  });
}

// Test SMTP connection
export async function testSmtpConnection(): Promise<boolean> {
  if (!isSmtpConfigured()) return false;

  try {
    const t = getTransporter();
    await t.verify();
    return true;
  } catch {
    return false;
  }
}
