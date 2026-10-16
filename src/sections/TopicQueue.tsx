import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Layers, FileText, Lightbulb, ListPlus, Play, RotateCcw, Square, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { QueueItem, QueueMode, Suggestion } from '@/types'

interface Props {
  subject: string
  setSubject: (v: string) => void
  count: number
  setCount: (v: number) => void
  suggestions: Suggestion[]
  setSuggestions: (v: Suggestion[]) => void
  queue: QueueItem[]
  suggesting: boolean
  queueRunning: boolean
  busy: boolean
  onSuggest: () => void
  onAddToQueue: (mode: QueueMode) => void
  onImport: (text: string, mode: QueueMode) => number | void
  onRunQueue: () => void
  onStopQueue: () => void
  onMove: (id: string, dir: -1 | 1) => void
  onRemove: (id: string) => void
  onToggleMode: (id: string) => void
  onRerun: (id: string) => void
  onClearDone: () => void
}

const inputCls = 'bg-secondary border-input'

function ModeSelect({ value, onChange }: { value: QueueMode; onChange: (v: QueueMode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-xs">
      {(['standalone', 'series'] as QueueMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 ${value === m ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground hover:text-foreground'}`}
        >
          {m === 'series' ? <Layers className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          {m === 'series' ? 'Full series' : 'Standalone'}
        </button>
      ))}
    </div>
  )
}

export default function TopicQueue(p: Props) {
  const [paste, setPaste] = useState('')
  const [mode, setMode] = useState<QueueMode>('series')
  const fileRef = useRef<HTMLInputElement>(null)
  const checked = p.suggestions.filter((s) => s.checked)
  const toggle = (id: string, v: boolean) =>
    p.setSuggestions(p.suggestions.map((s) => (s.id === id ? { ...s, checked: v } : s)))

  const active = p.queue.filter((q) => q.status === 'pending' || q.status === 'running')
  const failed = p.queue.filter((q) => q.status === 'failed')
  const done = p.queue.filter((q) => q.status === 'done')

  const row = (q: QueueItem) => {
    const i = p.queue.indexOf(q)
    const running = q.status === 'running'
    return (
      <li key={q.id} className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${running ? 'border-primary/60 bg-primary/5' : 'border-border bg-secondary/40'}`}>
        <div className="flex flex-col">
          <button className="text-muted-foreground hover:text-foreground disabled:opacity-20" disabled={i === 0 || running} onClick={() => p.onMove(q.id, -1)} title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="text-muted-foreground hover:text-foreground disabled:opacity-20" disabled={i === p.queue.length - 1 || running} onClick={() => p.onMove(q.id, 1)} title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div>{q.topic}</div>
          {running && <div className="text-xs text-primary">building… {q.progress}</div>}
          {q.status === 'failed' && <div className="text-xs text-destructive">{q.error}</div>}
          {q.status === 'pending' && q.progress && <div className="text-xs text-muted-foreground">{q.progress}</div>}
        </div>
        <button
          className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={q.status !== 'pending' || !!q.seriesId}
          onClick={() => p.onToggleMode(q.id)}
          title="Toggle standalone / full series"
        >
          {q.mode === 'series' ? <Layers className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          {q.mode === 'series' ? 'series' : 'single'}
        </button>
        {(q.status === 'done' || q.status === 'failed') && (
          <button className="text-muted-foreground hover:text-primary" onClick={() => p.onRerun(q.id)} title={q.status === 'done' ? 'Run again' : 'Retry'}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button className="text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={running} onClick={() => p.onRemove(q.id)} title="Remove">
          <X className="h-3.5 w-3.5" />
        </button>
      </li>
    )
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card/60 p-5 backdrop-blur-sm">
      <p className="label-mono mb-4">Topic queue — set it once, let it run</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* ── paste a contents page ── */}
          <div className="space-y-2">
            <Label htmlFor="paste" className="label-mono">Paste a library contents page</Label>
            <Textarea
              id="paste"
              rows={7}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'One topic per line. Headings, bullets and numbering are cleaned up:\n\n# Hermetic Arts\n1. The Kybalion — the seven principles\n2. Hermetic Qabalah\n\nTAROT\n- The Major Arcana'}
              className={`${inputCls} resize-y font-mono2 text-xs`}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.json,text/*,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setPaste(await f.text())
                e.target.value = ''
              }}
            />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Load a file (.txt .md .csv .json)
            </Button>
            <ModeSelect value={mode} onChange={setMode} />
            <Button
              className="w-full"
              disabled={!paste.trim()}
              onClick={() => {
                if (p.onImport(paste, mode)) setPaste('')
              }}
            >
              <ListPlus className="mr-2 h-4 w-4" /> Add to queue (skips what is already in your library)
            </Button>
          </div>

          {/* ── or generate topics ── */}
          <div className="space-y-3 border-t border-border pt-5">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="subject" className="label-mono">Or generate topics from a subject</Label>
                <Input id="subject" value={p.subject} onChange={(e) => p.setSubject(e.target.value)} className={inputCls} disabled={p.suggesting} />
              </div>
              <div className="w-20 space-y-1.5">
                <Label htmlFor="count" className="label-mono">How many</Label>
                <Input id="count" type="number" min={1} max={80} value={p.count} onChange={(e) => p.setCount(Math.max(1, Math.min(80, Number(e.target.value) || 1)))} className={inputCls} disabled={p.suggesting} />
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={p.onSuggest} disabled={p.suggesting || p.busy || !p.subject.trim()}>
              <Lightbulb className="mr-2 h-4 w-4" />
              {p.suggesting ? 'Generating topics…' : 'Generate topics (skips what is in your library)'}
            </Button>
            {p.suggestions.length > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{checked.length} of {p.suggestions.length} selected</span>
                  <span className="flex gap-3">
                    <button className="hover:text-foreground" onClick={() => p.setSuggestions(p.suggestions.map((s) => ({ ...s, checked: true })))}>All</button>
                    <button className="hover:text-foreground" onClick={() => p.setSuggestions(p.suggestions.map((s) => ({ ...s, checked: false })))}>None</button>
                    <button className="hover:text-destructive" onClick={() => p.setSuggestions([])}>Clear</button>
                  </span>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {p.suggestions.map((s) => (
                    <li key={s.id} className="flex gap-3 rounded-md border border-border bg-secondary/40 p-2.5">
                      <Checkbox checked={s.checked} onCheckedChange={(v) => toggle(s.id, v === true)} className="mt-0.5" />
                      <label className="cursor-pointer text-sm" onClick={() => toggle(s.id, !s.checked)}>
                        <span className="text-foreground">{s.topic}</span>
                        {s.angle && <span className="mt-0.5 block text-xs text-muted-foreground">{s.angle}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                <ModeSelect value={mode} onChange={setMode} />
                <Button className="w-full" onClick={() => p.onAddToQueue(mode)} disabled={checked.length === 0}>
                  <ListPlus className="mr-2 h-4 w-4" /> Add {checked.length} to queue
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── queue ── */}
        <div className="space-y-3">
          <span className="label-mono">Queue — {active.length} waiting{failed.length ? `, ${failed.length} failed` : ''}</span>
          {p.queue.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
              Empty. Paste a contents page or generate topics. Each item builds with the model chosen in
              the composer: <b>Full series</b> plans the curriculum and writes every part in order;
              <b> Standalone</b> writes one course. You can reorder, add, remove or switch items while it runs.
            </p>
          ) : (
            <ul className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {[...active, ...failed].map(row)}
              {done.length > 0 && (
                <>
                  <li className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                    <span className="label-mono">Completed ({done.length})</span>
                    <button className="hover:text-destructive" onClick={p.onClearDone}>Clear completed</button>
                  </li>
                  {done.map(row)}
                </>
              )}
            </ul>
          )}
          {p.queueRunning ? (
            <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={p.onStopQueue}>
              <Square className="mr-2 h-4 w-4" /> Stop queue
            </Button>
          ) : (
            <Button className="w-full" onClick={p.onRunQueue} disabled={active.length === 0 || p.busy}>
              <Play className="mr-2 h-4 w-4" /> Run queue ({active.length})
            </Button>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Keep this tab open — it runs in your browser and asks the screen to stay awake while
            working. Failed steps retry 3 times, then the item is marked failed and the queue moves
            on. If the tab is closed or reloaded mid-run it resumes where it stopped.
          </p>
        </div>
      </div>
    </section>
  )
}
