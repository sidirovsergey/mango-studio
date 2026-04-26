export type Tier = 'economy' | 'premium';

export const TIERS: readonly Tier[] = ['economy', 'premium'] as const;

export function isTier(value: unknown): value is Tier {
  return value === 'economy' || value === 'premium';
}
