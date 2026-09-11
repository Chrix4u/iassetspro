import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const login = readFileSync(join(process.cwd(), 'src/components/LoginPage.tsx'), 'utf8');

describe('production login presentation safety', () => {
  it('does not expose demo credentials or unsupported presentation claims', () => {
    for (const forbidden of [
      'Demo Accounts',
      'admin123',
      'password123',
      '99.9%',
      '24/7',
      '27001 Certified',
      'iAssetsPro-WO-Workflow-Presentation.pptx',
      'showDemo',
      'enterprise-grade encryption',
    ]) {
      expect(login).not.toContain(forbidden);
    }
  });

  it('keeps a concise secure production login', () => {
    expect(login).toContain('Welcome Back');
    expect(login).toContain('Secure role-based access');
    expect(login).toContain('Forgot password?');
  });
});
