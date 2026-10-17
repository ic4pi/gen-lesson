// Art-director + editor brief: the model writes its own build requirements for each topic,
// including a specific visual direction (hero, visualizations, effects, animations) the designer follows.
import { chatOnce } from './llm'
import type { ModelOption, Series, VisualDirection } from '@/types'

export const BRIEF_SYSTEM = `You are the creative director and chief editor of an elite, private mystery-school masterclass studio. Your masterclasses are sold as premium products: they must be intellectually exceptional AND visually stunning, cinematic, professional and razor sharp. You write build briefs that a writer-engineer and a front-end designer execute exactly. You output ONLY valid JSON, no markdown fences, no commentary.`

export function briefPrompt(opts: {
  topic: string
  notes: string
  series?: Series | null
  part?: number | null
  needVisual: boolean
}): string {
  const scope =
    opts.series && opts.part
      ? `\nThis is Part ${opts.part} of the series "${opts.series.title}". Scope of this part: ${opts.series.plan.find((p) => p.part === opts.part)?.scope ?? ''}\nFull plan:\n${opts.series.plan.map((p) => `Part ${p.part}: ${p.title}: ${p.scope}`).join('\n')}\n`
      : ''
  return `Write the build brief for this masterclass.

TOPIC: ${opts.topic}
${opts.notes.trim() ? `CREATOR NOTES:\n${opts.notes}\n` : ''}${scope}
Return ONLY this JSON:
{
  "content": {
    "audience": "who this is for and the level it should reach",
    "outcomes": ["4-6 concrete things the learner can do or explain afterward"],
    "chapters": [{"title": "...", "mustCover": ["specific people, texts, terms, mechanisms, dates"]}],
    "hiddenKnowledge": ["6-10 specific lesser-known but VERIFIABLE facts, primary sources, original-language terms, neglected figures or genuine scholarly disputes this course must include"],
    "misconceptions": ["common myths to correct"],
    "stories": [{"chapter": "chapter title", "kind": "Myth|History|Account", "story": "the specific real story to retell", "source": "who recorded it and in which work"}],
    "interactives": ["6-8 specific working interactive features tailored to THIS topic (not generic), e.g. 'rotatable correspondence wheel mapping planets to metals and days'"]
  }${
    opts.needVisual
      ? `,
  "visual": {
    "mood": "the emotional/visual atmosphere in one vivid sentence",
    "palette": [{"name": "...", "hex": "#......", "role": "accent|highlight|glow|text"}],
    "fonts": {"display": "Google Font name that fits the subject", "body": "readable Google Font name"},
    "motif": "one signature visual motif drawn from the subject's own symbolism",
    "hero": "detailed description of the animated signature hero visual (what is drawn, how it animates, how it reacts to the pointer)",
    "visualizations": [{"name": "...", "shows": "what data or idea it makes visible", "interaction": "how the learner manipulates it", "tech": "canvas|svg"}],
    "effects": ["6-8 specific effects: e.g. glow trails, parallax depth layers, glass panels with grain, glyph particles, animated dividers, spotlight cursor"],
    "animations": ["6-8 specific animations: e.g. self-drawing line work on scroll, number counters, staggered card entrances, rotating geometry"],
    "components": "how pull quotes, callouts, cards, quizzes, flip cards, accordions, tabs and the glossary should look and feel",
    "avoid": ["clichés or looks to avoid for this subject"]
  }`
      : ''
  }
}

Rules: be specific to this subject, never generic. Page background stays pure black; colour comes only from the 2-4 accent palette entries. Visualizations must be buildable in pure canvas/SVG with no libraries and no network. Make it feel like a $500 course.`
}

function parse(raw: string): any | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

const arr = (x: any): string[] => (Array.isArray(x) ? x.map(String).filter(Boolean) : [])

export interface Brief {
  contentText: string
  visual: VisualDirection | null
}

export async function makeBrief(opts: {
  model: ModelOption
  apiKey: string
  topic: string
  notes: string
  series?: Series | null
  part?: number | null
  needVisual: boolean
  signal?: AbortSignal
}): Promise<Brief | null> {
  const raw = await chatOnce({
    provider: opts.model.provider,
    apiKey: opts.apiKey,
    model: opts.model.id,
    messages: [
      { role: 'system', content: BRIEF_SYSTEM },
      { role: 'user', content: briefPrompt(opts) },
    ],
    maxTokens: 5000,
    temperature: 0.8,
    signal: opts.signal,
  })
  const j = parse(raw)
  if (!j?.content) return null
  const c = j.content
  const chapters = (Array.isArray(c.chapters) ? c.chapters : [])
    .map((ch: any) => `- ${ch?.title}: ${arr(ch?.mustCover).join('; ')}`)
    .join('\n')
  const contentText = [
    c.audience && `Audience and level: ${c.audience}`,
    arr(c.outcomes).length && `Learning outcomes:\n${arr(c.outcomes).map((x) => `- ${x}`).join('\n')}`,
    chapters && `Chapter plan (follow it):\n${chapters}`,
    arr(c.hiddenKnowledge).length && `Hidden knowledge that MUST appear (verify; only keep what you can stand behind):\n${arr(c.hiddenKnowledge).map((x) => `- ${x}`).join('\n')}`,
    Array.isArray(c.stories) && c.stories.length &&
      `Stories to retell, one opening each chapter (real and traceable; verify before using):\n${c.stories
        .map((x: any) => `- ${x?.chapter ?? ''}: [${x?.kind ?? 'History'}] ${x?.story ?? ''} (source: ${x?.source ?? 'unspecified'})`)
        .join('\n')}`,
    arr(c.misconceptions).length && `Misconceptions to correct:\n${arr(c.misconceptions).map((x) => `- ${x}`).join('\n')}`,
    arr(c.interactives).length && `Interactive features to build (all must work):\n${arr(c.interactives).map((x) => `- ${x}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  let visual: VisualDirection | null = null
  const v = j.visual
  if (v && typeof v === 'object') {
    visual = {
      mood: String(v.mood ?? ''),
      palette: (Array.isArray(v.palette) ? v.palette : [])
        .filter((p: any) => p && /^#[0-9a-f]{3,8}$/i.test(String(p.hex)))
        .map((p: any) => ({ name: String(p.name ?? ''), hex: String(p.hex), role: String(p.role ?? 'accent') })),
      fonts: { display: String(v.fonts?.display ?? ''), body: String(v.fonts?.body ?? '') },
      motif: String(v.motif ?? ''),
      hero: String(v.hero ?? ''),
      visualizations: (Array.isArray(v.visualizations) ? v.visualizations : []).map((x: any) => ({
        name: String(x?.name ?? ''),
        shows: String(x?.shows ?? ''),
        interaction: String(x?.interaction ?? ''),
        tech: x?.tech === 'svg' ? 'svg' : 'canvas',
      })),
      effects: arr(v.effects),
      animations: arr(v.animations),
      components: String(v.components ?? ''),
      avoid: arr(v.avoid),
    }
  }
  return { contentText, visual }
}

/** Text form of the visual direction for prompts. */
export function visualText(v: VisualDirection): string {
  return [
    `Mood: ${v.mood}`,
    v.palette.length && `Accent palette: ${v.palette.map((p) => `${p.name} ${p.hex} (${p.role})`).join(', ')}`,
    (v.fonts.display || v.fonts.body) && `Fonts: display "${v.fonts.display}", body "${v.fonts.body}"`,
    v.motif && `Signature motif: ${v.motif}`,
    v.hero && `Hero visual: ${v.hero}`,
    v.visualizations.length &&
      `Data visualizations:\n${v.visualizations.map((x) => `- ${x.name} (${x.tech}): shows ${x.shows}; interaction: ${x.interaction}`).join('\n')}`,
    v.effects.length && `Effects:\n${v.effects.map((x) => `- ${x}`).join('\n')}`,
    v.animations.length && `Animations:\n${v.animations.map((x) => `- ${x}`).join('\n')}`,
    v.components && `Component styling: ${v.components}`,
    v.avoid.length && `Avoid: ${v.avoid.join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n')
}
