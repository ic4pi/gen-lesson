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
3. ALL CSS lives in a single <style> block in <head>. ALL JS lives in a single <script> block before </body>. No external scripts or stylesheets except Google Fonts. Never hotlink images — use inline SVG, CSS art, gradients, or canvas for all visuals.
4. The page must never make network requests: no fetch, XMLHttpRequest, WebSocket or sendBeacon anywhere in the JS, and never write those words in prose either.`

const ACCURACY_SPEC = `ACCURACY & DEPTH STANDARD — this outranks everything else:
- Every factual claim must be one you can stand behind. Names, dates, titles, quotations, numbers, attributions, etymologies and "ancient sources say…" statements must be correct. If you are not sure, leave it out or flag it plainly as uncertain — NEVER invent a quote, citation, date, text title or scholar.
- Separate three tiers of claim and label them in the text wherever the distinction matters: ESTABLISHED (documented, mainstream scholarship), DEBATED (scholars or practitioners disagree — say who and why), and TRADITION/PRACTICE (what a school or lineage believes or does, presented as such, not as fact).
- Go beyond the textbook summary. Each chapter must contain material most introductions omit: primary texts and what they actually say, original-language terms with their real meaning, lesser-known figures, suppressed or neglected lineages, surprising historical connections, genuine scholarly disputes, and the "why this is usually told wrong" corrections. Hidden knowledge means obscure but VERIFIABLE — not invented, not vague mystique.
- Teach religious, esoteric and spiritual systems (kundalini, chakras, prana, Hermetic correspondences, theurgy, magick, astrology, divination and the like) as living traditions, on their own terms. Present what the tradition actually teaches in its own vocabulary, with the depth a practitioner would recognise: the texts, lineages, stages, practices and the experiences they describe. Do not water it down, do not debunk it, do not sprinkle disclaimers through every paragraph.
- For such material, ACCURACY means fidelity to the tradition and its sources (what the Hatha Yoga Pradipika, the Sat-Chakra-Nirupana, Agrippa, the Corpus Hermeticum etc. really say, and how schools differ), not scientific validation. Put the modern view in ONE clearly marked place per chapter or in a dedicated section: where mainstream science and medicine find no support or disagree, stated plainly and briefly, alongside what practitioners report. Never present a tradition's metaphysical claims as established scientific fact, and never give medical advice or promise cures. Include the cautions the tradition itself gives about its practices.
- Name concrete sources (author, work, period) so the reader can check you. Prefer specific over impressive.`

const DESIGN_SPEC = `QUALITY BAR — read this twice:
This is for a private mystery-school library. The pages must look and feel like a premium, hand-crafted immersive course — the level of a high-end editorial site crossed with an interactive experience. Think: a hero with a signature animated visual that is unique to the topic (a self-drawing sigil, a particle horizon that bends toward the cursor, drifting glyphs), a sticky chapter navigation, scroll progress, pull quotes with attribution, narrative story blocks, interactive exercises with a saved private journal, deep-dive drawers, hover-definition terms, a real glossary, and honest labelling of what is established versus speculative. Generic, template-looking, flat or text-wall pages are unacceptable. Exceed that bar on every page.

BACKGROUND AND COLOUR (hard rules):
- The page background is PURE BLACK (#000) or an almost-black neutral (#05050a at the lightest). NEVER a purple, violet, indigo, navy or any tinted page background, and never a gradient across the whole page. Page wrappers (body, main, .page, .app, .shell) must use background: transparent — the Foundry draws an animated black field behind them.
- Cards, panels, sidebars and drawers are translucent near-black (e.g. rgba(8,8,12,.72)) with a hairline border — never a saturated or purple fill.
- Colour comes only from accents: derive a 2–3 colour accent palette from the subject itself (e.g. antique gold + oxblood, teal + amber, bone + crimson). Purple/violet may appear ONLY as a small accent if the subject truly calls for it — never as a surface.
- Typography: load exactly two Google Fonts (a distinctive display face and a readable body face) chosen to suit the subject. Real hierarchy, generous whitespace, body text 17px+ with relaxed line-height, max reading width ~70ch.

REQUIRED STRUCTURE:
1. A fixed scroll-progress bar at the very top.
2. A hero: course title, part designation if any, estimated reading time, a one-paragraph promise, and 3–4 concrete outcomes ("what you will walk away with") — with the signature animated visual described below.
3. Sticky chapter navigation (side rail or sidebar on desktop, collapsible on mobile) with active-section highlighting via IntersectionObserver.
4. 6–9 chapters of SUBSTANTIVE teaching content — each at least 450 words, the whole course at least 4500 words. Real depth: mechanisms, history, named people, texts, traditions, dates and specifics where they exist; the strongest counter-view or limitation stated honestly. Zero filler, zero placeholder text; every paragraph teaches something concrete. Where material is historically established versus modern reconstruction versus personal gnosis/speculation, say which.
5. Interactivity — at least SIX different kinds, all genuinely working: (a) at least TWO custom topic-specific interactive diagrams or simulations built with canvas or SVG that respond to pointer, slider or click (a correspondences wheel you can rotate, a Tree-of-Life you can hover, a planetary-hours calculator, a sigil-forging canvas, a timeline scrubber — whatever fits the subject); (b) self-check quizzes with instant right/wrong feedback and explanation; (c) flip cards or click-to-reveal for key concepts; (d) tabbed or toggled comparisons; (e) a reflection journal: textareas whose entries save to localStorage with Save / Clear and a visible history; (f) a persistent checklist/progress tracker that updates the progress bar; (g) accordion deep-dive drawers; (h) hover-definition terms for jargon.
6. A "Key Takeaways" section distilling the course, and a glossary of key terms with plain-language definitions.

MOTION (the course must feel alive, never static):
- Build the signature hero animation yourself in canvas or SVG (self-drawing line work, orbiting or drifting particles, rotating geometry, a living diagram) — richly detailed, topic-specific, reacting to the pointer where natural. Add refined hover micro-interactions on cards, buttons, terms and nav; animate chapter-number or heading flourishes; animate diagrams as they scroll into view.
- THE FOUNDRY INJECTS THESE AUTOMATICALLY — DO NOT BUILD THEM: the animated black background field, the cinematic title opening, scroll-reveal fades, and the "Motion" on/off switch. Do not add a loading overlay, a motion toggle, or a full-page background of your own.
- The Foundry's Motion switch toggles the class "no-motion" on <html>. Everything you animate must obey it: write CSS as html.no-motion * { animation: none !important; transition: none !important; }, and make EVERY requestAnimationFrame / setInterval loop check document.documentElement.classList.contains('no-motion') each frame (draw one static frame instead when off), and watch for the class changing with a MutationObserver so loops resume when turned back on. Also respect prefers-reduced-motion.

ENGINEERING:
- Fully mobile responsive, no horizontal scroll, touch targets ≥ 44px, keyboard-accessible controls with visible focus.
- Must work opened directly as a local .html file — no build step, no network dependency beyond Google Fonts.
- Complete and unabridged: never write "etc.", "more here" or skeletons. Finish every chapter and close every tag.`

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

${ACCURACY_SPEC}

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

export function rebuildPrompt(opts: {
  topic: string
  notes: string
  html: string
  verdict: string
  worthIt: string
  issues: { severity: string; text: string }[]
  weak: string[]
}): string {
  const issues = opts.issues.length
    ? opts.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.text}`).join('\n')
    : '- (no itemised issues; raise the weak areas below)'
  return `You are the Foundry, rebuilding a masterclass that an independent editor refused to publish. Produce a better version of the SAME course.

TOPIC: ${opts.topic}
${opts.notes.trim() ? `CREATOR NOTES:\n${opts.notes}\n` : ''}
EDITOR'S VERDICT: ${opts.verdict} — ${opts.worthIt}
WEAKEST AREAS: ${opts.weak.join(', ') || 'none flagged'}
ISSUES TO FIX (every one of them):
${issues}

${ACCURACY_SPEC}

REBUILD RULES:
- Fix every issue above. Where the editor flagged a claim as wrong or unverifiable, replace it with the correct, checkable fact, or delete it. Do not defend errors.
- Then audit every other claim in the document yourself with the same strictness and correct anything doubtful.
- Add real hidden-knowledge depth where the editor found it thin: primary sources, original terms, neglected figures, genuine disputes, common-misconception corrections.
- Keep what already works: theme, design, structure, working interactive elements, quizzes (update quiz answers if facts change). Remove filler.
- Keep the same output contract: one complete HTML document, <!DOCTYPE html> to </html>, the COURSE_META comment before </body>, one <style>, one <script>, no external scripts, and no network calls (no fetch, XMLHttpRequest, WebSocket, sendBeacon).

${OUTPUT_CONTRACT}

CURRENT DOCUMENT TO REBUILD:
${opts.html}

Output the complete rebuilt HTML document and nothing else.`
}
