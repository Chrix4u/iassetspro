import { describe, expect, it } from 'vitest';

import {
  buildNotificationEmailHtml,
  escapeEmailHtml,
  normalizeEmailHeader,
} from '@/lib/email';

describe('notification email content safety', () => {
  it('escapes HTML-significant characters in dynamic notification text', () => {
    expect(escapeEmailHtml(`<script>alert("x")</script> Tom & Jerry's`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Tom &amp; Jerry&#39;s',
    );
  });

  it('renders user-authored content as text instead of executable email markup', () => {
    const html = buildNotificationEmailHtml({
      appName: 'iAssetsPro <Admin>',
      appUrl: 'https://eam.example.com',
      fullName: '<img src=x onerror=alert(1)>',
      subject: 'WO <script>alert(1)</script>',
      message: 'Bearing failed <svg onload=alert(1)>\nUse A&B',
      actionUrl: 'wo-detail?id=wo-1&note="quoted"',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload=');
    expect(html).toContain('iAssetsPro &lt;Admin&gt;');
    expect(html).toContain('WO &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Bearing failed &lt;svg onload=alert(1)&gt;<br>Use A&amp;B');
    expect(html).toContain(
      'href="https://eam.example.com/#/wo-detail?id=wo-1&amp;note=&quot;quoted&quot;"',
    );
  });

  it('normalizes CR/LF and repeated whitespace out of email header values', () => {
    expect(normalizeEmailHeader('WO Started\r\nBcc: attacker@example.com   now')).toBe(
      'WO Started Bcc: attacker@example.com now',
    );
  });

  it('keeps a relative action link safely inside the configured application URL', () => {
    const html = buildNotificationEmailHtml({
      appName: 'iAssetsPro EAM',
      appUrl: 'https://eam.example.com/',
      fullName: 'Technician',
      subject: 'WO Started',
      message: 'Work started',
      actionUrl: '/wo-detail?id=wo-1&return=<dashboard>',
    });

    expect(html).toContain(
      'href="https://eam.example.com/#/wo-detail?id=wo-1&amp;return=&lt;dashboard&gt;"',
    );
  });
});
