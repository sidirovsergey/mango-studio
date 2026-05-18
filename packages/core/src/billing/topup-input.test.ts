import { describe, expect, it } from 'vitest';
import {
  TOPUP_PACKAGE_KOPEKS,
  TopupInputSchema,
  TopupIntentSchema,
  TopupPackageCodeSchema,
} from './topup-input';

describe('TopupInputSchema', () => {
  it('accepts legacy v1.7.0 input (package_code only)', () => {
    const parsed = TopupInputSchema.parse({ package_code: 'topup_2000' });
    expect(parsed.package_code).toBe('topup_2000');
    expect(parsed.intent).toEqual({ kind: 'topup_only' });
  });

  it('accepts render intent with project_id + return_to', () => {
    const parsed = TopupInputSchema.parse({
      package_code: 'topup_5000',
      intent: {
        kind: 'render',
        project_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        return_to: '/p/abc123',
      },
    });
    expect(parsed.intent.kind).toBe('render');
  });

  it('accepts studio intent', () => {
    const parsed = TopupInputSchema.parse({
      package_code: 'topup_10000',
      intent: {
        kind: 'studio',
        project_id: 'f1e2d3c4-b5a6-4d7e-9f8a-1b2c3d4e5f6a',
        return_to: '/p/xyz789/studio',
      },
    });
    expect(parsed.intent.kind).toBe('studio');
  });

  it('rejects unknown package_code', () => {
    expect(() => TopupInputSchema.parse({ package_code: 'topup_99' })).toThrow();
  });

  it('rejects absolute return_to URLs (open-redirect defense)', () => {
    expect(() =>
      TopupInputSchema.parse({
        package_code: 'topup_2000',
        intent: {
          kind: 'render',
          project_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          return_to: 'https://attacker.example/phish',
        },
      }),
    ).toThrow();
  });

  it('rejects protocol-relative return_to', () => {
    expect(() =>
      TopupInputSchema.parse({
        package_code: 'topup_2000',
        intent: {
          kind: 'render',
          project_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          return_to: '//attacker.example/phish',
        },
      }),
    ).toThrow();
  });

  it('rejects non-uuid project_id', () => {
    expect(() =>
      TopupInputSchema.parse({
        package_code: 'topup_2000',
        intent: {
          kind: 'render',
          project_id: 'not-a-uuid',
          return_to: '/p/abc',
        },
      }),
    ).toThrow();
  });

  it('topup_only intent does not require project_id or return_to', () => {
    expect(() => TopupIntentSchema.parse({ kind: 'topup_only' })).not.toThrow();
  });

  it('render/studio intent require project_id + return_to', () => {
    expect(() => TopupIntentSchema.parse({ kind: 'render' })).toThrow();
    expect(() =>
      TopupIntentSchema.parse({
        kind: 'render',
        project_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      }),
    ).toThrow();
  });

  it('TOPUP_PACKAGE_KOPEKS values match package codes', () => {
    expect(TOPUP_PACKAGE_KOPEKS.topup_2000).toBe(200_000);
    expect(TOPUP_PACKAGE_KOPEKS.topup_5000).toBe(500_000);
    expect(TOPUP_PACKAGE_KOPEKS.topup_10000).toBe(1_000_000);
  });

  it('TopupPackageCodeSchema enumerates exactly 3 packages', () => {
    expect(TopupPackageCodeSchema.options).toEqual(['topup_2000', 'topup_5000', 'topup_10000']);
  });
});
