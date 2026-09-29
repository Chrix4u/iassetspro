import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const aiClient = fs.readFileSync('src/lib/ai-client.ts', 'utf8');
const imageTestRoute = fs.readFileSync('src/app/api/ai/config/test-image/route.ts', 'utf8');
const visualRoute = fs.readFileSync('src/app/api/component-visuals/generate/route.ts', 'utf8');

describe('Z.ai realistic image generation fallback', () => {
  it('defaults Z.ai image generation to GLM-Image instead of an OpenAI model', () => {
    expect(aiClient).toContain("'zai-api': 'glm-image'");
    expect(aiClient).toContain("openai: 'dall-e-3'");
    expect(aiClient).not.toContain("const model = config.imageModel || 'dall-e-3'");
  });

  it('keeps the image-test endpoint aligned with the production fallback', () => {
    expect(imageTestRoute).toContain("provider === 'zai-api' ? 'glm-image' : 'dall-e-3'");
  });

  it('routes AI Realistic component visuals through the shared image client', () => {
    expect(visualRoute).toContain('aiImageGeneration');
    expect(visualRoute).toContain("visualType || 'ai_realistic'");
  });
});
