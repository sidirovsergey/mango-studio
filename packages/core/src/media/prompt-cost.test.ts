import { describe, expect, it } from 'vitest';
import { formatCostHint } from './prompt-cost';

// Model IDs from video-models.ts registry
const SEEDANCE_2_PRO = 'bytedance/seedance-2.0/image-to-video'; // cost_hint: 'high'
const SEEDANCE_LITE = 'fal-ai/bytedance/seedance/v1/lite/image-to-video'; // cost_hint: 'low'
const VEO_3_1 = 'fal-ai/veo3.1/image-to-video'; // cost_hint: 'high'
const KLING_PRO = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'; // cost_hint: 'medium'
const UNKNOWN_MODEL = 'unknown/model/that/doesnt/exist';

describe('formatCostHint', () => {
  it('returns a range string containing "$0.30–$0.60" for high-tier model (Seedance 2.0 Pro)', () => {
    const hint = formatCostHint(SEEDANCE_2_PRO);
    expect(hint).toContain('$0.30');
    expect(hint).toContain('$0.60');
  });

  it('returns a string containing "$0.05" for low-tier model (Seedance Lite)', () => {
    const hint = formatCostHint(SEEDANCE_LITE);
    expect(hint).toContain('$0.05');
  });

  it('returns a high-tier string for Veo 3.1', () => {
    const hint = formatCostHint(VEO_3_1);
    expect(hint).toContain('$0.30');
    expect(hint).toContain('$0.60');
  });

  it('returns a medium-tier string for Kling Pro', () => {
    const hint = formatCostHint(KLING_PRO);
    expect(hint).toContain('$0.15');
  });

  it('returns a sensible fallback for unknown model', () => {
    const hint = formatCostHint(UNKNOWN_MODEL);
    expect(hint).toBeTruthy();
    expect(hint).toContain('$');
  });

  it('always includes "per scene" in the returned string', () => {
    expect(formatCostHint(SEEDANCE_2_PRO)).toContain('per scene');
    expect(formatCostHint(SEEDANCE_LITE)).toContain('per scene');
    expect(formatCostHint(UNKNOWN_MODEL)).toContain('per scene');
  });

  it('uses an en-dash (U+2013) in the high-tier range', () => {
    const hint = formatCostHint(SEEDANCE_2_PRO);
    // U+2013 is the en-dash character –
    expect(hint).toContain('–');
  });
});
