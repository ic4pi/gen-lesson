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
import { DEFAULT_MODELS, PROVIDERS } from '@/lib/models'
import { chatOnce, streamChat } from '@/lib/llm'
import { parseContents } from '@/lib/parseContents'
import { enhanceCourseHtml, hasFx } from '@/lib/fx'
import {
  CURRICULUM_SYSTEM,
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
} from '@/types'

const LS_KEYS = 'mf.keys'
const LS_MOTION = 'mf.motion'
const LS_MODEL = 'mf.model'
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

    try {
      // ── series resolution ──
      let series: Series | null = null
      let part: number | null = null
      let previousParts: Course[] = []
      let effTopic = t
      let effNotes = ov ? ov.notes : notes

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
        part = 1
        if (!ov) setSeriesMode(series.id)
        setGen({ phase: 'writing', message: '', chars: 0, planPreview: plan.parts })
      } else {
        setGen({ phase: 'writing', message: '', chars: 0, planPreview: null })
      }

      // ── write the course ──
      let acc = ''
      for await (const delta of streamChat({
        provider: model.provider,
        apiKey,
        model: model.id,
        messages: [
          {
            role: 'user',
            content: coursePrompt({
              topic: effTopic,
              notes: effNotes,
              series,
              part,
              previousParts,
            }),
          },
        ],
        maxTokens: 32000,
        temperature: 0.7,
        signal: abort.signal,
      })) {
        acc += delta
        setGen((g) => ({ ...g, chars: acc.length }))
      }

      // ── assemble ──
      setGen((g) => ({ ...g, phase: 'assembling', message: 'Extracting the document…' }))
      const parsed = parseCourseHtml(acc)
      if (!parsed.html || parsed.html.length < 800)
        throw new Error('The model did not return a usable HTML document. Retry — flagship models handle this best.')
      if (looksTruncated(parsed.html))
        toast.warning('The document looks cut off mid-stream — regenerate with a higher-context model if sections are missing.')

      const fallbackTitle = series ? `${series.title} — Part ${part}` : t
      const finalTitle = parsed.title ?? fallbackTitle
      const html = enhanceCourseHtml(parsed.html, {
        title: finalTitle,
        kicker: series && part ? `Part ${part} of ${series.plan.length} · ${series.title}` : undefined,
      })
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
        maxTokens: 4096,
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

  const newItem = (topic: string, notes: string, mode: QueueItem['mode']): QueueItem => ({
    id: uid(),
    topic,
    notes,
    mode,
    status: 'pending',
  })

  function addSelectedToQueue(mode: QueueItem['mode']) {
    const picked = suggestions.filter((s) => s.checked)
    updateQueue((q) => [...q, ...picked.map((s) => newItem(s.topic, s.angle, mode))])
    setSuggestions(suggestions.filter((s) => !s.checked))
    toast.success(`${picked.length} added to queue`)
  }

  function importContents(text: string, mode: QueueItem['mode']) {
    const parsed = parseContents(text)
    if (!parsed.length) {
      toast.error('Found no topics in that text')
      return 0
    }
    const blocked = [...knownTitles(), ...queueRef.current.map((q) => q.topic)]
    const fresh: QueueItem[] = []
    for (const p of parsed) {
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
      const r = await generate(ov)
      if (r) return r
      if (queueStopRef.current) return null
      if (attempt < 3) {
        toast(`Retrying in ${attempt * 30}s (attempt ${attempt + 1}/3)…`)
        await sleep(attempt * 30_000, () => queueStopRef.current)
        if (queueStopRef.current) return null
      }
    }
    return null
  }

  async function processItem(item: QueueItem): Promise<boolean> {
    if (item.mode === 'standalone') return !!(await genWithRetry({ topic: item.topic, notes: item.notes }))

    let series = item.seriesId ? (seriesRef.current.find((s) => s.id === item.seriesId) ?? null) : null
    let parts: Course[] = series ? coursesRef.current.filter((c) => c.seriesId === series!.id) : []
    if (!series) {
      patchItem(item.id, { progress: 'Planning series…' })
      const r = await genWithRetry({ topic: item.topic, notes: item.notes, mode: 'new' })
      if (!r?.series) return false
      series = r.series
      parts = [r.course]
      patchItem(item.id, { seriesId: series.id })
    }
    while (parts.length < series.plan.length) {
      patchItem(item.id, { progress: `Part ${parts.length + 1}/${series.plan.length}` })
      if (queueStopRef.current) return false
      const r = await genWithRetry({ topic: series.topic, notes: series.notes, series, previous: parts })
      if (!r) return false
      parts = [...parts, r.course]
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
    try {
      for (;;) {
        // a 'running' leftover (page reload mid-build) is resumed like a pending one
        const item = queueRef.current.find((x) => x.status === 'pending' || x.status === 'running')
        if (!item || queueStopRef.current) break
        patchItem(item.id, { status: 'running', error: undefined })
        const ok = await processItem(item)
        if (queueStopRef.current) {
          patchItem(item.id, { status: 'pending', progress: undefined })
          break
        }
        if (ok) {
          built++
          patchItem(item.id, { status: 'done', progress: undefined })
        } else {
          failed++
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

  async function reviewCurrent() {
    if (!current || !reviewer) return
    const apiKey = keys[reviewer.provider].trim()
    if (!apiKey) {
      setSettingsOpen(true)
      throw new Error(`Add your ${PROVIDERS[reviewer.provider].label} API key for the reviewer`)
    }
    const { tax } = await loadHexpo(publish)
    const review = await reviewCourse({
      course: current,
      reviewer,
      apiKey,
      tax,
      threshold: publish.threshold,
    })
    await saveCourse({ ...current, review })
    review.passed
      ? toast.success(`Passed — ${review.valueScore}/100`, { description: review.worthIt })
      : toast.warning(`Not publishable — ${review.valueScore}/100`, { description: review.worthIt })
  }

  async function publishCurrent() {
    if (!current) return
    const out = await publishCourse(publish, current, (s) => toast.message(s))
    await saveCourse({
      ...current,
      published: { id: out.id, file: out.file, at: Date.now(), commit: out.commit },
    })
    toast.success(out.updated ? 'Updated in hexpo' : 'Pushed to hexpo', {
      description: `${out.file} committed to ${publish.branch}. Your deploy and library rebuild start automatically.`,
    })
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

  const busy = queueRunning || gen.phase === 'planning' || gen.phase === 'writing' || gen.phase === 'assembling'

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
              onPublish={publishCurrent}
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
