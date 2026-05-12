import { getVideoModelMeta } from './video-models';

/**
 * Generic per-tier cost labels.
 * These ranges are intentionally broad — they communicate the order-of-magnitude cost
 * to the Director LLM so it can surface meaningful confirmations to the user.
 * Never hardcode per-model prices here; the source of truth is `cost_hint` in the registry.
 */
const COST_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: '~$0.05',
  medium: '~$0.15',
  high: '~$0.30–$0.60',
};

const FALLBACK_LABEL = '~$0.10';

/**
 * Format a per-scene cost hint string based on the model registry's `cost_hint`.
 *
 * Resolution order:
 * 1. Look up in the video model registry (`getVideoModelMeta`).
 * 2. If not found (e.g. image models, which have no registry entry), return the fallback.
 *
 * Returns a human-readable phrase including "per scene" suffix so the Director LLM
 * can embed it directly in pending-action previews.
 *
 * NOTE: This helper is for video/image media models only. Do NOT call it for
 * LLM/text models (OpenRouter, Sonnet, etc.) — those have no cost_hint in the registry.
 *
 * @param model - Full model ID string (e.g. "bytedance/seedance-2.0/image-to-video")
 * @returns Formatted cost string, e.g. "~$0.30–$0.60 per scene"
 */
export function formatCostHint(model: string): string {
  const meta = getVideoModelMeta(model);
  if (!meta) {
    // Unknown model (e.g. image-gen models that lack a registry entry).
    // Log so operators can add cost_hint to the registry when needed.
    console.warn(`[formatCostHint] model not in registry, using fallback: ${model}`);
    return `${FALLBACK_LABEL} per scene`;
  }
  const label = COST_LABELS[meta.cost_hint];
  return `${label} per scene`;
}
