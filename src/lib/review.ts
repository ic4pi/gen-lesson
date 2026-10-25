// Second-opinion review: a different model judges whether a course is worth publishing.
import { chatOnce } from './llm'
import { visibleWords, type Taxonomy } from './hexpo'
import type { Course, Keys, ModelOption, PublishConfig, ReviewResult } from '@/types'
import { PROVIDERS } from './models'

const SYSTEM = `You are a meticulous fact-checker for a masterclass library on esoteric, spiritual and ideas topics. Another AI wrote the course you are given. You judge ONE thing: is what it states TRUE and fairly framed. Check every name, date, title, quote, attribution, number and historical or scholarly claim you can. Treat any wrong, unverifiable or invented name, date, quote, title, source or attribution as a blocker and give the correct fact. Religious, esoteric and spiritual teachings (kundalini, chakras, Hermetic or occult systems, etc.) are legitimate subjects: judge them on FIDELITY to the tradition and its real sources, never on whether mainstream science validates them, and do not mark a tradition's own metaphysical claims as errors. Do flag: presenting such claims as proven scientific fact, medical claims or promised cures, and fake-sounding citations. Do NOT grade writing style, design, depth or originality. Reply with ONE JSON object and nothing else.`


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
  timeoutMs?: number
}): Promise<ReviewResult> {
  const { course, reviewer, apiKey, tax } = opts
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

Fact-check this course. accuracy 0-10 (10 = every checkable claim correct and fairly framed; any fabricated or wrong name, date, quote or source caps this at 4). verdict: "publish" if there are no factual blockers, "revise" if fixable errors exist, "reject" if the premise is unsound. List each concrete problem with severity "blocker" (fabricated or wrong fact, misattributed quote, truncation or broken sections) or "major"/"minor" (misleading framing, missing caveat), stating the location, what is wrong, and the correct fact.

Also classify it for the library catalogue:
Categories (exactly one id):
${tax.categories.map((c) => `- ${c.id}: ${c.label} — ${c.blurb}`).join('\n')}
Formats (exactly one id):
${tax.formats.map((f) => `- ${f.id}: ${f.blurb}`).join('\n')}
Concept vocabulary (choose 2-4 ids that genuinely apply):
${tax.concepts.map((c) => `- ${c.id}: ${c.definition}`).join('\n')}

Return JSON exactly:
{"accuracy":0,"verdict":"publish|revise|reject","worthIt":"one sentence: is it factually sound","strengths":["..."],"issues":[{"severity":"blocker|major|minor","text":"specific location + what is wrong + the correct fact or the fix"}],"category":"id","format":"id","kicker":"short lowercase tag like 'physics · six parts'","blurb":"card copy, one sentence, max 25 words","covers":["5-7 short bullet topics the course covers"],"concepts":[{"id":"concept-id","angle":"how THIS course uses it, max 14 words"}]}`

  const raw = await chatOnce({
    provider: reviewer.provider,
    apiKey,
    model: reviewer.id,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    maxTokens: 2500,
    temperature: 0.2,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  })
  const j = parseReview(raw)

  const accuracy = clamp(j.accuracy ?? j.scores?.accuracy, 0, 10)
  // fact-check only: the other score slots mirror accuracy so the UI shows one honest number
  const scores = { accuracy, insight: accuracy, depth: accuracy, originality: accuracy, structure: accuracy, interactivity: accuracy }
  const issues = (Array.isArray(j.issues) ? j.issues : [])
    .filter((i: any) => i && typeof i.text === 'string')
    .map((i: any) => ({
      severity: ['blocker', 'major', 'minor'].includes(i.severity) ? i.severity : 'minor',
      text: i.text,
    }))
  const valueScore = Math.round(accuracy * 10)
  const verdict = ['publish', 'revise', 'reject'].includes(j.verdict) ? j.verdict : 'revise'
  const category = tax.categories.some((c) => c.id === j.category) ? j.category : null
  const format = tax.formats.some((f) => f.id === j.format) ? j.format : null
  if (!category || !format)
    throw new Error('The reviewer picked a category/format outside the library taxonomy — run it again.')

  const passed = verdict === 'publish' && !issues.some((i: any) => i.severity === 'blocker') && accuracy >= 7

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
    threshold: 70,
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

type Candidate = { model: ModelOption; apiKey: string }

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

// ── live discovery of free reviewer models (hardcoded ids go stale: 404/410) ──
const NOT_CHAT = /embed|rerank|guard|safety|reward|vision|\bvl\b|-vl-|clip|ocr|parse|retriev|whisper|tts|image|diffusion|moderat|audio|speech|translate|paligemma|deplot|kosmos|neva|fuyu|vila|cosmos|riva|sdxl|stable|flux|bge|nemoguard|lyria|veo/i

function rank(id: string): number {
  const sizes = [...id.matchAll(/(\d+(?:\.\d+)?)b\b/gi)].map((m) => Number(m[1]))
  const size = sizes.length ? Math.max(...sizes) : 0
  // 30-130B models review well without being slow or heavily rate-limited
  const base = size >= 30 && size <= 130 ? 500 + size : size
  return base + (/instruct|chat|-it\b/i.test(id) ? 5 : 0)
}

async function listFree(provider: 'openrouter' | 'nvidia', apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${PROVIDERS[provider].baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: signal ?? AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(String(res.status))
  const data: any[] = (await res.json())?.data ?? []
  const ids =
    provider === 'openrouter'
      ? data
          .filter((m) => {
            const free = String(m.id).endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
            const textOut = (m.architecture?.output_modalities ?? ['text']).join() === 'text'
            return free && textOut && (m.context_length ?? 0) >= 32_000 && !/^openrouter\//.test(m.id)
          })
          .map((m) => String(m.id))
      : data.map((m) => String(m.id))
  return ids.filter((id) => !NOT_CHAT.test(id)).sort((x, y) => rank(y) - rank(x)).slice(0, 5)
}

const discovered = new Map<string, { at: number; ids: string[] }>()
/** ids that answered 404/410 this session: never tried again */
const dead = new Set<string>()

async function discover(provider: 'openrouter' | 'nvidia', apiKey: string): Promise<string[]> {
  const hit = discovered.get(provider)
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.ids
  try {
    const ids = await listFree(provider, apiKey)
    discovered.set(provider, { at: Date.now(), ids })
    return ids
  } catch {
    return []
  }
}

/** Whether any reviewer could be used at all (a free-tier key is set). */
export function hasReviewerKey(keys: Keys): boolean {
  return !!(keys.openrouter?.trim() || keys.nvidia?.trim())
}

/** Reviewer chain: your pinned model first, then live-discovered free models on its provider, then the opposite provider. */
export async function buildReviewerChain(cfg: PublishConfig, models: ModelOption[], keys: Keys): Promise<Candidate[]> {
  const key = (p: string) => (keys[p as keyof Keys] ?? '').trim()
  const pinnedPrimary = cfg.reviewerModelId ? parseRef(cfg.reviewerModelId, models) : null
  const first = pinnedPrimary?.provider === 'nvidia' ? 'nvidia' : 'openrouter'
  const order: ('openrouter' | 'nvidia')[] = first === 'nvidia' ? ['nvidia', 'openrouter'] : ['openrouter', 'nvidia']
  const lists = await Promise.all(order.map((p) => (key(p) ? discover(p, key(p)) : Promise.resolve([] as string[]))))
  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (m: ModelOption | null) => {
    if (!m || !key(m.provider)) return
    const k = `${m.provider}:${m.id}`
    if (seen.has(k) || dead.has(k)) return
    seen.add(k)
    out.push({ model: m, apiKey: key(m.provider) })
  }
  add(pinnedPrimary)
  order.forEach((p, i) => {
    lists[i].forEach((id) => add(parseRef(`${p}:${id}`, models)))
    // pinned fallback goes after the first provider's models
    if (i === 0 && cfg.reviewerFallbackId) add(parseRef(cfg.reviewerFallbackId, models))
  })
  return out
}

/** Tries each reviewer in order, skipping dead models (404/410); one clear error lists every failure if all fail. */
export async function reviewWithFallback(opts: {
  course: Course
  reviewers: Candidate[]
  tax: Taxonomy
  threshold: number
  signal?: AbortSignal
  maxTries?: number
}): Promise<ReviewResult> {
  if (!opts.reviewers.length)
    throw new Error('No reviewer available — add an OpenRouter or NVIDIA API key in Keys.')
  const failures: string[] = []
  for (const { model, apiKey } of opts.reviewers.slice(0, opts.maxTries ?? 7)) {
    try {
      return await reviewCourse({ ...opts, reviewer: model, apiKey, timeoutMs: 90_000 })
    } catch (e: any) {
      if (opts.signal?.aborted) throw e
      if (e?.status === 404 || e?.status === 410) dead.add(`${model.provider}:${model.id}`)
      failures.push(`${PROVIDERS[model.provider].label} ${model.id}: ${String(e?.message ?? 'failed').slice(0, 90)}`)
    }
  }
  throw new Error(`Every reviewer failed — ${failures.join(' | ')}`)
}
