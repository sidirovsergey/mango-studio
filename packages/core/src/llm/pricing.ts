import 'server-only';

interface OpenRouterModelEntry {
  id: string;
  pricing: { prompt: string; completion: string };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModelEntry[];
}

const ONE_HOUR_MS = 60 * 60 * 1000;

let cache: { fetchedAt: number; byId: Map<string, OpenRouterModelEntry> } | null = null;

async function fetchPricing(): Promise<Map<string, OpenRouterModelEntry>> {
  if (cache && Date.now() - cache.fetchedAt < ONE_HOUR_MS) {
    return cache.byId;
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`OpenRouter pricing API: ${res.status}`);
    const json = (await res.json()) as OpenRouterModelsResponse;
    const byId = new Map<string, OpenRouterModelEntry>();
    for (const m of json.data) byId.set(m.id, m);
    cache = { fetchedAt: Date.now(), byId };
    return byId;
  } catch (err) {
    console.warn('[pricing] failed to fetch OpenRouter pricing, returning 0 cost:', err);
    return cache?.byId ?? new Map();
  }
}

export async function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  const byId = await fetchPricing();
  const entry = byId.get(modelId);
  if (!entry) return 0;
  const promptPrice = Number.parseFloat(entry.pricing.prompt);
  const completionPrice = Number.parseFloat(entry.pricing.completion);
  if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice)) return 0;
  return promptTokens * promptPrice + completionTokens * completionPrice;
}

export function __resetPricingCacheForTests(): void {
  cache = null;
}
