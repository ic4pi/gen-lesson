// Second-opinion review: a different model judges whether a course is worth publishing.
import { chatOnce } from './llm'
import { visibleWords, type Taxonomy } from './hexpo'
import type { Course, ModelOption, ReviewResult } from '@/types'

const SYSTEM = `You are a hard-to-impress editorial reviewer for a paid esoteric-and-ideas masterclass library. Another AI wrote the course you are given. Your job is to decide whether it is genuinely worth publishing and charging attention for — not to be kind. Penalize filler, vague claims, invented facts, fake-sounding citations, repetition, thin sections, generic "intro to X" content, and interactivity that is decorative rather than teaching. Reward concrete mechanisms, specific named examples, accurate history, honest framing of fringe material (clearly separating established fact, scholarly debate and belief/practice), and interactions that test understanding. Reply with ONE JSON object and nothing else.`

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

Judge: is this worth the value it claims? Score each 0-10: accuracy (facts, no fabrication), depth (substance vs filler), originality (non-generic insight), structure (pedagogical flow, no repetition), interactivity (does it teach, not decorate). Then valueScore 0-100 overall ("would a discerning reader feel they got their time's worth?"). verdict: "publish" only if you would put your name on it; "revise" if fixable; "reject" if the premise or execution is poor. List concrete issues; severity "blocker" = factual fabrication, truncation, broken or empty sections, or content that misrepresents itself.

Also classify it for the library catalogue:
Categories (exactly one id):
${tax.categories.map((c) => `- ${c.id}: ${c.label} — ${c.blurb}`).join('\n')}
Formats (exactly one id):
${tax.formats.map((f) => `- ${f.id}: ${f.blurb}`).join('\n')}
Concept vocabulary (choose 2-4 ids that genuinely apply):
${tax.concepts.map((c) => `- ${c.id}: ${c.definition}`).join('\n')}

Return JSON exactly:
{"scores":{"accuracy":0,"depth":0,"originality":0,"structure":0,"interactivity":0},"valueScore":0,"verdict":"publish|revise|reject","worthIt":"one blunt sentence","strengths":["..."],"issues":[{"severity":"blocker|major|minor","text":"..."}],"category":"id","format":"id","kicker":"short lowercase tag like 'physics · six parts'","blurb":"card copy, one sentence, max 25 words","covers":["5-7 short bullet topics the course covers"],"concepts":[{"id":"concept-id","angle":"how THIS course uses it, max 14 words"}]}`

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
