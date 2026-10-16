import { Lightbulb, ListPlus, Play, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { QueueItem, Suggestion } from '@/types'

interface Props {
  subject: string
  setSubject: (v: string) => void
  count: number
  setCount: (v: number) => void
  suggestions: Suggestion[]
  setSuggestions: (v: Suggestion[]) => void
  queue: QueueItem[]
  setQueue: (v: QueueItem[]) => void
  suggesting: boolean
  queueRunning: boolean
  busy: boolean
  onSuggest: () => void
  onAddToQueue: () => void
  onRunQueue: () => void
  onStopQueue: () => void
}

export default function TopicQueue(p: Props) {
  const checked = p.suggestions.filter((s) => s.checked)
  const toggle = (id: string, v: boolean) =>
    p.setSuggestions(p.suggestions.map((s) => (s.id === id ? { ...s, checked: v } : s)))

  return (
    <section className="mt-6 rounded-lg border border-border bg-card/60 p-5 backdrop-blur-sm">
      <p className="label-mono mb-4">Topic generator &amp; queue</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── suggestions ── */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="subject" className="label-mono">Subject</Label>
              <Input
                id="subject"
                value={p.subject}
                onChange={(e) => p.setSubject(e.target.value)}
                className="bg-secondary border-input"
                disabled={p.suggesting}
              />
            </div>
            <div className="w-20 space-y-1.5">
              <Label htmlFor="count" className="label-mono">How many</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={30}
                value={p.count}
                onChange={(e) => p.setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="bg-secondary border-input"
                disabled={p.suggesting}
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={p.onSuggest}
            disabled={p.suggesting || p.busy || !p.subject.trim()}
          >
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
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {p.suggestions.map((s) => (
                  <li key={s.id} className="flex gap-3 rounded-md border border-border bg-secondary/40 p-2.5">
                    <Checkbox
                      checked={s.checked}
                      onCheckedChange={(v) => toggle(s.id, v === true)}
                      className="mt-0.5"
                    />
                    <label className="cursor-pointer text-sm" onClick={() => toggle(s.id, !s.checked)}>
                      <span className="text-foreground">{s.topic}</span>
                      {s.angle && <span className="mt-0.5 block text-xs text-muted-foreground">{s.angle}</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <Button className="w-full" onClick={p.onAddToQueue} disabled={checked.length === 0}>
                <ListPlus className="mr-2 h-4 w-4" /> Add {checked.length} to queue
              </Button>
            </>
          )}
        </div>

        {/* ── queue ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="label-mono">Queue ({p.queue.length})</span>
            {p.queue.length > 0 && !p.queueRunning && (
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => p.setQueue([])}>
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          {p.queue.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
              Nothing queued. Generate topics, tick the ones you want, and add them here. The queue builds
              each as a standalone masterclass, one after another, using the model chosen above.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {p.queue.map((q, i) => (
                <li key={q.id} className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 p-2.5 text-sm">
                  <span className="font-mono2 text-[10px] text-muted-foreground mt-1">{i + 1}</span>
                  <span className="flex-1">
                    {q.topic}
                    {p.queueRunning && i === 0 && <span className="ml-2 text-xs text-primary">building…</span>}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={p.queueRunning && i === 0}
                    onClick={() => p.setQueue(p.queue.filter((x) => x.id !== q.id))}
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {p.queueRunning ? (
            <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={p.onStopQueue}>
              <Square className="mr-2 h-4 w-4" /> Stop queue
            </Button>
          ) : (
            <Button className="w-full" onClick={p.onRunQueue} disabled={p.queue.length === 0 || p.busy}>
              <Play className="mr-2 h-4 w-4" /> Run queue ({p.queue.length})
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
