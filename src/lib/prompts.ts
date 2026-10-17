// Prompt engine — the heart of the Foundry.
// Series continuity, the output contract, and the design spec all live here.
import type { Course, PlanPart, Series, VisualDirection } from '@/types'
import { visualText } from '@/lib/brief'

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

export const DESIGN_BRIEF = `QUALITY BAR — read this twice:
This is for a private mystery-school library. The pages must look and feel like a premium, hand-crafted immersive course — the level of a high-end editorial site crossed with an interactive experience. Think: a hero with a signature animated visual that is unique to the topic (a self-drawing sigil, a particle horizon that bends toward the cursor, drifting glyphs), a sticky chapter navigation, scroll progress, pull quotes with attribution, narrative story blocks, interactive exercises with a saved private journal, deep-dive drawers, hover-definition terms, a real glossary, and honest labelling of what is established versus speculative. Generic, template-looking, flat or text-wall pages are unacceptable. Exceed that bar on every page.

BACKGROUND AND COLOUR (hard rules):
- The page background is PURE BLACK (#000) or an almost-black neutral (#05050a at the lightest). NEVER a purple, violet, indigo, navy or any tinted page background, and never a gradient across the whole page. Page wrappers (body, main, .page, .app, .shell) must use background: transparent — the Foundry draws an animated black field behind them.
- Cards, panels, sidebars and drawers are translucent near-black (e.g. rgba(8,8,12,.72)) with a hairline border — never a saturated or purple fill.
- Colour comes only from accents: derive a 2–3 colour accent palette from the subject itself (e.g. antique gold + oxblood, teal + amber, bone + crimson). Purple/violet may appear ONLY as a small accent if the subject truly calls for it — never as a surface.
- Typography: load exactly two Google Fonts (a distinctive display face and a readable body face) chosen to suit the subject. Real hierarchy, generous whitespace, body text 17px+ with relaxed line-height, max reading width ~70ch.`

const STYLING_NOTE = `STYLING — A SEPARATE DESIGNER WILL RESTYLE YOUR PAGE AFTERWARDS. Your job is information and working code, not looks:
- Use clean, minimal, readable CSS only: dark neutral page, system font stack (NO Google Fonts), simple layout. Do not spend tokens on ornament, gradients, or visual flourish.
- Build it so a designer can restyle it safely: semantic HTML (header, nav, main, section, article, aside, figure, details); one class per component role (.hero, .chapter, .callout, .pullquote, .card, .quiz, .flip, .tabs, .accordion, .journal, .glossary, .diagram); every colour, font and spacing value as a CSS custom property on :root; JavaScript finds elements by id or data- attributes, never by styling classes.
- Spend your effort on: factual depth, correct and complete content, and interactive features that genuinely work.`

const FUNC_STRUCTURE = `REQUIRED STRUCTURE:
1. A fixed scroll-progress bar at the very top.
2. A hero: course title, part designation if any, estimated reading time, a one-paragraph promise, and 3–4 concrete outcomes ("what you will walk away with") — with the signature animated visual described below.
3. Sticky chapter navigation (side rail or sidebar on desktop, collapsible on mobile) with active-section highlighting via IntersectionObserver.
4. 6–9 chapters of SUBSTANTIVE teaching content — each at least 450 words, the whole course at least 4500 words. Real depth: mechanisms, history, named people, texts, traditions, dates and specifics where they exist; the strongest counter-view or limitation stated honestly. Zero filler, zero placeholder text; every paragraph teaches something concrete. Where material is historically established versus modern reconstruction versus personal gnosis/speculation, say which.
5. Interactivity — at least SIX different kinds, all genuinely working: (a) at least TWO custom topic-specific interactive diagrams or simulations built with canvas or SVG that respond to pointer, slider or click (a correspondences wheel you can rotate, a Tree-of-Life you can hover, a planetary-hours calculator, a sigil-forging canvas, a timeline scrubber — whatever fits the subject); (b) self-check quizzes with instant right/wrong feedback and explanation; (c) flip cards or click-to-reveal for key concepts; (d) tabbed or toggled comparisons; (e) a reflection journal: textareas whose entries save to localStorage with Save / Clear and a visible history; (f) a persistent checklist/progress tracker that updates the progress bar; (g) accordion deep-dive drawers; (h) hover-definition terms for jargon.
6. A "Key Takeaways" section distilling the course, and a glossary of key terms with plain-language definitions.`

const FUNC_MOTION_FX = `MOTION (the course must feel alive, never static):
- Build the signature hero animation yourself in canvas or SVG (self-drawing line work, orbiting or drifting particles, rotating geometry, a living diagram) — richly detailed, topic-specific, reacting to the pointer where natural. Add refined hover micro-interactions on cards, buttons, terms and nav; animate chapter-number or heading flourishes; animate diagrams as they scroll into view.
- THE FOUNDRY INJECTS THESE AUTOMATICALLY — DO NOT BUILD THEM: the animated black background field, the cinematic title opening, scroll-reveal fades, and the "Motion" on/off switch. Do not add a loading overlay, a motion toggle, or a full-page background of your own.
- The Foundry's Motion switch toggles the class "no-motion" on <html>. Everything you animate must obey it: write CSS as html.no-motion * { animation: none !important; transition: none !important; }, and make EVERY requestAnimationFrame / setInterval loop check document.documentElement.classList.contains('no-motion') each frame (draw one static frame instead when off), and watch for the class changing with a MutationObserver so loops resume when turned back on. Also respect prefers-reduced-motion.`

const FUNC_MOTION_OWN = `MOTION (the course must feel alive, never static):
- Build every animation yourself: an ambient full-page canvas background specific to the subject (drifting stars, fractal bloom, sacred-geometry lattice, embers, runes: your choice), a soft cursor glow that follows the pointer, a signature hero animation in canvas or SVG, hover micro-interactions on cards, buttons and nav, and scroll-triggered reveals via IntersectionObserver.
- Add a pill-style "Motion" on/off switch fixed at the top-right that toggles the class "no-motion" on <html> (default ON, persisted in localStorage). Write CSS as html.no-motion * { animation: none !important; transition: none !important; }, make EVERY requestAnimationFrame / setInterval loop check document.documentElement.classList.contains('no-motion') (draw one static frame instead when off) and watch the class with a MutationObserver so loops resume. Also respect prefers-reduced-motion.`

const FUNC_ENGINEERING = `ENGINEERING:
- Fully mobile responsive, no horizontal scroll, touch targets ≥ 44px, keyboard-accessible controls with visible focus.
- Must work opened directly as a local .html file — no build step, no network dependency beyond Google Fonts.
- Complete and unabridged: never write "etc.", "more here" or skeletons. Finish every chapter and close every tag.`

const funcSpec = (fx: boolean) => `${FUNC_STRUCTURE}\n\n${fx ? FUNC_MOTION_FX : FUNC_MOTION_OWN}\n\n${FUNC_ENGINEERING}`

const SINGLE_SPEC = `YOU ARE AUTHOR, ENGINEER AND ART DIRECTOR IN ONE. The page you write is a finished, bespoke, immersive digital artifact for THIS subject, not a template. Content and craft carry equal weight.

ART DIRECTION:
- Invent a palette native to the subject: a near-black "void" base tinted toward the subject, 3–4 vivid accent colours, and glow shadows, all as CSS custom properties on :root (e.g. --void, --deep, --accent-a, --accent-b, --accent-c, --glow-a, --glow-b, --text, --muted). Use gradient text and layered glows on key headings and numerals. The page is always dark: never a white or pale page.
- Typography: exactly two Google Fonts (a distinctive display face and a readable body face) chosen for the subject, optionally a monospace for labels. Real hierarchy: tiny letter-spaced section labels ("03 — Interactive Visualizer"), huge glowing display titles, generous whitespace, body 17px+, reading width about 70ch.
- A full-page ambient canvas background and a soft cursor glow specific to the subject (never generic).
- Components should feel hand-made: glass-and-hairline cards, glowing hover states, animated meters and progress bars, drawers and tabs with polished transitions.

THE SIGNATURE INSTRUMENT (the most important part):
- Build at least TWO original interactive instruments from scratch, native to the subject, in canvas or SVG with real logic behind them: a graph you can scrub and inspect on hover, a wheel or Tree you can spin or hover, a simulator driven by sliders, a generator, a calculator, a chart you cast. They must respond live to buttons, sliders and the pointer, have view controls (e.g. History / Century / Zoom, Animate on/off), and show a live readout (a meter, a value, a label). These are not decoration; they teach the idea.

STUDY LAYER:
- A tabbed "Study Guide" (for example Concepts / Glossary / Roadmap) with expandable terms.
- A quiz of 8–10 questions with a progress bar, instant right/wrong feedback with an explanation, a final score screen and restart.
- Reflective exercises with textareas whose entries save to localStorage with Save and Clear, a visible saved history, an "Export journal" download, and a chapter-progress tracker that fills the scroll bar.
- Sticky navigation with active-section highlighting.`

const refBlock = (reference?: string | null) =>
  reference
    ? `REFERENCE PAGE — MATCH ITS LEVEL OF CRAFT. Below is the CSS and JavaScript of a finished page the creator loves, with its prose shortened. Study how it builds its palette tokens, glows, ambient canvas, custom instruments, tabs, quiz, saved exercises and animation. Reach that same level of visual richness and interactivity for the NEW topic. Do NOT copy its topic, wording, colours, layout or code; invent a fresh palette, fresh instruments and fresh structure that suit the new subject.\n\n<reference>\n${reference}\n</reference>`
    : ''

export function designPrompt(opts: { skeleton: string; title: string; rejected?: string; visual?: VisualDirection | null }): string {
  return `You are a world-class art director and front-end designer. Below is the STRUCTURE of a finished, working masterclass page (long text is elided with "…", but all tags, classes, ids, the writer's CSS and the page's scripts are complete). The content and code are final and you will not touch them. Your job is to write the visual design layer that makes this the most beautiful, immersive, premium course page the reader has ever seen: award-winning editorial site crossed with a cinematic interactive experience. Confident typography, dramatic hierarchy, rich layered depth, tasteful glow and texture, elegant hover and focus states, refined spacing, beautiful pull quotes, callouts, cards, quizzes, flip cards, accordions, tabs and diagrams, and a signature hero visual unique to the subject.

${DESIGN_BRIEF}

${opts.visual ? `ART DIRECTION FROM THE CREATIVE DIRECTOR — execute this with total commitment; it overrides your own defaults where they differ (palette stays accent-only on pure black):\n${visualText(opts.visual)}\n` : ''}
HOW YOUR WORK IS APPLIED:
- You do NOT output a page. You output three blocks (format below). Your CSS is inserted in a <style> placed AFTER the writer's CSS, so it overrides it. The writer's CSS stays as the functional base (it contains the rules that make tabs, accordions, flip cards, quizzes and progress bars work), so do not break state rules: study the CSS and scripts to see which classes JS toggles (e.g. .open, .active, .flipped, .correct, .wrong, [hidden]) and make sure your design styles BOTH states properly. Override layout, colour, type, spacing, borders, shadows, animation freely.
- Your optional JS runs after the page's own scripts. Use it ONLY for decorative additions: e.g. a canvas or SVG signature hero animation inserted into the hero element, animated ornaments, cursor-reactive effects. Never touch the page's content, quiz logic or storage.
- Style every component you see in the structure; leave nothing looking default. Give the hero a signature animated visual specific to this subject.

HARD CONSTRAINTS:
1. Never hide, remove or shrink content: no display:none / visibility:hidden / opacity:0 on content except for the page's own toggled states.
2. Fonts: exactly two Google Fonts, loaded with <link> tags in the FONTS block (fonts.googleapis.com / fonts.gstatic.com only). No other external resources, no images by URL, no @import of other hosts.
3. No network calls (no fetch, XMLHttpRequest, WebSocket, sendBeacon) anywhere, including comments.
4. Motion: include html.no-motion * { animation: none !important; transition: none !important; }. Every requestAnimationFrame/setInterval loop you write must check document.documentElement.classList.contains('no-motion') and draw a static frame when true, and a MutationObserver must resume it when the class is removed. Respect prefers-reduced-motion.
5. THE FOUNDRY INJECTS THESE AUTOMATICALLY — DO NOT BUILD THEM: the animated black background field, the cinematic title opening, scroll-reveal fades, the Motion switch.
6. Fully responsive, no horizontal scroll, touch targets 44px or more, visible focus states.
7. Be generous and thorough: a rich, detailed stylesheet (hundreds of lines is normal), not a token gesture.

OUTPUT FORMAT — exactly this, nothing before or after:
<<<FONTS>>>
<link ...> tags
<<<CSS>>>
...the complete stylesheet, no <style> tags...
<<<JS>>>
...optional decorative script, no <script> tags (leave empty if none)...
<<<END>>>

${opts.rejected ? `YOUR PREVIOUS ATTEMPT WAS REJECTED AND DISCARDED: ${opts.rejected}. Fix exactly this.\n\n` : ''}PAGE TITLE: ${opts.title}

PAGE STRUCTURE:
${opts.skeleton}`
}

export function coursePrompt(opts: {
  topic: string
  notes: string
  series?: Series | null
  part?: number | null
  previousParts?: Course[]
  visual?: VisualDirection | null
  mode?: 'single' | 'two-stage'
  reference?: string | null
  fx?: boolean
}): string {
  const { topic, notes, series, part, previousParts, visual } = opts
  const mode = opts.mode ?? 'two-stage'
  const fx = opts.fx ?? true

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

  return `You are the Foundry — a masterclass author${mode === 'single' ? ', engineer and art director' : ' and engineer'} in one. Build a complete, accurate, fully working interactive masterclass as a single HTML file.

TOPIC: ${topic}
${seriesBlock}
${notes.trim() ? `\nCREATOR NOTES / OUTLINE (treat as requirements — if this contains an outline, follow it for chapter structure):\n${notes}\n` : ''}
${OUTPUT_CONTRACT}

${ACCURACY_SPEC}

${mode === 'single' ? `${SINGLE_SPEC}\n\n${visual ? `ART DIRECTION FROM THE CREATIVE DIRECTOR (follow it; the palette stays dark):\n${visualText(visual)}\n\n` : ''}${refBlock(opts.reference)}` : STYLING_NOTE}

${funcSpec(fx)}
${visual && visual.visualizations.length ? `\nCUSTOM DATA VISUALIZATIONS YOU MUST BUILD (working code, plain styling; the designer will beautify them; give each a clear id and class):\n${visual.visualizations.map((x) => `- ${x.name} (${x.tech}): shows ${x.shows}; interaction: ${x.interaction}`).join('\n')}\n` : ''}
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


export function qaRepairPrompt(opts: { html: string; problems: string[] }): string {
  return `Automated browser testing of the masterclass page below found defects. Fix every one of them and return the COMPLETE corrected HTML document.

DEFECTS FOUND:
${opts.problems.map((p) => `- ${p}`).join('\n')}

RULES:
- Fix the root cause in the code. Do not remove features, shorten content, or simplify the design to hide a problem: a blank canvas must be made to draw, a script error must be fixed, horizontal overflow must be fixed with responsive CSS.
- Keep all content, structure, palette and interactions otherwise exactly as they are.
- Output one complete HTML document from <!DOCTYPE html> to </html>, with the COURSE_META comment before </body> unchanged. No markdown fences, no commentary.

THE PAGE:
${opts.html}`
}
