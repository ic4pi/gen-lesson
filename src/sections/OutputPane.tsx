import { Code2, Copy, Download, Eye, MonitorPlay } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { Course, GenState } from '@/types'
import { downloadCourse } from '@/lib/download'
import { PROVIDERS } from '@/lib/models'
import PublishBar from '@/sections/PublishBar'

interface Props {
  gen: GenState
  course: Course | null
  reviewerLabel: string | null
  hexpoRepo: string
  onReview: () => Promise<void>
  onAutoFix: () => Promise<void>
  onRedesign: () => Promise<void>
  onPublish: () => Promise<void>
}

const PHASE_LABEL: Record<string, string> = {
  planning: 'Planning curriculum',
  writing: 'Writing course',
  assembling: 'Assembling document',
  designing: 'Designer styling the page',
}

export default function OutputPane({ gen, course, reviewerLabel, hexpoRepo, onReview, onAutoFix, onRedesign, onPublish }: Props) {
  const busy = gen.phase === 'planning' || gen.phase === 'writing' || gen.phase === 'assembling' || gen.phase === 'designing'

  return (
    <div className="flex min-h-[560px] flex-col rounded-lg border border-border bg-card/60 backdrop-blur-sm">
      {/* status strip */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className={`led ${busy ? 'busy' : course ? 'on' : ''}`} />
          <span className="label-mono">
            {busy
              ? (PHASE_LABEL[gen.phase] ?? gen.phase)
              : course
                ? 'Ready'
                : 'Standing by'}
          </span>
        </div>
        {busy && (
          <span className="font-mono2 text-xs text-primary">
            {(gen.chars / 1000).toFixed(1)}k chars
          </span>
        )}
        {course && !busy && (
          <span className="font-mono2 text-[11px] text-muted-foreground">
            {course.modelId} · {PROVIDERS[course.provider].label}
            {course.part ? ` · Part ${course.part}` : ''}
          </span>
        )}
      </div>

      {busy ? (
        <GenerationView gen={gen} />
      ) : course ? (
        <>
        <Tabs defaultValue="preview" className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <TabsList className="bg-secondary">
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
              </TabsTrigger>
              <TabsTrigger value="code" className="text-xs">
                <Code2 className="mr-1.5 h-3.5 w-3.5" /> HTML
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(course.html)
                  toast.success('HTML copied to clipboard')
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => downloadCourse(course)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download .html
              </Button>
            </div>
          </div>
          <TabsContent value="preview" className="m-0 flex-1">
            <iframe
              key={course.id}
              title={course.title}
              sandbox="allow-scripts"
              srcDoc={course.html}
              className="h-[640px] w-full rounded-b-lg bg-white"
            />
          </TabsContent>
          <TabsContent value="code" className="m-0 flex-1">
            <pre className="h-[640px] overflow-auto rounded-b-lg bg-[#0a0a0a] p-4 font-mono2 text-[11px] leading-relaxed text-muted-foreground">
              {course.html}
            </pre>
          </TabsContent>
        </Tabs>
        <PublishBar course={course} hexpoRepo={hexpoRepo} reviewerLabel={reviewerLabel} onReview={onReview} onAutoFix={onAutoFix} onRedesign={onRedesign} onPublish={onPublish} />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

function GenerationView({ gen }: { gen: GenState }) {
  const steps = ['planning', 'writing', 'assembling', 'designing'] as const
  const currentIdx = steps.indexOf(gen.phase as (typeof steps)[number])
  return (
    <div className="scanline flex flex-1 flex-col items-center justify-center gap-8 p-10">
      <div className="w-full max-w-md space-y-5">
        {steps.map((s, i) => {
          const state =
            i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'idle'
          return (
            <div key={s} className="flex items-center gap-3">
              <span
                className={`led ${state === 'active' ? 'busy' : state === 'done' ? 'on' : ''}`}
              />
              <span
                className={`font-mono2 text-xs uppercase tracking-[0.14em] ${
                  state === 'active'
                    ? 'stream-caret text-primary'
                    : state === 'done'
                      ? 'text-foreground'
                      : 'text-muted-foreground/50'
                }`}
              >
                {PHASE_LABEL[s]}
              </span>
              {i === currentIdx && gen.chars > 0 && (
                <span className="ml-auto font-mono2 text-xs text-muted-foreground">
                  {gen.chars.toLocaleString()} chars
                </span>
              )}
            </div>
          )
        })}
      </div>
      {gen.planPreview && (
        <div className="w-full max-w-md rounded-md border border-border bg-secondary/50 p-4">
          <p className="label-mono mb-2">Curriculum plan</p>
          <ol className="space-y-1.5">
            {gen.planPreview.map((p) => (
              <li key={p.part} className="flex gap-2 text-xs">
                <span className="font-mono2 text-primary">{String(p.part).padStart(2, '0')}</span>
                <span className="text-foreground">{p.title}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
        {gen.phase === 'writing'
          ? 'The model is writing a complete interactive HTML course — structure, styling, quizzes and all. Long documents take a few minutes.'
          : gen.message}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
        <MonitorPlay className="h-6 w-6 text-primary" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold">Nothing on the bench yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Set a topic on the left, pick a model, hit generate. The finished course lands here —
          preview it live, then download the standalone HTML file.
        </p>
      </div>
      <div className="mt-2 grid max-w-md grid-cols-3 gap-3 text-left">
        {[
          ['01', 'Compose', 'Topic + notes or your own outline'],
          ['02', 'Generate', 'Flagship, uncensored, value or budget'],
          ['03', 'Ship it', 'One self-contained interactive .html'],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="font-mono2 text-[10px] text-primary">{n}</p>
            <p className="mt-1 font-display text-xs font-semibold">{t}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
