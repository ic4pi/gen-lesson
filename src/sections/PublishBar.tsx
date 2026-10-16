import { useState } from 'react'
import { CheckCircle2, ExternalLink, Rocket, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Course } from '@/types'

interface Props {
  hexpoRepo: string
  course: Course
  reviewerLabel: string | null
  onReview: () => Promise<void>
  onPublish: () => Promise<void>
}

export default function PublishBar({ course, hexpoRepo, reviewerLabel, onReview, onPublish }: Props) {
  const [busy, setBusy] = useState<'review' | 'publish' | null>(null)
  const r = course.review
  const stale = r && r.htmlLength !== course.html.length

  const run = async (kind: 'review' | 'publish', fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (e: any) {
      toast.error(e?.message ?? `${kind} failed`, { duration: 9000 })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border-t border-border bg-secondary/30 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label-mono">Review &amp; publish</span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || !reviewerLabel}
          onClick={() => run('review', onReview)}
          title={reviewerLabel ? `Reviewer: ${reviewerLabel}` : 'Pick a reviewer model in Keys → Publish'}
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
          {busy === 'review' ? 'Reviewing…' : r ? 'Re-run review' : 'Run review'}
        </Button>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy !== null || !r?.passed || !!stale}
          onClick={() => run('publish', onPublish)}
        >
          <Rocket className="mr-1.5 h-3.5 w-3.5" />
          {busy === 'publish' ? 'Publishing…' : course.published ? 'Republish to hexpo' : 'Publish to hexpo'}
        </Button>
        {!reviewerLabel && (
          <span className="text-[11px] text-muted-foreground">Set a reviewer model in Keys → Publish.</span>
        )}
        {course.published && (
          <a
            href={`https://github.com/${hexpoRepo}/commit/${course.published.commit}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Published as {course.published.file} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {r && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-card/60 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {r.passed && !stale ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="font-display text-sm font-semibold">
              {r.valueScore}/100 · {stale ? 'stale — re-run review' : r.passed ? 'passed' : `not passed (needs ${r.threshold}+, no blockers)`}
            </span>
            <span className="font-mono2 text-[10px] text-muted-foreground">
              by {r.reviewerModelId} · verdict: {r.verdict}
            </span>
          </div>
          <p className="leading-relaxed text-foreground">{r.worthIt}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {Object.entries(r.scores).map(([k, v]) => (
              <span key={k}>
                {k} <span className={v < 5 ? 'text-destructive' : 'text-foreground'}>{v}/10</span>
              </span>
            ))}
          </div>
          {r.issues.length > 0 && (
            <ul className="space-y-1">
              {r.issues.map((i, n) => (
                <li key={n} className="flex gap-2">
                  <span
                    className={`font-mono2 text-[10px] uppercase ${i.severity === 'blocker' ? 'text-destructive' : i.severity === 'major' ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {i.severity}
                  </span>
                  <span className="text-muted-foreground">{i.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
