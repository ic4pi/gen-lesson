// Prompt engine — the heart of the Foundry.
// Series continuity, the output contract, and the design spec all live here.
import type { Course, PlanPart, Series } from '@/types'

export const CURRICULUM_SYSTEM = `You are a curriculum architect for a masterclass generation studio. You output ONLY valid JSON — no markdown fences, no commentary.`

export function curriculumPrompt(topic: string, notes: string): string {
  return `Design a multi-part masterclass curriculum on the topic below. Broad topics must be split into digestible sequential parts — a single giant course stops being helpful, so each part is one focused sitting (roughly a 30–45 minute read).

TOPIC: ${topic}
${notes.trim() ? `CREATOR NOTES / OUTLINE (treat as requirements, follow any outline given):\n${notes}` : ''}

Rules:
- 3 to 6 parts. Progression from foundations → deeper meaning → practical application → advanced/synthesis.
- Part 1 always assumes zero prior knowledge.
- Each part's scope must NOT overlap with other parts.
- Titles should be compelling and specific, e.g. "Part 2 — What It Is Trying to Tell Us".

Return ONLY this JSON shape:
{"seriesTitle":"...","parts":[{"part":1,"title":"...","scope":"one sentence describing exactly what this part covers"}]}`
}

const OUTPUT_CONTRACT = `OUTPUT CONTRACT — follow exactly:
1. Output ONE complete, self-contained HTML document. First characters: <!DOCTYPE html> — last characters: </html>. No markdown code fences. No commentary before or after.
2. Immediately before the closing </body> tag, place exactly one metadata comment in this exact shape:
<!--COURSE_META:{"title":"course title","summary":"2-3 sentences describing precisely what this course teaches","topicsCovered":["topic","topic","topic"]}-->
3. ALL CSS lives in a single <style> block in <head>. ALL JS lives in a single <script> block before </body>. No external scripts or stylesheets except Google Fonts. Never hotlink images — use inline SVG, CSS art, gradients, or canvas for all visuals.`

const DESIGN_SPEC = `DESIGN DIRECTION:
- Derive the ENTIRE visual theme from the subject itself: palette, typography pairing, and one signature visual motif must feel native to this topic. A course on ceremonial magic must not look like a course on thermodynamics. Commit to the theme fully.
- Quality bar: award-winning editorial course platform. Credible, premium, trustworthy — the kind of page a paying student screenshots.
- Typography: load exactly two Google Fonts (one display, one body). Real hierarchy, generous whitespace, body text 17px+ with relaxed line-height.
- Choose dark or light theme based on what suits the subject — commit to it.

REQUIRED STRUCTURE:
1. A fixed scroll progress bar at the very top that fills as the reader advances.
2. A hero: course title, part designation if any, estimated reading time, and "what you'll walk away with" (3-4 concrete outcomes).
3. Sticky chapter navigation — sidebar on desktop, collapsible top bar on mobile — with active-section highlighting via IntersectionObserver.
4. 6–9 chapters of SUBSTANTIVE teaching content. Real depth: mechanisms, history, named examples, specific numbers and dates where they exist. Zero filler, zero fluff, zero placeholder text — every paragraph must teach something concrete.
5. Interactive elements — use at least 4 different kinds across the course: click-to-reveal explanations, accordion deep-dives, self-check quizzes with instant right/wrong feedback, flip cards for key terms, tabbed comparisons, reflection prompts saved to localStorage.
6. A "Key Takeaways" section distilling the whole course.
7. A glossary of key terms with plain-language definitions.

MOTION:
- Scroll-triggered reveals via IntersectionObserver, refined hover micro-interactions, and one tasteful ambient motion detail tied to the theme (floating particles, slow glow, drifting glyphs — whatever fits the subject).
- A pill-style toggle switch fixed at the top-right, labeled "Motion", that instantly turns ALL animations and transitions on or off by toggling a class on <html> (e.g. .no-motion * { animation: none !important; transition: none !important; }). Default ON. Persist the choice in localStorage.
- Respect prefers-reduced-motion.

ENGINEERING:
- Fully mobile responsive, no horizontal scroll, touch targets ≥ 44px.
- Must work opened directly as a local .html file — no build step, no network dependency beyond Google Fonts.`

export function coursePrompt(opts: {
  topic: string
  notes: string
  series?: Series | null
  part?: number | null
  previousParts?: Course[]
}): string {
  const { topic, notes, series, part, previousParts } = opts

  let seriesBlock = ''
  if (series && part) {
    const planLines = series.plan
      .map((p) => `  Part ${p.part}: "${p.title}" — ${p.scope}`)
      .join('\n')
    const prevLines = (previousParts ?? [])
      .map(
        (c) =>
          `  Part ${c.part} "${c.title}": ${c.summary} Topics already taught: ${c.topicsCovered.join(', ')}.`,
      )
      .join('\n')

    seriesBlock = `
THIS COURSE IS PART ${part} OF THE SERIES "${series.title}".

Full curriculum plan:
${planLines}

${prevLines ? `Previously covered — DO NOT REPEAT any of this material:\n${prevLines}\n` : ''}
Continuity rules:
- Your scope for this part is EXACTLY: ${series.plan.find((p) => p.part === part)?.scope ?? 'as per the plan'}.
- ${part > 1 ? `Open with a 2–3 sentence "Previously in this series" recap, then teach NEW material only. Where relevant, reference earlier parts by name ("as we covered in Part ${part - 1}…").` : 'This is Part 1: assume the reader knows nothing about the subject.'}
- End with a short "Where we go next" section pointing at Part ${part + 1 <= series.plan.length ? `${part + 1} — "${series.plan.find((p) => p.part === part + 1)?.title ?? ''}"` : 'the reader\'s next steps beyond this series'}.`
  }

  return `You are the Foundry — a masterclass author and world-class front-end designer in one. Build a complete interactive masterclass as a single HTML file.

TOPIC: ${topic}
${seriesBlock}
${notes.trim() ? `\nCREATOR NOTES / OUTLINE (treat as requirements — if this contains an outline, follow it for chapter structure):\n${notes}\n` : ''}
${OUTPUT_CONTRACT}

${DESIGN_SPEC}

Begin now. Output the HTML document and nothing else.`
}

/** Parse the generated document: strip fences, extract meta, validate. */
export function parseCourseHtml(raw: string): {
  html: string
  title: string | null
  summary: string
  topicsCovered: string[]
} {
  let text = raw.trim()
  // strip markdown fences if the model added them anyway
  text = text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/,'')

  let title: string | null = null
  let summary = ''
  let topicsCovered: string[] = []

  const metaMatch = text.match(/<!--\s*COURSE_META:(\{[\s\S]*?\})\s*-->/)
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1])
      if (typeof meta.title === 'string') title = meta.title
      if (typeof meta.summary === 'string') summary = meta.summary
      if (Array.isArray(meta.topicsCovered))
        topicsCovered = meta.topicsCovered.filter((t: any) => typeof t === 'string')
    } catch {
      // malformed meta — keep the HTML, meta stays blank
    }
    text = text.replace(metaMatch[0], '')
  }

  // locate the actual document
  const start = text.search(/<!doctype html/i)
  const htmlStart = start >= 0 ? start : text.search(/<html/i)
  if (htmlStart > 0) text = text.slice(htmlStart)
  const end = text.search(/<\/html>/i)
  if (end >= 0) text = text.slice(0, end + 7)

  return { html: text, title, summary, topicsCovered }
}

/** True if the model was cut off mid-document. */
export function looksTruncated(html: string): boolean {
  return !/<\/html>/i.test(html)
}

export function parseCurriculum(raw: string): {
  seriesTitle: string
  parts: PlanPart[]
} | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0])
    if (!Array.isArray(j.parts) || j.parts.length === 0) return null
    return {
      seriesTitle: typeof j.seriesTitle === 'string' ? j.seriesTitle : 'Untitled Series',
      parts: j.parts.map((p: any, i: number) => ({
        part: typeof p.part === 'number' ? p.part : i + 1,
        title: String(p.title ?? `Part ${i + 1}`),
        scope: String(p.scope ?? ''),
      })),
    }
  } catch {
    return null
  }
}

// ── topic suggestion ─────────────────────────────────────────

export const TOPIC_SYSTEM = `You are the acquisitions librarian of a hidden mystery school. You propose course topics for its private library: specific, substantive, scholarly-yet-practical subjects. Respond with JSON only.`

export function topicSuggestPrompt(subject: string, count: number, existing: string[]): string {
  return `Subject area: ${subject}

Propose ${count} distinct course topics for this library. Each must be specific enough to fill a full masterclass (e.g. "The Sevenfold Planetary Spheres in Hermetic Theurgy", not "Hermeticism"). Spread them across traditions, eras and practices; avoid near-duplicates of each other.

The library ALREADY contains these — do not repeat, rephrase or overlap them:
${existing.length ? existing.map((e) => `- ${e}`).join('\n') : '(nothing yet)'}

Return ONLY a JSON array, no prose, no code fences:
[{"topic": "short course title", "angle": "one sentence on scope and approach"}]`
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** True if `candidate` equals or contains/is contained by any known title. */
export function isDuplicateTopic(candidate: string, known: string[]): boolean {
  const c = norm(candidate)
  if (!c) return true
  return known.some((k) => {
    const n = norm(k)
    if (!n) return false
    return n === c || (Math.min(n.length, c.length) >= 12 && (n.includes(c) || c.includes(n)))
  })
}

export function parseSuggestions(raw: string): { topic: string; angle: string }[] {
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0])
    if (!Array.isArray(arr)) return []
    return arr
      .map((x: any) =>
        typeof x === 'string'
          ? { topic: x.trim(), angle: '' }
          : { topic: String(x?.topic ?? '').trim(), angle: String(x?.angle ?? '').trim() },
      )
      .filter((x) => x.topic)
  } catch {
    return []
  }
}
