import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/AIConfigPage.tsx', 'utf8');
const client = fs.readFileSync('src/lib/ai-client.ts', 'utf8');
const configRoute = fs.readFileSync('src/app/api/ai/config/route.ts', 'utf8');
const connectionTest = fs.readFileSync('src/app/api/ai/config/test/route.ts', 'utf8');
const imageTest = fs.readFileSync('src/app/api/ai/config/test-image/route.ts', 'utf8');

describe('Z.ai production provider configuration', () => {
  it('exposes Z.ai API separately from the sandbox SDK', () => {
    expect(page).toContain("id: 'zai-api'");
    expect(page).toContain("'zai-api': ['glm-5.3'");
    expect(page).toContain("'zai-api': ['glm-image']");
    expect(configRoute).toContain("'zai-api'");
  });

  it('uses the general Z.ai base for chat and image generation', () => {
    expect(client).toContain('https://api.z.ai/api/paas/v4/chat/completions');
    expect(client).toContain('https://api.z.ai/api/paas/v4/images/generations');
    expect(connectionTest).toContain("base + '/chat/completions'");
    expect(imageTest).toContain("base + '/images/generations'");
  });

  it('does not log API key fragments during save or runtime resolution', () => {
    expect(configRoute).not.toContain('llmApiKeyStartsWith');
    expect(client).not.toContain('keyMaskedPreview');
  });

  it('lays out 3D provider cards with controls above descriptive text', () => {
    expect(page).toContain('flex w-full items-center justify-between gap-3');
    expect(page).toContain('flex flex-col gap-2.5 rounded-lg border-2');
  });
});