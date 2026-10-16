import { useMemo, useState } from 'react'
import { Sparkles, Layers, FileText, Plus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DESIGN_TIER_INFO, DESIGN_TIER_ORDER, PROVIDERS, TIER_INFO, TIER_ORDER } from '@/lib/models'
import type { Course, GenState, ModelOption, ProviderId, Series, Tier } from '@/types'

interface Props {
  topic: string
  setTopic: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  seriesMode: string
  setSeriesMode: (v: string) => void
  seriesList: Series[]
  courses: Course[]
  models: ModelOption[]
  modelId: string
  setModelId: (v: string) => void
  designerModels: ModelOption[]
  designerId: string
  setDesignerId: (v: string) => void
  onAddCustom: (m: ModelOption) => void
  onGenerate: () => void
  onCancel: () => void
  gen: GenState
}

const inputCls =
  'bg-secondary border-input focus-visible:ring-primary/60 placeholder:text-muted-foreground/50'

export default function Composer(p: Props) {
  const busy = p.gen.phase === 'planning' || p.gen.phase === 'writing' || p.gen.phase === 'assembling' || p.gen.phase === 'designing'
  const [customProvider, setCustomProvider] = useState<ProviderId>('openrouter')
  const [customId, setCustomId] = useState('')

  const grouped = useMemo(() => {
    const g: Record<Tier, ModelOption[]> = { flagship: [], uncensored: [], value: [], budget: [] }
    for (const m of p.models) g[m.tier].push(m)
    return g
  }, [p.models])

  const designGrouped = useMemo(() => {
    const g: Record<string, ModelOption[]> = { flagship: [], value: [], budget: [] }
    for (const m of p.designerModels) (g[m.tier] ?? g.value).push(m)
    return g
  }, [p.designerModels])

  const selectedSeries = p.seriesList.find((s) => s.id === p.seriesMode)
  const nextPart = selectedSeries
    ? p.courses.filter((c) => c.seriesId === selectedSeries.id).length + 1
    : null
  const seriesComplete =
    selectedSeries && nextPart !== null && nextPart > selectedSeries.plan.length

  return (
    <div className="space-y-5">
      {/* Topic */}
      <div className="space-y-2 rise">
        <Label htmlFor="topic" className="label-mono">Topic</Label>
        <Input
          id="topic"
          value={p.topic}
          onChange={(e) => p.setTopic(e.target.value)}
          placeholder="Hermeticism, quantum field theory, tax law…"
          className={inputCls}
          disabled={busy || !!selectedSeries}
        />
        {selectedSeries && (
          <p className="text-xs text-muted-foreground">
            Locked to series topic: <span className="text-foreground">{selectedSeries.topic}</span>
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2 rise rise-1">
        <Label htmlFor="notes" className="label-mono">Special notes / outline</Label>
        <Textarea
          id="notes"
          value={p.notes}
          onChange={(e) => p.setNotes(e.target.value)}
          placeholder={'Narrow the angle, set the audience, or paste your own outline:\n\n1. Origins\n2. Core principles\n3. Seeing it in use'}
          rows={5}
          className={`${inputCls} resize-y`}
          disabled={busy || !!selectedSeries}
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          If you paste an outline, the course chapters follow it. Notes are locked once a series
          begins so every part stays on the same rails.
        </p>
      </div>

      {/* Series mode */}
      <div className="space-y-2 rise rise-2">
        <Label className="label-mono">Build mode</Label>
        <Select value={p.seriesMode} onValueChange={p.setSeriesMode} disabled={busy}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standalone">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Standalone masterclass
              </span>
            </SelectItem>
            <SelectItem value="new">
              <span className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" /> New series — plan parts, then build Part 1
              </span>
            </SelectItem>
            {p.seriesList.map((s) => {
              const done = p.courses.filter((c) => c.seriesId === s.id).length
              const total = s.plan.length
              return (
                <SelectItem key={s.id} value={s.id} disabled={done >= total}>
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    {s.title} — {done >= total ? 'complete' : `continue at Part ${done + 1}/${total}`}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {selectedSeries && nextPart !== null && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {seriesComplete ? (
              <span className="text-primary">This series is complete — all {selectedSeries.plan.length} parts built.</span>
            ) : (
              <>
                Next up: <span className="text-foreground">Part {nextPart} — “{selectedSeries.plan.find((x) => x.part === nextPart)?.title}”</span>.
                The model receives every previous part's summary so it picks up cleanly and never repeats a lesson.
              </>
            )}
          </p>
        )}
        {p.seriesMode === 'new' && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            First call plans the full curriculum (3–6 parts), then Part 1 is written. Continue
            later parts from this menu whenever you're ready.
          </p>
        )}
      </div>

      {/* Designer picker */}
      <div className="space-y-2 rise rise-3">
        <Label className="label-mono">Designer (restyles the finished course)</Label>
        <Select value={p.designerId} onValueChange={p.setDesignerId} disabled={busy}>
          <SelectTrigger className={inputCls}>
            <SelectValue placeholder="Choose a designer" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="none">
              <span className="text-foreground">No designer — plain build</span>
            </SelectItem>
            {DESIGN_TIER_ORDER.map((tier) =>
              designGrouped[tier]?.length ? (
                <SelectGroup key={tier}>
                  <SelectLabel className="label-mono pt-2">
                    {DESIGN_TIER_INFO[tier].label} — {DESIGN_TIER_INFO[tier].blurb}
                  </SelectLabel>
                  {designGrouped[tier].map((m) => (
                    <SelectItem key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                      <span className="flex flex-col items-start gap-0.5 py-0.5">
                        <span className="flex items-center gap-2">
                          <span className="text-foreground">{m.label}</span>
                          <span className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {PROVIDERS[m.provider].label}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">{m.bestFor}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null,
            )}
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The writer above produces the information and working code. The designer then restyles
          it; if it breaks content or scripts, the plain build is kept.
        </p>
      </div>

      {/* Model picker */}
      <div className="space-y-2 rise rise-3">
        <Label className="label-mono">Writer (information and code)</Label>
        <Select value={p.modelId} onValueChange={p.setModelId} disabled={busy}>
          <SelectTrigger className={inputCls}>
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {TIER_ORDER.map((tier) =>
              grouped[tier].length ? (
                <SelectGroup key={tier}>
                  <SelectLabel className="label-mono pt-2">
                    {TIER_INFO[tier].label} — {TIER_INFO[tier].blurb}
                  </SelectLabel>
                  {grouped[tier].map((m) => (
                    <SelectItem key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                      <span className="flex flex-col items-start gap-0.5 py-0.5">
                        <span className="flex items-center gap-2">
                          <span className="text-foreground">{m.label}</span>
                          <span className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {PROVIDERS[m.provider].label}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">{m.bestFor}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null,
            )}
          </SelectContent>
        </Select>

        {/* custom model */}
        <div className="flex gap-2">
          <Select value={customProvider} onValueChange={(v) => setCustomProvider(v as ProviderId)} disabled={busy}>
            <SelectTrigger className={`${inputCls} w-32`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                <SelectItem key={id} value={id}>{PROVIDERS[id].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            placeholder="custom model id"
            className={`${inputCls} font-mono2 text-xs`}
            disabled={busy}
          />
          <Button
            variant="outline"
            size="icon"
            className="flex-none"
            disabled={busy || !customId.trim()}
            onClick={() => {
              p.onAddCustom({
                id: customId.trim(),
                label: customId.trim().split('/').pop() ?? customId.trim(),
                provider: customProvider,
                tier: 'value',
                bestFor: 'Custom entry',
                custom: true,
              })
              p.setModelId(`${customProvider}:${customId.trim()}`)
              setCustomId('')
            }}
            title="Add custom model"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Generate */}
      {busy ? (
        <Button
          variant="outline"
          className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={p.onCancel}
        >
          <XCircle className="mr-2 h-4 w-4" /> Cancel generation
        </Button>
      ) : (
        <Button
          className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover-lift"
          size="lg"
          onClick={p.onGenerate}
          disabled={seriesComplete === true}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {selectedSeries
            ? `Generate Part ${nextPart}`
            : p.seriesMode === 'new'
              ? 'Plan series & generate Part 1'
              : 'Generate masterclass'}
        </Button>
      )}
    </div>
  )
}
