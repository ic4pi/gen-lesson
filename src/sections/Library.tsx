import { useRef } from 'react'
import { Archive, Download, Eye, Layers, Rocket, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Course, Series } from '@/types'
import { downloadCourse } from '@/lib/download'

interface Props {
  courses: Course[]
  seriesList: Series[]
  onPreview: (c: Course) => void
  onPublish: (c: Course) => void
  onPublishAll: () => void
  onBuildRemaining: (seriesId: string) => void
  buildingSeries: string | null
  onDeleteCourse: (id: string) => void
  onDeleteSeries: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
}

export default function Library(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const standalone = p.courses
    .filter((c) => !c.seriesId)
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">Library</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={p.onPublishAll} title="Review, fix and push every unpublished course to hexpo">
            <Rocket className="mr-1.5 h-3.5 w-3.5" /> Publish all
          </Button>
          <Button variant="outline" size="sm" onClick={p.onExport}>
            <Archive className="mr-1.5 h-3.5 w-3.5" /> Export backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) p.onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {p.seriesList.length === 0 && standalone.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Generated courses and series live here. Backups export as JSON — keep one, since this
            library lives in your browser.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {p.seriesList
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((s) => {
              const parts = p.courses
                .filter((c) => c.seriesId === s.id)
                .sort((a, b) => (a.part ?? 0) - (b.part ?? 0))
              return (
                <div key={s.id} className="rounded-lg border border-border bg-card/60">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Layers className="h-4 w-4 text-primary" />
                      <div>
                        <p className="font-display text-sm font-semibold">{s.title}</p>
                        <p className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Series · {parts.length}/{s.plan.length} parts built
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                    {parts.length < s.plan.length && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={p.buildingSeries !== null}
                        onClick={() => p.onBuildRemaining(s.id)}
                      >
                        <Layers className="mr-1.5 h-3.5 w-3.5" />
                        {p.buildingSeries === s.id ? 'Building…' : `Build remaining (${s.plan.length - parts.length})`}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => p.onDeleteSeries(s.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete series
                    </Button>
                    </div>
                  </div>

                  {/* plan rail */}
                  <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-3">
                    {s.plan.map((plan) => {
                      const built = parts.find((c) => c.part === plan.part)
                      return (
                        <div key={plan.part} className="bg-card p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                Part {plan.part} {built ? '· built' : '· pending'}
                              </p>
                              <p className="mt-1 truncate text-sm font-medium text-foreground">
                                {plan.title}
                              </p>
                              {built ? (
                                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                  {built.summary || built.title}
                                </p>
                              ) : (
                                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/60">
                                  {plan.scope}
                                </p>
                              )}
                            </div>
                          </div>
                          {built && (
                            <div className="mt-3 flex gap-1.5">
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => p.onPreview(built)}>
                                <Eye className="mr-1 h-3 w-3" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => p.onPublish(built)}>
                                <Rocket className="mr-1 h-3 w-3" /> {built.published ? 'Republish' : 'Publish'}
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => downloadCourse(built)}>
                                <Download className="mr-1 h-3 w-3" /> .html
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                                onClick={() => p.onDeleteCourse(built.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

          {standalone.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {standalone.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-card/60 p-4 hover-lift">
                  <p className="font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Standalone · {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">{c.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {c.summary || c.topic}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => p.onPreview(c)}>
                      <Eye className="mr-1 h-3 w-3" /> View
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => p.onPublish(c)}>
                      <Rocket className="mr-1 h-3 w-3" /> {c.published ? 'Republish' : 'Publish'}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => downloadCourse(c)}>
                      <Download className="mr-1 h-3 w-3" /> .html
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={() => p.onDeleteCourse(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
