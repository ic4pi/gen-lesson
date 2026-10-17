import type { ModelOption, ProviderId, Tier } from '@/types'

export const PROVIDERS: Record<
  ProviderId,
  { label: string; baseUrl: string; keyUrl: string; hint: string }
> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'One key, hundreds of models. Billed per token.',
  },
  venice: {
    label: 'Venice',
    baseUrl: 'https://api.venice.ai/api/v1',
    keyUrl: 'https://venice.ai/settings/api',
    hint: 'Private inference, home of the uncensored lineup.',
  },
  nvidia: {
    label: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyUrl: 'https://build.nvidia.com',
    hint: 'Free-tier hosted models. Occasionally flaky — test first.',
  },
}

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  flagship: {
    label: 'Flagship',
    blurb: 'Best available — cost is not the concern',
  },
  uncensored: {
    label: 'Uncensored',
    blurb: 'Minimal refusals — occult, fringe, controversial',
  },
  value: {
    label: 'Bang for Buck',
    blurb: 'Delivery quality far above its price',
  },
  budget: {
    label: 'Cheapest Capable',
    blurb: 'Lowest cost that still produces a real course',
  },
}

export const TIER_ORDER: Tier[] = ['flagship', 'uncensored', 'value', 'budget']

export const DEFAULT_MODELS: ModelOption[] = [
  // ── Flagship ──────────────────────────────────────────────
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Long-form structured courses, polished prose',
  },
  {
    id: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Technical, science and engineering material',
  },
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Research-heavy topics, huge context',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 (Venice)',
    provider: 'venice',
    tier: 'flagship',
    bestFor: 'Frontier quality via anonymized proxy — nothing logged',
  },
  {
    id: 'deepseek-v3.2',
    label: 'DeepSeek V3.2 (Venice)',
    provider: 'venice',
    tier: 'flagship',
    bestFor: 'Private reasoning powerhouse',
  },
  // ── Uncensored ────────────────────────────────────────────
  {
    id: 'venice-uncensored-1-2',
    label: 'Venice Uncensored 1.2',
    provider: 'venice',
    tier: 'uncensored',
    bestFor: 'The truly uncensored one — occult, fringe, no refusals. 8K output cap: expect shorter courses',
    maxOut: 8000,
  },
  {
    id: 'qwen3-235b-a22b-thinking-2507',
    label: 'Qwen3 235B Thinking (Venice)',
    provider: 'venice',
    tier: 'uncensored',
    bestFor: 'No policy layer + near-frontier depth — sellable quality on sensitive topics',
  },
  // ── Bang for Buck ─────────────────────────────────────────
  {
    id: 'deepseek/deepseek-chat-v3.1',
    label: 'DeepSeek V3.1',
    provider: 'openrouter',
    tier: 'value',
    bestFor: 'Near-flagship output at a fraction of the cost',
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    tier: 'value',
    bestFor: 'Fast, cheap, surprisingly strong structure',
  },
  {
    id: 'kimi-k2-6',
    label: 'Kimi K2.6 (Venice)',
    provider: 'venice',
    tier: 'value',
    bestFor: 'Strong code structure — interactive HTML is its home turf',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B (NVIDIA)',
    provider: 'nvidia',
    tier: 'value',
    bestFor: 'Free-tier capable generalist',
  },
  // ── Cheapest Capable ──────────────────────────────────────
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat',
    provider: 'openrouter',
    tier: 'budget',
    bestFor: 'Draft-quality courses at bottom-barrel price',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'openrouter',
    tier: 'budget',
    bestFor: 'Cheapest structured output that holds together',
  },
  {
    id: 'google-gemma-4-31b-it',
    label: 'Gemma 4 31B (Venice)',
    provider: 'venice',
    tier: 'budget',
    bestFor: 'Cheapest private option that still holds a course together',
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B (NVIDIA)',
    provider: 'nvidia',
    tier: 'budget',
    bestFor: 'Free tier — test ideas for $0',
  },
]

// ── Designer models: they restyle a finished, working course into a stunning UI ──
// Same shape as the writer list, three tiers.
export const DESIGN_TIER_ORDER: Tier[] = ['flagship', 'value', 'budget']

export const DESIGN_TIER_INFO: Record<string, { label: string; blurb: string }> = {
  flagship: { label: 'Flagship Designers', blurb: 'The best-looking, most inventive UI — cost is not the concern' },
  value: { label: 'Bang for Buck', blurb: 'Strong visual taste and clean CSS at a fraction of the price' },
  budget: { label: 'Cheapest Capable', blurb: 'A solid restyle for pennies; fine for drafts' },
}

export const DESIGNER_MODELS: ModelOption[] = [
  // ── Flagship ──
  {
    id: 'anthropic/claude-opus-4.1',
    label: 'Claude Opus 4.1',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Most refined taste: typography, spacing, restraint, cinematic detail',
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Excellent front-end craft and animation, faster and cheaper than Opus',
  },
  {
    id: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Precise layout and robust CSS; very reliable at keeping the JS intact',
  },
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'openrouter',
    tier: 'flagship',
    bestFor: 'Bold visual ideas and big context for long courses',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 (Venice)',
    provider: 'venice',
    tier: 'flagship',
    bestFor: 'Frontier design quality through the private proxy',
  },
  // ── Bang for Buck ──
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    tier: 'value',
    bestFor: 'Fast, good-looking restyles, huge context',
  },
  {
    id: 'qwen/qwen3-coder',
    label: 'Qwen3 Coder',
    provider: 'openrouter',
    tier: 'value',
    bestFor: 'Clean, disciplined CSS and markup; rarely breaks scripts',
  },
  {
    id: 'deepseek/deepseek-chat-v3.1',
    label: 'DeepSeek V3.1',
    provider: 'openrouter',
    tier: 'value',
    bestFor: 'Near-flagship front-end output for very little',
  },
  {
    id: 'kimi-k2-6',
    label: 'Kimi K2.6 (Venice)',
    provider: 'venice',
    tier: 'value',
    bestFor: 'Strong at interactive HTML and animation code',
  },
  // ── Cheapest Capable ──
  {
    id: 'google/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'openrouter',
    tier: 'budget',
    bestFor: 'Cheapest restyle that still holds the page together',
  },
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat',
    provider: 'openrouter',
    tier: 'budget',
    bestFor: 'Draft-quality restyles at bottom-barrel price',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B (NVIDIA)',
    provider: 'nvidia',
    tier: 'budget',
    bestFor: 'Free tier; modest results, test the pipeline for $0',
  },
]
