import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const login = readFileSync(join(process.cwd(), 'src/components/LoginPage.tsx'), 'utf8');

describe('production login presentation contract', () => {
  it('keeps the temporary demo account selector available', () => {
    expect(login).toContain('Demo Accounts');
    expect(login).toContain('Click to auto-fill credentials');
    expect(login).toContain("user: 'admin'");
    expect(login).toContain("pass: 'admin123'");
    expect(login).toContain("pass: 'password123'");
    expect(login).toContain('showDemo');
  });

  it('does not restore unrelated unsupported presentation claims', () => {
    for (const forbidden of [
      '99.9%',
      '24/7',
      '27001 Certified',
      'iAssetsPro-WO-Workflow-Presentation.pptx',
      'enterprise-grade encryption',
    ]) {
      expect(login).not.toContain(forbidden);
    }
  });

  it('keeps the normal secure login flow', () => {
    expect(login).toContain('Welcome Back');
    expect(login).toContain('Secure role-based access');
    expect(login).toContain('Forgot password?');
  });
});
