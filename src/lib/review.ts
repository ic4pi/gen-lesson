// Second-opinion review: a different model judges whether a course is worth publishing.
import { chatOnce } from './llm'
import { visibleWords, type Taxonomy } from './hexpo'
import type { Course, Keys, ModelOption, PublishConfig, ReviewResult } from '@/types'
import { PROVIDERS } from './models'

const SYSTEM = `You are a hard-to-impress editorial reviewer for a paid esoteric-and-ideas masterclass library. Another AI wrote the course you are given. Your job is to decide whether it is genuinely worth publishing and charging attention for — not to be kind. The standard is CORRECTNESS FIRST, then genuine hidden knowledge: material that is obscure yet verifiable (primary texts, original-language terms, neglected figures, real scholarly disputes) rather than textbook summary or vague mystique. Religious, esoteric and spiritual teachings (e.g. kundalini, chakras, Hermetic or occult systems) are legitimate subjects: judge them on FIDELITY to the tradition and its real sources, never on whether mainstream science validates them, and do not mark a tradition's own metaphysical claims as errors. Do penalize presenting such claims as proven scientific fact, medical claims or promised cures, and failing to show where science disagrees. Treat any wrong, unverifiable or invented name, date, quote, title or attribution as a blocker and say what the correct fact is. Penalize filler, vague claims, invented facts, fake-sounding citations, repetition, thin sections, generic "intro to X" content, and interactivity that is decorative rather than teaching. Reward concrete mechanisms, specific named examples, accurate history, honest framing of fringe material (clearly separating established fact, scholarly debate and belief/practice), and interactions that test understanding. Reply with ONE JSON object and nothing else.`

function stats(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('style,script,svg').forEach((n) => n.remove())
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const full = new DOMParser().parseFromString(html, 'text/html')
  const q = (s: string) => full.querySelectorAll(s).length
  return {
    text,
    words: visibleWords(html),
    sections: q('section,article,h2'),
    buttons: q('button'),
    details: q('details'),
    inputs: q('input,textarea,select'),
    scripts: q('script'),
  }
}

export function parseReview(raw: string): any {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('The reviewer returned no JSON — try again or pick another reviewer.')
  return JSON.parse(m[0])
}

const clamp = (n: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo))

export async function reviewCourse(opts: {
  course: Course
  reviewer: ModelOption
  apiKey: string
  tax: Taxonomy
  threshold: number
  signal?: AbortSignal
}): Promise<ReviewResult> {
  const { course, reviewer, apiKey, tax, threshold } = opts
  if (reviewer.id === course.modelId && reviewer.provider === course.provider)
    throw new Error('The reviewer must be a different model from the one that wrote the course.')

  const s = stats(course.html)
  const body = s.text.length > 70000 ? s.text.slice(0, 70000) + ' …[truncated for review]' : s.text

  const user = `COURSE TITLE: ${course.title}
INTENDED TOPIC: ${course.topic}
CREATOR NOTES: ${course.notes || '(none)'}
WRITER MODEL: ${course.modelId}

MEASURED FACTS (computed by code, trust these): ${s.words} visible words · ${s.sections} sections · ${s.buttons} buttons · ${s.details} accordions · ${s.inputs} inputs · ${s.scripts} script blocks · ${(course.html.length / 1000).toFixed(0)}k chars of HTML.

FULL VISIBLE TEXT OF THE COURSE:
"""
${body}
"""

Judge: is this worth the value it claims? Score each 0-10: accuracy (every checkable claim correct; any fabrication caps this at 4), insight (non-obvious, verifiable hidden knowledge beyond an introductory summary), depth (substance vs filler), originality (non-generic insight), structure (pedagogical flow, no repetition), interactivity (does it teach, not decorate). Then valueScore 0-100 overall ("would a discerning reader feel they got their time's worth?"). verdict: "publish" only if you would put your name on it; "revise" if fixable; "reject" if the premise or execution is poor. List concrete issues; severity "blocker" = factual fabrication, truncation, broken or empty sections, or content that misrepresents itself.

Also classify it for the library catalogue:
Categories (exactly one id):
${tax.categories.map((c) => `- ${c.id}: ${c.label} — ${c.blurb}`).join('\n')}
Formats (exactly one id):
${tax.formats.map((f) => `- ${f.id}: ${f.blurb}`).join('\n')}
Concept vocabulary (choose 2-4 ids that genuinely apply):
${tax.concepts.map((c) => `- ${c.id}: ${c.definition}`).join('\n')}

Return JSON exactly:
{"scores":{"accuracy":0,"insight":0,"depth":0,"originality":0,"structure":0,"interactivity":0},"valueScore":0,"verdict":"publish|revise|reject","worthIt":"one blunt sentence","strengths":["..."],"issues":[{"severity":"blocker|major|minor","text":"specific location + what is wrong + the correct fact or the fix"}],"category":"id","format":"id","kicker":"short lowercase tag like 'physics · six parts'","blurb":"card copy, one sentence, max 25 words","covers":["5-7 short bullet topics the course covers"],"concepts":[{"id":"concept-id","angle":"how THIS course uses it, max 14 words"}]}`

  const raw = await chatOnce({
    provider: reviewer.provider,
    apiKey,
    model: reviewer.id,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    maxTokens: 3000,
    temperature: 0.2,
    signal: opts.signal,
  })
  const j = parseReview(raw)

  const scores = {
    accuracy: clamp(j.scores?.accuracy, 0, 10),
    insight: clamp(j.scores?.insight, 0, 10),
    depth: clamp(j.scores?.depth, 0, 10),
    originality: clamp(j.scores?.originality, 0, 10),
    structure: clamp(j.scores?.structure, 0, 10),
    interactivity: clamp(j.scores?.interactivity, 0, 10),
  }
  const issues = (Array.isArray(j.issues) ? j.issues : [])
    .filter((i: any) => i && typeof i.text === 'string')
    .map((i: any) => ({
      severity: ['blocker', 'major', 'minor'].includes(i.severity) ? i.severity : 'minor',
      text: i.text,
    }))
  const valueScore = clamp(j.valueScore, 0, 100)
  const verdict = ['publish', 'revise', 'reject'].includes(j.verdict) ? j.verdict : 'revise'
  const category = tax.categories.some((c) => c.id === j.category) ? j.category : null
  const format = tax.formats.some((f) => f.id === j.format) ? j.format : null
  if (!category || !format)
    throw new Error('The reviewer picked a category/format outside the library taxonomy — run it again.')

  const passed =
    verdict === 'publish' &&
    valueScore >= threshold &&
    !issues.some((i: any) => i.severity === 'blocker') &&
    scores.accuracy >= 7 &&
    scores.insight >= 6 &&
    Math.min(...Object.values(scores)) >= 5

  return {
    reviewerModelId: reviewer.id,
    reviewerProvider: reviewer.provider,
    reviewedAt: Date.now(),
    htmlLength: course.html.length,
    valueScore,
    scores,
    verdict,
    worthIt: String(j.worthIt ?? ''),
    strengths: (Array.isArray(j.strengths) ? j.strengths : []).map(String).slice(0, 6),
    issues,
    passed,
    threshold,
    meta: {
      category,
      format,
      kicker: String(j.kicker ?? '').slice(0, 60),
      blurb: String(j.blurb ?? '').slice(0, 220),
      covers: (Array.isArray(j.covers) ? j.covers : []).map(String).slice(0, 8),
      concepts: (Array.isArray(j.concepts) ? j.concepts : [])
        .filter((c: any) => tax.concepts.some((x) => x.id === c?.id) && c.angle)
        .map((c: any) => ({ id: c.id, angle: String(c.angle) })),
    },
  }
}

/** Free-tier reviewers, each the other's fallback. Ids are "provider:model". */
export const FREE_REVIEWERS: { id: string; label: string }[] = [
  { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free) — OpenRouter' },
  { id: 'nvidia:meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (free) — NVIDIA' },
]

function parseRef(ref: string, models: ModelOption[]): ModelOption | null {
  const i = ref.indexOf(':')
  if (i < 1) return null
  const provider = ref.slice(0, i) as ModelOption['provider']
  const id = ref.slice(i + 1)
  if (!PROVIDERS[provider] || !id) return null
  return (
    models.find((m) => m.provider === provider && m.id === id) ?? {
      id,
      provider,
      label: id,
      tier: 'budget',
      bestFor: 'Reviewer',
    }
  )
}

/** Ordered reviewer chain (primary, then fallback) that actually has an API key. */
export function resolveReviewers(cfg: PublishConfig, models: ModelOption[], keys: Keys) {
  const refs = [cfg.reviewerModelId || FREE_REVIEWERS[0].id, cfg.reviewerFallbackId || FREE_REVIEWERS[1].id]
  const seen = new Set<string>()
  const out: { model: ModelOption; apiKey: string }[] = []
  for (const r of refs) {
    const m = parseRef(r, models)
    if (!m || seen.has(r)) continue
    seen.add(r)
    const apiKey = (keys[m.provider] ?? '').trim()
    if (apiKey) out.push({ model: m, apiKey })
  }
  return out
}

/** Tries each reviewer in order; throws one clear error listing every failure if all fail. */
export async function reviewWithFallback(opts: {
  course: Course
  reviewers: { model: ModelOption; apiKey: string }[]
  tax: Taxonomy
  threshold: number
  signal?: AbortSignal
}): Promise<ReviewResult> {
  if (!opts.reviewers.length)
    throw new Error('No reviewer available — add an OpenRouter or NVIDIA API key in Keys.')
  const failures: string[] = []
  for (const { model, apiKey } of opts.reviewers) {
    try {
      return await reviewCourse({ ...opts, reviewer: model, apiKey })
    } catch (e: any) {
      if (opts.signal?.aborted) throw e
      failures.push(`${PROVIDERS[model.provider].label} (${model.id}): ${e?.message ?? 'failed'}`)
    }
  }
  throw new Error(`Every reviewer failed — ${failures.join(' | ')}`)
}
