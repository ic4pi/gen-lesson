import { useEffect, useMemo, useRef, useState } from 'react'
import { Anvil, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Composer from '@/sections/Composer'
import OutputPane from '@/sections/OutputPane'
import Library from '@/sections/Library'
import SettingsDialog from '@/sections/SettingsDialog'
import TopicQueue from '@/sections/TopicQueue'
import { DEFAULT_MODELS, DESIGNER_MODELS, PROVIDERS } from '@/lib/models'
import { chatOnce, streamChat } from '@/lib/llm'
import { parseContents } from '@/lib/parseContents'
import { enhanceCourseHtml, hasFx, stripFx } from '@/lib/fx'
import { designCourse } from '@/lib/design'
import { makeBrief } from '@/lib/brief'
import { runQA } from '@/lib/qa'
import { loadReference, REFERENCE_OPTIONS } from '@/lib/references'
import {
  CURRICULUM_SYSTEM,
  rebuildPrompt,
  qaRepairPrompt,
  coursePrompt,
  curriculumPrompt,
  TOPIC_SYSTEM,
  topicSuggestPrompt,
  parseSuggestions,
  isDuplicateTopic,
  looksTruncated,
  parseCourseHtml,
  parseCurriculum,
} from '@/lib/prompts'
import { db, uid } from '@/lib/db'
import { DEFAULT_PUBLISH, loadHexpo, publishCourse } from '@/lib/hexpo'
import { reviewCourse } from '@/lib/review'
import type {
  Course,
  GenState,
  Keys,
  ModelOption,
  ProviderId,
  PublishConfig,
  QueueItem,
  Series,
  Suggestion,
  VisualDirection,
  DecimalMeta,
} from '@/types'

const LS_KEYS = 'mf.keys'
const LS_MOTION = 'mf.motion'
const LS_MODEL = 'mf.model'
const LS_DESIGNER = 'mf.designer'
const LS_BUILDMODE = 'mf.buildMode'
const LS_REF = 'mf.ref'
const LS_FX = 'mf.fx'
const LS_CUSTOM = 'mf.customModels'
const LS_SUBJECT = 'mf.subject'
const LS_SUGGESTIONS = 'mf.suggestions'
const LS_QUEUE = 'mf.queue'

function loadJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}
const LS_PUBLISH = 'mf.publish'

interface GenOverride {
  topic: string
  notes: string
  meta?: DecimalMeta
  itemId?: string
  mode?: 'standalone' | 'new'
  series?: Series
  previous?: Course[]
}
interface GenResult {
  course: Course
  series: Series | null
}

const LS_AUTORUN = 'mf.autorun'
const sleep = (ms: number, signal: () => boolean) =>
  new Promise<void>((res) => {
    const t0 = Date.now()
    const id = setInterval(() => {
      if (signal() || Date.now() - t0 >= ms) {
        clearInterval(id)
        res()
      }
    }, 500)
  })

const IDLE: GenState = { phase: 'idle', message: '', chars: 0, planPreview: null }

/** HTTP statuses where retrying cannot help (bad key, no credits, model missing). */
const FATAL_STATUS = [401, 402, 403, 404]

export default function Home() {
  // ── persisted prefs ──────────────────────────────────────
  const [keys, setKeysState] = useState<Keys>(() => {
    try {
      return { openrouter: '', venice: '', nvidia: '', ...JSON.parse(localStorage.getItem(LS_KEYS) ?? '{}') }
    } catch {
      return { openrouter: '', venice: '', nvidia: '' }
    }
  })
  const [motion, setMotion] = useState(() => localStorage.getItem(LS_MOTION) !== 'off')
  const [customModels, setCustomModels] = useState<ModelOption[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_CUSTOM) ?? '[]')
    } catch {
      return []
    }
  })
  const [modelId, setModelId] = useState(
    () => localStorage.getItem(LS_MODEL) ?? 'openrouter:anthropic/claude-sonnet-4.5',
  )

  const [publish, setPublishState] = useState<PublishConfig>(() => {
    try {
      return { ...DEFAULT_PUBLISH, ...JSON.parse(localStorage.getItem(LS_PUBLISH) ?? '{}') }
    } catch {
      return DEFAULT_PUBLISH
    }
  })
  const setPublish = (p: PublishConfig) => {
    setPublishState(p)
    localStorage.setItem(LS_PUBLISH, JSON.stringify(p))
  }

  // ── library state ────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])

  // ── composer state ───────────────────────────────────────
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [seriesMode, setSeriesMode] = useState('standalone')

  // ── topic generator + queue ──────────────────────────────
  const [subject, setSubject] = useState(
    () => localStorage.getItem(LS_SUBJECT) ?? 'Esoteric and occult traditions for a hidden mystery school library',
  )
  const [count, setCount] = useState(10)
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => loadJson(LS_SUGGESTIONS, []))
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    loadJson<any[]>(LS_QUEUE, []).map((q) => ({ mode: 'standalone', status: 'pending', ...q })) as QueueItem[],
  )
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [queueRunning, setQueueRunning] = useState(false)
  const queueStopRef = useRef(false)
  const queueRef = useRef<QueueItem[]>(queue)
  const lastErrorRef = useRef('')
  const lastStatusRef = useRef(0)
  const [designerId, setDesignerId] = useState(
    () => localStorage.getItem(LS_DESIGNER) ?? 'openrouter:anthropic/claude-opus-4.1',
  )
  useEffect(() => {
    localStorage.setItem(LS_DESIGNER, designerId)
  }, [designerId])
  const designerRef = useRef(designerId)
  designerRef.current = designerId
  const [buildMode, setBuildMode] = useState<'single' | 'two-stage'>(
    () => (localStorage.getItem(LS_BUILDMODE) as 'single' | 'two-stage') || 'single',
  )
  const [refId, setRefId] = useState(() => localStorage.getItem(LS_REF) ?? REFERENCE_OPTIONS[0]?.id ?? 'none')
  const [fxOn, setFxOn] = useState(() => localStorage.getItem(LS_FX) === 'on')
  useEffect(() => localStorage.setItem(LS_BUILDMODE, buildMode), [buildMode])
  useEffect(() => localStorage.setItem(LS_REF, refId), [refId])
  useEffect(() => localStorage.setItem(LS_FX, fxOn ? 'on' : 'off'), [fxOn])
  const sizeMemo = useRef<Record<string, number>>({})
  const plannedSeriesId = useRef<string | null>(null)
  const buildModeRef = useRef(buildMode)
  buildModeRef.current = buildMode
  const refIdRef = useRef(refId)
  refIdRef.current = refId
  const fxRef = useRef(fxOn)
  fxRef.current = fxOn
  const modelRef = useRef(modelId)
  modelRef.current = modelId
  const keysRef = useRef(keys)
  keysRef.current = keys
  const seriesRef = useRef<Series[]>([])
  seriesRef.current = seriesList
  const coursesRef = useRef<Course[]>([])
  coursesRef.current = courses

  // ── generation state ─────────────────────────────────────
  const [gen, setGen] = useState<GenState>(IDLE)
  const [current, setCurrent] = useState<Course | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const models = useMemo(() => [...DEFAULT_MODELS, ...customModels], [customModels])
  const designerModels = useMemo(() => {
    const seen = new Set(DESIGNER_MODELS.map((m) => `${m.provider}:${m.id}`))
    return [...DESIGNER_MODELS, ...customModels.filter((m) => !seen.has(`${m.provider}:${m.id}`))]
  }, [customModels])

  // ── effects ──────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('no-motion', !motion)
    localStorage.setItem(LS_MOTION, motion ? 'on' : 'off')
  }, [motion])

  useEffect(() => {
    localStorage.setItem(LS_MODEL, modelId)
  }, [modelId])

  useEffect(() => {
    localStorage.setItem(LS_SUBJECT, subject)
  }, [subject])
  useEffect(() => {
    localStorage.setItem(LS_SUGGESTIONS, JSON.stringify(suggestions))
  }, [suggestions])
  useEffect(() => {
    localStorage.setItem(LS_QUEUE, JSON.stringify(queue))
  }, [queue])

  useEffect(() => {
    ;(async () => {
      try {
        const [c, s] = await Promise.all([db.allCourses(), db.allSeries()])
        // one-time upgrade: courses made before the black/animated layer existed
        const upgraded: Course[] = []
        const fixed = c.map((x) => {
          if (hasFx(x.html)) return x
          const ser = s.find((y) => y.id === x.seriesId)
          const u = {
            ...x,
            html: enhanceCourseHtml(x.html, {
              title: x.title,
              kicker: ser && x.part ? `Part ${x.part} of ${ser.plan.length} · ${ser.title}` : undefined,
            }),
          }
          upgraded.push(u)
          return u
        })
        for (const u of upgraded) await db.putCourse(u)
        if (upgraded.length) toast.success(`Upgraded ${upgraded.length} existing course${upgraded.length > 1 ? 's' : ''} — black theme, animation and Motion switch added`)
        setCourses(fixed)
        setSeriesList(s)
      } catch {
        toast.error('Could not open the local library database')
      }
      setLibraryLoaded(true)
    })()
  }, [])

  const setKeys = (k: Keys) => {
    setKeysState(k)
    localStorage.setItem(LS_KEYS, JSON.stringify(k))
  }

  const addCustomModel = (m: ModelOption) => {
    const next = [...customModels.filter((x) => !(x.id === m.id && x.provider === m.provider)), m]
    setCustomModels(next)
    localStorage.setItem(LS_CUSTOM, JSON.stringify(next))
    toast.success(`Added ${m.label}`)
  }

  // ── generation orchestration ─────────────────────────────
  /** Placement context for numbered (Esoteric Decimal System) items. */
  function decimalNotes(m: DecimalMeta, title: string, queue: QueueItem[], library: Course[], extra = ''): string {
    const sibs = [
      ...queue.filter((q) => q.meta?.division === m.division && q.meta.number !== m.number).map((q) => `${q.meta!.number} ${q.topic}`),
      ...library.filter((c) => c.meta?.division === m.division && c.meta.number !== m.number).map((c) => `${c.meta!.number} ${c.title}`),
    ]
    const uniq = [...new Set(sibs)].sort()
    const overview = /overview/i.test(m.kind)
    return [
      `LIBRARY PLACEMENT (Esoteric Decimal System): number ${m.number} · ${m.cls} › ${m.division} · ${m.kind}.`,
      overview
        ? `This is the OVERVIEW of its ${/class/i.test(m.kind) ? 'class' : 'division'}: map the whole field, teach the foundations and orientation, and point forward to the sibling masterclasses below, which each get their own full masterclass, so do not teach them in full here.`
        : `This is ONE focused section within "${m.division}": teach "${title}" in real depth with practical specificity, and do not re-teach what the sibling masterclasses cover; cross-reference them by title where useful.`,
      uniq.length ? `Sibling masterclasses in this division:\n${uniq.map((x) => `- ${x}`).join('\n')}` : '',
      extra.trim() ? `SCOPE AND ACCURACY NOTES FROM THE CURATOR (follow these):\n${extra.trim()}` : '',
      'Check what the existing library already says on this subject; build on it, never repeat it.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  /** Designer pass + Foundry fx. Never throws: on any failure the working undesigned page is kept. */
  async function finishHtml(
    raw: string,
    meta: { title: string; kicker?: string },
    signal?: AbortSignal,
    visual?: VisualDirection | null,
    forceDesigner = false,
  ): Promise<{ html: string; designedBy?: string }> {
    const fx = (h: string) => (fxRef.current ? enhanceCourseHtml(h, meta) : h)
    const designer = designerModels.find((m) => `${m.provider}:${m.id}` === designerRef.current)
    if (!designer || (buildModeRef.current === 'single' && !forceDesigner)) return { html: fx(raw) }
    const apiKey = keysRef.current[designer.provider].trim()
    if (!apiKey) {
      toast.warning(`No ${PROVIDERS[designer.provider].label} key for the designer — keeping the plain build`)
      return { html: fx(raw) }
    }
    setGen((g) => ({ ...g, phase: 'designing', chars: 0, message: `${designer.label} is styling the page…` }))
    try {
      let rejected: string | undefined
      for (let attempt = 1; attempt <= 2; attempt++) {
        const r = await designCourse({
          rawHtml: raw,
          title: meta.title,
          designer,
          apiKey,
          signal,
          rejected,
          visual,
          onProgress: (chars) => setGen((g) => ({ ...g, chars })),
        })
        if (r.ok) return { html: fx(r.html), designedBy: designer.id }
        rejected = r.reason
        if (attempt === 1) toast.message(`Design rejected (${r.reason}) — retrying once`)
        else toast.warning(`Designer output rejected twice (${r.reason}) — kept the plain build. Use Restyle to retry.`)
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      toast.warning(`Designer failed (${e?.message ?? 'error'}) — kept the plain build.`)
    }
    return { html: fx(raw) }
  }

  const fxMeta = (c: Course) => {
    const sr = c.seriesId ? seriesList.find((x) => x.id === c.seriesId) : undefined
    return {
      title: c.title,
      kicker: sr && c.part ? `Part ${c.part} of ${sr.plan.length} · ${sr.title}` : undefined,
    }
  }

  async function generate(ov?: GenOverride): Promise<GenResult | null> {
    const t = (ov ? ov.topic : topic).trim()
    const mode = ov ? (ov.mode ?? 'standalone') : seriesMode
    const model = models.find((m) => `${m.provider}:${m.id}` === modelRef.current)
    const existing = ov ? ov.series : seriesList.find((s) => s.id === seriesMode)

    if (!existing && !t) {
      toast.error('Give the masterclass a topic first')
      return null
    }
    if (!model) {
      toast.error('Pick a model')
      return null
    }
    const apiKey = keysRef.current[model.provider].trim()
    if (!apiKey) {
      setSettingsOpen(true)
      toast.error(`Add your ${PROVIDERS[model.provider].label} API key first`)
      return null
    }

    const abort = new AbortController()
    abortRef.current = abort
    setGen({ phase: 'planning', message: '', chars: 0, planPreview: null })
    const prog = (t: string) => {
      if (ov?.itemId) patchItem(ov.itemId, { progress: t })
    }

    try {
      // ── series resolution ──
      let series: Series | null = null
      let part: number | null = null
      let previousParts: Course[] = []
      let effTopic = t
      let effNotes = ov ? ov.notes : notes
      const dmeta = ov?.meta
      if (dmeta) effNotes = decimalNotes(dmeta, t, queueRef.current, coursesRef.current, ov?.notes)

      if (existing) {
        series = existing
        effTopic = existing.topic
        effNotes = existing.notes
        previousParts = (ov?.previous ?? courses.filter((c) => c.seriesId === existing.id)).sort(
          (a, b) => (a.part ?? 0) - (b.part ?? 0),
        )
        part = previousParts.length + 1
        if (part > existing.plan.length) throw new Error('This series is already complete.')
        setGen({ phase: 'writing', message: '', chars: 0, planPreview: existing.plan })
      } else if (mode === 'new') {
        setGen((g) => ({ ...g, phase: 'planning', message: 'Designing the curriculum…' }))
        const raw = await chatOnce({
          provider: model.provider,
          apiKey,
          model: model.id,
          messages: [
            { role: 'system', content: CURRICULUM_SYSTEM },
            { role: 'user', content: curriculumPrompt(t, effNotes) },
          ],
          maxTokens: 2048,
          temperature: 0.4,
          signal: abort.signal,
        })
        const plan = parseCurriculum(raw)
        if (!plan) throw new Error('The model returned an unreadable curriculum plan. Try again or switch model.')
        series = {
          id: uid(),
          title: plan.seriesTitle,
          topic: t,
          notes: effNotes,
          plan: plan.parts,
          createdAt: Date.now(),
        }
        await db.putSeries(series)
        setSeriesList((s) => [...s, series!])
        plannedSeriesId.current = series.id
        if (ov?.itemId) patchItem(ov.itemId, { seriesId: series.id })
        part = 1
        if (!ov) setSeriesMode(series.id)
        setGen({ phase: 'writing', message: '', chars: 0, planPreview: plan.parts })
      } else {
        setGen({ phase: 'writing', message: '', chars: 0, planPreview: null })
      }

      const tag = series && part ? `Part ${part}/${series.plan.length}` : 'Building'
      prog(`${tag} · creative brief`)
      // ── creative brief: the model writes its own build requirements + art direction ──
      let visual: VisualDirection | null = series?.design ?? null
      let briefText = ''
      setGen((g) => ({ ...g, phase: 'planning', message: 'Writing the creative brief…' }))
      try {
        const b = await makeBrief({
          model,
          apiKey,
          topic: effTopic,
          notes: effNotes,
          series,
          part,
          needVisual: !visual,
          signal: abort.signal,
        })
        if (b) {
          briefText = b.contentText
          if (!visual && b.visual) {
            visual = b.visual
            if (series) {
              series = { ...series, design: visual }
              await db.putSeries(series)
              const sid = series.id
              const upd = series
              setSeriesList((l) => l.map((x) => (x.id === sid ? upd : x)))
            }
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        toast.warning(`Creative brief failed (${e?.message ?? 'error'}) — building without it`)
      }
      setGen((g) => ({ ...g, phase: 'writing', message: '' }))

      const referenceText = buildModeRef.current === 'single' ? await loadReference(refIdRef.current) : null

      // ── write the course (shrinks the request automatically if the provider rejects it) ──
      const buildPrompt = (withRef: boolean) =>
        coursePrompt({
          topic: effTopic,
          notes: briefText ? `${effNotes}\n\nBUILD REQUIREMENTS FROM THE CREATIVE DIRECTOR (treat as mandatory):\n${briefText}` : effNotes,
          series,
          part,
          previousParts,
          visual,
          mode: buildModeRef.current,
          reference: withRef ? referenceText : null,
          fx: fxRef.current,
        })
      const cap = model.maxOut ?? 32000
      const attempts = [
        { max: Math.min(32000, cap), ref: true },
        { max: Math.min(16000, cap), ref: true },
        { max: Math.min(12000, cap), ref: false },
        { max: Math.min(8000, cap), ref: false },
      ].filter((a, i, arr) => i === 0 || a.max !== arr[i - 1].max || a.ref !== arr[i - 1].ref)
      let acc = ''
      let lastProg = 0
      let lastErr: any = null
      for (let ai = Math.min(sizeMemo.current[`${model.provider}:${model.id}`] ?? 0, attempts.length - 1); ai < attempts.length; ai++) {
        const at = attempts[ai]
        acc = ''
        try {
          for await (const delta of streamChat({
            provider: model.provider,
            apiKey,
            model: model.id,
            messages: [{ role: 'user', content: buildPrompt(at.ref) }],
            maxTokens: at.max,
            temperature: 0.7,
            signal: abort.signal,
          })) {
            acc += delta
            setGen((g) => ({ ...g, chars: acc.length }))
            if (acc.length - lastProg > 3000) {
              lastProg = acc.length
              prog(`${tag} · writing ${(acc.length / 1000).toFixed(0)}k chars`)
            }
          }
          lastErr = null
          sizeMemo.current[`${model.provider}:${model.id}`] = ai
          break
        } catch (e: any) {
          lastErr = e
          if (e?.name === 'AbortError') throw e
          // 400/413/422: the request itself was refused (too long, output limit too high): retry smaller
          if ([400, 413, 422].includes(e?.status) && ai < attempts.length - 1) {
            const nx = attempts[ai + 1]
            toast.message(`${model.label} refused the request; retrying smaller`, {
              description: `${String(e.detail ?? e.message).slice(0, 140)} → output limit ${nx.max}${nx.ref ? '' : ', no style reference'}`,
            })
            continue
          }
          throw e
        }
      }
      if (lastErr) throw lastErr

      // ── assemble ──
      setGen((g) => ({ ...g, phase: 'assembling', message: 'Extracting the document…' }))
      const parsed = parseCourseHtml(acc)
      if (!parsed.html || parsed.html.length < 800)
        throw new Error('The model did not return a usable HTML document. Retry — flagship models handle this best.')
      if (looksTruncated(parsed.html))
        toast.warning('The document looks cut off mid-stream — regenerate with a higher-context model if sections are missing.')

      // ── quality gate: test the page in a hidden browser, repair what is broken ──
      let rawFinal = parsed.html
      let qa = { passed: true, problems: [] as string[], at: Date.now() }
      let repairs = 0
      try {
        setGen((g) => ({ ...g, phase: 'assembling', message: 'Testing the page in a browser…' }))
        prog(`${tag} · testing the page`)
        qa = await runQA(rawFinal)
        while (!qa.passed && repairs < 2 && !abort.signal.aborted) {
          repairs++
          toast.message(`Quality check found ${qa.problems.length} issue(s); repairing (${repairs}/2)`, {
            description: qa.problems.slice(0, 2).join(' · '),
          })
          prog(`${tag} · repairing (${repairs}/2)`)
          setGen((g) => ({ ...g, phase: 'writing', chars: 0, message: 'Repairing…' }))
          let fixedRaw = ''
          for await (const delta of streamChat({
            provider: model.provider,
            apiKey,
            model: model.id,
            messages: [{ role: 'user', content: qaRepairPrompt({ html: rawFinal, problems: qa.problems }) }],
            maxTokens: 32000,
            temperature: 0.3,
            signal: abort.signal,
          })) {
            fixedRaw += delta
            setGen((g) => ({ ...g, chars: fixedRaw.length }))
          }
          const fixed = parseCourseHtml(fixedRaw)
          if (!fixed.html || looksTruncated(fixed.html)) break
          const next = await runQA(fixed.html)
          if (next.problems.length <= qa.problems.length) {
            rawFinal = fixed.html
            qa = next
          } else break
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        // a failing checker must never lose a finished course
      }

      const fallbackTitle = series ? `${series.title} — Part ${part}` : t
      const finalTitle = parsed.title ?? fallbackTitle
      prog(`${tag} · finishing`)
      const finished = await finishHtml(
        rawFinal,
        {
          title: finalTitle,
          kicker: dmeta
            ? `${dmeta.number} · ${dmeta.division.replace(/^\d+\s*/, '')}`
            : series && part
              ? `Part ${part} of ${series.plan.length} · ${series.title}`
              : undefined,
        },
        abort.signal,
        visual,
      )
      const html = finished.html
      const course: Course = {
        id: uid(),
        seriesId: series?.id ?? null,
        part,
        title: finalTitle,
        topic: effTopic,
        notes: effNotes,
        modelId: model.id,
        provider: model.provider,
        html,
        rawHtml: rawFinal,
        qa: { passed: qa.passed, problems: qa.problems, at: qa.at, repairs },
        meta: dmeta,
        visual: visual ?? undefined,
        designedBy: finished.designedBy,
        summary: parsed.summary,
        topicsCovered: parsed.topicsCovered,
        createdAt: Date.now(),
      }
      await db.putCourse(course)
      setCourses((c) => [...c, course])
      setCurrent(course)
      setGen(IDLE)
      toast.success(`“${course.title}” is ready`, {
        description: `${(course.html.length / 1000).toFixed(0)}k characters · preview is live`,
      })
      return { course, series }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setGen(IDLE)
        toast('Generation cancelled')
      } else {
        lastErrorRef.current = e?.message ?? 'Generation failed'
        lastStatusRef.current = e?.status ?? 0
        setGen({ phase: 'error', message: e?.message ?? 'Generation failed', chars: 0, planPreview: null })
        toast.error(e?.message ?? 'Generation failed')
      }
      return null
    } finally {
      abortRef.current = null
    }
  }

  // ── topic suggestions + queue ────────────────────────────
  const knownTitles = () => [
    ...courses.flatMap((c) => [c.title, c.topic]),
    ...seriesList.flatMap((s) => [s.title, s.topic]),
  ]

  async function suggestTopics() {
    const model = models.find((m) => `${m.provider}:${m.id}` === modelId)
    if (!model) return toast.error('Pick a model')
    const apiKey = keys[model.provider].trim()
    if (!apiKey) {
      setSettingsOpen(true)
      return toast.error(`Add your ${PROVIDERS[model.provider].label} API key first`)
    }
    setSuggesting(true)
    try {
      const known = [...new Set(knownTitles())]
      const pending = [...queue.map((q) => q.topic), ...suggestions.map((s) => s.topic)]
      const raw = await chatOnce({
        provider: model.provider,
        apiKey,
        model: model.id,
        messages: [
          { role: 'system', content: TOPIC_SYSTEM },
          { role: 'user', content: topicSuggestPrompt(subject.trim(), count, [...known, ...pending].slice(0, 300)) },
        ],
        maxTokens: 8192,
        temperature: 0.9,
      })
      const all = parseSuggestions(raw)
      if (!all.length) throw new Error('The model returned no usable topics. Try again or switch model.')
      const blocked = [...known, ...pending]
      const fresh: Suggestion[] = []
      for (const s of all) {
        if (isDuplicateTopic(s.topic, [...blocked, ...fresh.map((f) => f.topic)])) continue
        fresh.push({ id: uid(), topic: s.topic, angle: s.angle, checked: false })
      }
      const dropped = all.length - fresh.length
      setSuggestions([...suggestions, ...fresh])
      toast.success(`${fresh.length} new topics`, {
        description: dropped ? `${dropped} skipped — already in your library or queue` : undefined,
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'Topic generation failed')
    } finally {
      setSuggesting(false)
    }
  }

  // all queue edits go through here so the running loop and the UI never disagree
  const updateQueue = (fn: (q: QueueItem[]) => QueueItem[]) => {
    queueRef.current = fn(queueRef.current)
    setQueue(queueRef.current)
  }
  const patchItem = (id: string, patch: Partial<QueueItem>) =>
    updateQueue((q) => q.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const newItem = (topic: string, notes: string, mode: QueueItem['mode'], meta?: DecimalMeta): QueueItem => ({
    id: uid(),
    topic,
    notes,
    mode: meta ? 'standalone' : mode,
    status: 'pending',
    meta,
  })

  function addSelectedToQueue(mode: QueueItem['mode']) {
    const picked = suggestions.filter((s) => s.checked)
    updateQueue((q) => [...q, ...picked.map((s) => newItem(s.topic, s.angle, mode))])
    setSuggestions(suggestions.filter((s) => !s.checked))
    toast.success(`${picked.length} added to queue`)
  }

  function importContents(text: string, mode: QueueItem['mode'], waves?: number[]) {
    const parsed = parseContents(text).filter((p) => !p.meta || !waves || waves.includes(p.meta.wave ?? 0))
    if (!parsed.length) {
      toast.error('Found no topics in that text')
      return 0
    }
    const haveNumbers = new Set([
      ...coursesRef.current.map((c) => c.meta?.number),
      ...queueRef.current.map((q) => q.meta?.number),
    ])
    const blocked = [...knownTitles(), ...queueRef.current.map((q) => q.topic)]
    const fresh: QueueItem[] = []
    for (const p of parsed) {
      if (p.meta) {
        // numbered items are identified by their decimal number, not their title
        if (haveNumbers.has(p.meta.number)) continue
        fresh.push(newItem(p.topic, p.notes, mode, p.meta))
        continue
      }
      if (isDuplicateTopic(p.topic, [...blocked, ...fresh.map((f) => f.topic)])) continue
      fresh.push(newItem(p.topic, p.notes, mode))
    }
    updateQueue((q) => [...q, ...fresh])
    toast.success(`${fresh.length} topics queued`, {
      description: parsed.length > fresh.length ? `${parsed.length - fresh.length} skipped — already in your library or queue` : undefined,
    })
    return fresh.length
  }

  function moveItem(id: string, dir: -1 | 1) {
    updateQueue((q) => {
      const i = q.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= q.length) return q
      if (q[i].status === 'running' || q[j].status === 'running') return q
      const n = [...q]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  }
  const removeItem = (id: string) => updateQueue((q) => q.filter((x) => x.id !== id))
  const toggleItemMode = (id: string) =>
    updateQueue((q) =>
      q.map((x) => (x.id === id ? { ...x, mode: x.mode === 'series' ? 'standalone' : 'series' } : x)),
    )
  const rerunItem = (id: string) =>
    patchItem(id, { status: 'pending', seriesId: undefined, progress: undefined, error: undefined })
  const clearDone = () => updateQueue((q) => q.filter((x) => x.status !== 'done'))

  /** Run one generation, retrying transient failures (rate limits, network, bad output). */
  async function genWithRetry(ov: GenOverride): Promise<GenResult | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // a retry of "plan + part 1" must reuse the series it already planned, not plan a new one
      const planned = ov.mode === 'new' && attempt > 1 && plannedSeriesId.current
        ? seriesRef.current.find((x) => x.id === plannedSeriesId.current)
        : undefined
      lastStatusRef.current = 0
      const r = await generate(
        planned ? { topic: planned.topic, notes: planned.notes, series: planned, previous: [], itemId: ov.itemId } : ov,
      )
      if (r) return r
      if (queueStopRef.current) return null
      // key/credit/model errors never fix themselves: retrying only burns money
      if (FATAL_STATUS.includes(lastStatusRef.current)) return null
      if (attempt < 3) {
        if (ov.itemId)
          patchItem(ov.itemId, {
            progress: `Attempt ${attempt}/3 failed: ${String(lastErrorRef.current || 'unknown error').slice(0, 220)}. Retrying in ${attempt * 30}s`,
          })
        toast(`Retrying in ${attempt * 30}s (attempt ${attempt + 1}/3)…`, { description: String(lastErrorRef.current || '').slice(0, 160) })
        await sleep(attempt * 30_000, () => queueStopRef.current)
        if (queueStopRef.current) return null
      }
    }
    return null
  }

  /** Queue hook: review (and rebuild if needed) then push to hexpo. Never fails the build itself. */
  async function autoPublish(c: Course, item?: QueueItem) {
    if (publish.autoPublish === false || !publish.token.trim()) return
    try {
      if (item) patchItem(item.id, { progress: `Publishing "${c.title}"…` })
      await publishCurrent(coursesRef.current.find((x) => x.id === c.id) ?? c)
    } catch (e: any) {
      toast.error(`Publish failed for "${c.title}": ${e?.message ?? 'error'}`, { duration: 9000 })
    }
  }

  const [buildingSeries, setBuildingSeries] = useState<string | null>(null)

  /** Library: build every pending part of a series, in order, auto-publishing each. */
  async function buildRemaining(seriesId: string) {
    if (buildingSeries || queueRunning) return void toast.error('Something is already building')
    const model = models.find((m) => `${m.provider}:${m.id}` === modelRef.current)
    if (!model) return void toast.error('Pick a model')
    if (!keysRef.current[model.provider].trim()) {
      setSettingsOpen(true)
      return void toast.error(`Add your ${PROVIDERS[model.provider].label} API key first`)
    }
    const series = seriesRef.current.find((x) => x.id === seriesId)
    if (!series) return
    queueStopRef.current = false
    setBuildingSeries(seriesId)
    try {
      let parts = coursesRef.current.filter((c) => c.seriesId === seriesId)
      while (parts.length < series.plan.length && !queueStopRef.current) {
        toast.message(`${series.title}: building part ${parts.length + 1}/${series.plan.length}`)
        const r = await genWithRetry({ topic: series.topic, notes: series.notes, series, previous: parts })
        if (!r) return void toast.error(`Stopped at part ${parts.length + 1} — ${String(lastErrorRef.current || 'build failed').slice(0, 160)}`)
        parts = [...parts, r.course]
        await autoPublish(r.course)
      }
      if (parts.length >= series.plan.length) toast.success(`${series.title}: all ${series.plan.length} parts built`)
    } finally {
      setBuildingSeries(null)
    }
  }

  async function processItem(item: QueueItem): Promise<boolean> {
    if (item.mode === 'standalone') {
      const r = await genWithRetry({ topic: item.topic, notes: item.notes, meta: item.meta, itemId: item.id })
      if (r) await autoPublish(r.course, item)
      return !!r
    }

    let series = item.seriesId ? (seriesRef.current.find((s) => s.id === item.seriesId) ?? null) : null
    let parts: Course[] = series ? coursesRef.current.filter((c) => c.seriesId === series!.id) : []
    if (!series) {
      patchItem(item.id, { progress: 'Planning series…' })
      plannedSeriesId.current = null
      const r = await genWithRetry({ topic: item.topic, notes: item.notes, mode: 'new', itemId: item.id })
      if (!r?.series) return false
      series = r.series
      parts = [r.course]
      patchItem(item.id, { seriesId: series.id })
      await autoPublish(r.course, item)
    }
    while (parts.length < series.plan.length) {
      patchItem(item.id, { progress: `Part ${parts.length + 1}/${series.plan.length}` })
      if (queueStopRef.current) return false
      const r = await genWithRetry({ topic: series.topic, notes: series.notes, series, previous: parts, itemId: item.id })
      if (!r) return false
      parts = [...parts, r.course]
      await autoPublish(r.course, item)
    }
    return true
  }

  async function runQueue() {
    if (queueRunning) return
    const model = models.find((m) => `${m.provider}:${m.id}` === modelRef.current)
    if (!model) return void toast.error('Pick a model')
    if (!keysRef.current[model.provider].trim()) {
      setSettingsOpen(true)
      return void toast.error(`Add your ${PROVIDERS[model.provider].label} API key first`)
    }
    queueStopRef.current = false
    localStorage.setItem(LS_AUTORUN, 'on')
    setQueueRunning(true)
    let wake: any = null
    try {
      wake = await (navigator as any).wakeLock?.request('screen')
    } catch {
      // wake lock unavailable — the computer may sleep
    }
    let built = 0
    let failed = 0
    let streak = 0
    try {
      for (;;) {
        // a 'running' leftover (page reload mid-build) is resumed like a pending one
        const item = queueRef.current.find((x) => x.status === 'pending' || x.status === 'running')
        if (!item || queueStopRef.current) break
        // already built (e.g. the tab closed after saving but before the queue was updated): don't build it twice
        if (item.meta && coursesRef.current.some((c) => c.meta?.number === item.meta!.number)) {
          patchItem(item.id, { status: 'done', progress: undefined })
          continue
        }
        patchItem(item.id, { status: 'running', error: undefined })
        const ok = await processItem(item)
        if (queueStopRef.current) {
          patchItem(item.id, { status: 'pending', progress: undefined })
          break
        }
        if (ok) {
          built++
          streak = 0
          patchItem(item.id, { status: 'done', progress: undefined })
        } else {
          failed++
          streak++
          if (FATAL_STATUS.includes(lastStatusRef.current) || streak >= 3) {
            toast.error(`Queue stopped after ${streak} failure(s) in a row — ${String(lastErrorRef.current).slice(0, 160)}`, { duration: 15000 })
            patchItem(item.id, { status: 'failed', progress: undefined, error: lastErrorRef.current || 'Failed' })
            queueStopRef.current = true
            localStorage.removeItem(LS_AUTORUN)
            break
          }
          patchItem(item.id, { status: 'failed', progress: undefined, error: lastErrorRef.current || 'Failed' })
        }
      }
    } finally {
      wake?.release?.().catch(() => {})
      setQueueRunning(false)
      if (!queueStopRef.current) localStorage.removeItem(LS_AUTORUN)
      if (built || failed)
        toast.success(`Queue finished — ${built} built${failed ? `, ${failed} failed` : ''}`)
    }
  }

  function stopQueue() {
    queueStopRef.current = true
    localStorage.removeItem(LS_AUTORUN)
    abortRef.current?.abort()
  }

  // resume an interrupted run (tab closed / reloaded mid-queue)
  useEffect(() => {
    if (!libraryLoaded) return
    if (localStorage.getItem(LS_AUTORUN) === 'on' && queueRef.current.some((x) => x.status === 'pending' || x.status === 'running')) {
      toast('Resuming your queue…')
      void runQueue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded])

  // ── review + publish ─────────────────────────────────────
  const reviewer = models.find((m) => `${m.provider}:${m.id}` === publish.reviewerModelId) ?? null

  async function saveCourse(c: Course) {
    await db.putCourse(c)
    setCourses((all) => all.map((x) => (x.id === c.id ? c : x)))
    setCurrent((cur) => (cur?.id === c.id ? c : cur))
  }

  async function runReview(c: Course): Promise<Course> {
    if (!reviewer) throw new Error('Pick a reviewer model in Keys → Publish')
    const apiKey = keys[reviewer.provider].trim()
    if (!apiKey) {
      setSettingsOpen(true)
      throw new Error(`Add your ${PROVIDERS[reviewer.provider].label} API key for the reviewer`)
    }
    const { tax } = await loadHexpo(publish)
    const review = await reviewCourse({ course: c, reviewer, apiKey, tax, threshold: publish.threshold })
    const next = { ...c, review }
    await saveCourse(next)
    return next
  }

  async function reviewCurrent() {
    if (!current) return
    const { review } = await runReview(current)
    review!.passed
      ? toast.success(`Passed — ${review!.valueScore}/100`, { description: review!.worthIt })
      : toast.warning(`Not publishable — ${review!.valueScore}/100`, { description: review!.worthIt })
  }

  /** Review → rebuild with the editor's notes → review again, until it passes or rounds run out. */
  async function autoImprove(target: Course | null = current): Promise<Course | null> {
    const base = target
    if (!base) return null
    const writer = models.find((m) => m.id === base.modelId && m.provider === base.provider)
    const writerKey = keys[base.provider].trim()
    if (!writer || !writerKey) {
      setSettingsOpen(true)
      throw new Error(`Rebuilding needs the original writer (${base.modelId}) and its API key`)
    }
    const rounds = Math.max(1, publish.maxRounds || 3)
    let cur = await runReview(base)
    let best = cur
    for (let round = 1; round <= rounds && !cur.review!.passed; round++) {
      const r = cur.review!
      toast.message(`Rebuild ${round}/${rounds}`, {
        description: `Scored ${r.valueScore}/100 — fixing ${r.issues.length} issue(s) and deepening content…`,
      })
      const weak = Object.entries(r.scores)
        .filter(([, v]) => v < 7)
        .map(([k, v]) => `${k} ${v}/10`)
      let acc = ''
      for await (const delta of streamChat({
        provider: writer.provider,
        apiKey: writerKey,
        model: writer.id,
        messages: [
          {
            role: 'user',
            content: rebuildPrompt({
              topic: cur.topic,
              notes: cur.notes,
              html: cur.rawHtml ?? stripFx(cur.html),
              verdict: r.verdict,
              worthIt: r.worthIt,
              issues: r.issues,
              weak,
            }),
          },
        ],
        maxTokens: 32000,
        temperature: 0.5,
      })) {
        acc += delta
        setGen((g) => ({ ...g, chars: acc.length }))
      }
      const parsed = parseCourseHtml(acc)
      if (!parsed.html || parsed.html.length < 800 || looksTruncated(parsed.html)) {
        toast.error('Rebuild came back incomplete — keeping the previous version')
        break
      }
      const rebuilt: Course = {
        ...cur,
        html: fxRef.current ? enhanceCourseHtml(parsed.html, fxMeta({ ...cur, title: parsed.title ?? cur.title })) : parsed.html,
        rawHtml: parsed.html,
        designedBy: undefined,
        title: parsed.title ?? cur.title,
        summary: parsed.summary || cur.summary,
        topicsCovered: parsed.topicsCovered.length ? parsed.topicsCovered : cur.topicsCovered,
        review: undefined,
      }
      await saveCourse(rebuilt)
      cur = await runReview(rebuilt)
      if (cur.review!.valueScore >= best.review!.valueScore || cur.review!.passed) best = cur
    }
    if (best !== cur) await saveCourse(best) // a later rebuild scored worse — restore the best one
    if (best.rawHtml && !best.designedBy && best.review!.passed && buildModeRef.current === 'two-stage' && designerRef.current !== 'none') {
      const fin = await finishHtml(best.rawHtml, fxMeta(best), undefined, best.visual)
      if (fin.designedBy) {
        // content was verified unchanged by the designer check, so the review still applies
        best = { ...best, html: fin.html, designedBy: fin.designedBy, review: { ...best.review!, htmlLength: fin.html.length } }
        await saveCourse(best)
      }
      setGen(IDLE)
    }
    const r = best.review!
    r.passed
      ? toast.success(`Passed — ${r.valueScore}/100`, { description: 'Ready to publish.' })
      : toast.warning(`Still not publishable after ${rounds} rebuild(s) — best ${r.valueScore}/100`, {
          description: r.worthIt,
        })
    return best
  }

  async function redesignCurrent() {
    if (!current) return
    if (designerRef.current === 'none') throw new Error('Pick a designer model first')
    const raw = current.rawHtml ?? stripFx(current.html)
    const fin = await finishHtml(raw, fxMeta(current), undefined, current.visual, true)
    setGen(IDLE)
    if (!fin.designedBy) return
    const next: Course = {
      ...current,
      rawHtml: raw,
      html: fin.html,
      designedBy: fin.designedBy,
      review: current.review ? { ...current.review, htmlLength: fin.html.length } : undefined,
    }
    await saveCourse(next)
    toast.success('Restyled', { description: `Designed by ${fin.designedBy}` })
  }

  async function publishCurrent(target: Course | null = current) {
    if (!target) return
    const out = await publishCourse(publish, target, (s) => toast.message(s))
    await saveCourse({
      ...target,
      published: { id: out.id, file: out.file, at: Date.now(), commit: out.commit },
    })
    toast.success(out.updated ? 'Updated in hexpo' : 'Pushed to hexpo', {
      description: `${out.file} committed to ${publish.branch}. Your deploy and library rebuild start automatically.`,
    })
  }

  /** Library one-click: review → rebuild until it passes → push to hexpo. Returns true if published. */
  async function reviewAndPublish(c: Course): Promise<boolean> {
    await publishCurrent(c) // you are the reviewer; no model calls
    return true
  }

  async function publishFromLibrary(c: Course) {
    try {
      await reviewAndPublish(c)
    } catch (e: any) {
      toast.error(e?.message ?? 'Publish failed', { duration: 9000 })
    }
  }

  async function publishAllUnpublished() {
    const todo = coursesRef.current.filter((c) => !c.published)
    if (!todo.length) return toast('Nothing to publish — everything is already in hexpo')
    let ok = 0
    for (const c of todo) {
      try {
        if (await reviewAndPublish(c)) ok++
      } catch (e: any) {
        toast.error(`${c.title}: ${e?.message ?? 'failed'}`, { duration: 9000 })
      }
    }
    toast.success(`Published ${ok} of ${todo.length}`)
  }

  // ── library ops ──────────────────────────────────────────
  async function deleteCourse(id: string) {
    await db.delCourse(id)
    setCourses((c) => c.filter((x) => x.id !== id))
    if (current?.id === id) setCurrent(null)
    toast.success('Course deleted')
  }

  async function deleteSeries(id: string) {
    await db.delSeries(id)
    const doomed = courses.filter((c) => c.seriesId === id)
    for (const c of doomed) await db.delCourse(c.id)
    setSeriesList((s) => s.filter((x) => x.id !== id))
    setCourses((c) => c.filter((x) => x.seriesId !== id))
    if (current?.seriesId === id) setCurrent(null)
    if (seriesMode === id) setSeriesMode('standalone')
    toast.success('Series and its parts deleted')
  }

  async function exportBackup() {
    const payload = JSON.stringify({ version: 1, series: seriesList, courses }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `masterclass-foundry-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function importBackup(file: File) {
    try {
      const j = JSON.parse(await file.text())
      const inSeries: Series[] = Array.isArray(j.series) ? j.series : []
      const inCourses: Course[] = Array.isArray(j.courses) ? j.courses : []
      for (const s of inSeries) await db.putSeries(s)
      for (const c of inCourses) await db.putCourse(c)
      setSeriesList(await db.allSeries())
      setCourses(await db.allCourses())
      toast.success(`Imported ${inCourses.length} courses across ${inSeries.length} series`)
    } catch {
      toast.error('That file is not a valid Foundry backup')
    }
  }

  const busy = queueRunning || gen.phase === 'planning' || gen.phase === 'writing' || gen.phase === 'assembling' || gen.phase === 'designing'

  return (
    <div className="min-h-dvh">
      <div className="ambient" aria-hidden>
        <div className="orb" />
        <div className="orb o2" />
      </div>

      {/* ── header ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Anvil className="h-5 w-5 text-primary" />
            <span className="font-display text-[15px] font-bold tracking-tight">
              Masterclass Foundry
            </span>
            <span className="label-mono hidden md:inline">Course Generation Studio</span>
          </div>

          <div className="flex items-center gap-5">
            {/* provider LEDs */}
            <div className="hidden items-center gap-3 sm:flex">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-1.5"
                  title={`${PROVIDERS[id].label}: ${keys[id] ? 'key set' : 'no key'}`}
                >
                  <span className={`led ${keys[id] ? 'on' : ''}`} />
                  <span className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {PROVIDERS[id].label}
                  </span>
                </button>
              ))}
            </div>

            {/* motion pill toggle */}
            <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5">
              <Label htmlFor="motion" className="label-mono cursor-pointer !text-[10px]">
                Motion
              </Label>
              <Switch id="motion" checked={motion} onCheckedChange={setMotion} />
            </div>

            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Keys
            </Button>
          </div>
        </div>
      </header>

      {/* ── main ── */}
      <main className="mx-auto max-w-[1440px] px-4 pb-20 pt-8 lg:px-8">
        <div className="mb-8 rise">
          <h1 className="font-display text-3xl font-bold tracking-tight lg:text-4xl">
            Feed it a topic.{' '}
            <span className="text-primary">Ship an interactive course.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            One topic in — a complete, self-contained, beautifully themed HTML masterclass out.
            Run it as a series and every new part picks up exactly where the last one stopped,
            without repeating a single lesson.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="rounded-lg border border-border bg-card/60 p-5 backdrop-blur-sm">
            <p className="label-mono mb-4">Compose</p>
            <Composer
              topic={topic}
              setTopic={setTopic}
              notes={notes}
              setNotes={setNotes}
              seriesMode={seriesMode}
              setSeriesMode={setSeriesMode}
              seriesList={seriesList}
              courses={courses}
              models={models}
              modelId={modelId}
              setModelId={setModelId}
              designerModels={designerModels}
              buildMode={buildMode}
              setBuildMode={setBuildMode}
              refId={refId}
              setRefId={setRefId}
              refOptions={REFERENCE_OPTIONS}
              fxOn={fxOn}
              setFxOn={setFxOn}
              designerId={designerId}
              setDesignerId={setDesignerId}
              onAddCustom={addCustomModel}
              onGenerate={() => generate()}
              onCancel={stopQueue}
              gen={gen}
            />
          </div>
          <div className="rise rise-1">
            <OutputPane
              gen={gen}
              course={current}
              reviewerLabel={reviewer ? reviewer.label : null}
              hexpoRepo={publish.repo}
              onReview={reviewCurrent}
              onAutoFix={async () => { await autoImprove() }}
              onRedesign={redesignCurrent}
              onPublish={() => publishCurrent()}
            />
            {gen.phase === 'error' && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {gen.message}
              </p>
            )}
          </div>
        </div>

        <TopicQueue
          subject={subject}
          setSubject={setSubject}
          count={count}
          setCount={setCount}
          suggestions={suggestions}
          setSuggestions={setSuggestions}
          queue={queue}
          suggesting={suggesting}
          queueRunning={queueRunning}
          busy={busy}
          onSuggest={suggestTopics}
          onAddToQueue={addSelectedToQueue}
          onImport={importContents}
          onRunQueue={runQueue}
          onStopQueue={stopQueue}
          onMove={moveItem}
          onRemove={removeItem}
          onToggleMode={toggleItemMode}
          onRerun={rerunItem}
          onClearDone={clearDone}
        />

        <Library
          courses={courses}
          seriesList={seriesList}
          onPreview={setCurrent}
          onPublish={publishFromLibrary}
          onPublishAll={publishAllUnpublished}
          onBuildRemaining={buildRemaining}
          buildingSeries={buildingSeries}
          onDeleteCourse={deleteCourse}
          onDeleteSeries={deleteSeries}
          onExport={exportBackup}
          onImport={importBackup}
        />

        <footer className="mt-16 border-t border-border pt-6">
          <p className="font-mono2 text-[11px] leading-relaxed text-muted-foreground">
            Your keys, courses and series never leave this browser — calls go straight to the
            provider you chose. Clearing browser data wipes the library, so export a backup
            regularly.
          </p>
        </footer>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} keys={keys} setKeys={setKeys} models={models} publish={publish} setPublish={setPublish} />
      {busy && <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-secondary"><div className="h-full w-1/3 animate-pulse bg-primary" style={{ animationDuration: '1.2s' }} /></div>}
    </div>
  )
}
