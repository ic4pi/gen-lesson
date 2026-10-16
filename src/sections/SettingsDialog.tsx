import { useState } from 'react'
import { ExternalLink, KeyRound, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { PROVIDERS } from '@/lib/models'
import { listModels } from '@/lib/llm'
import type { Keys, ModelOption, ProviderId, PublishConfig } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  keys: Keys
  setKeys: (k: Keys) => void
  models: ModelOption[]
  publish: PublishConfig
  setPublish: (p: PublishConfig) => void
}

export default function SettingsDialog({ open, onOpenChange, keys, setKeys, models, publish, setPublish }: Props) {
  const [testing, setTesting] = useState<ProviderId | null>(null)

  const test = async (id: ProviderId) => {
    const key = keys[id].trim()
    if (!key) {
      toast.error(`Paste a ${PROVIDERS[id].label} key first`)
      return
    }
    setTesting(id)
    try {
      const models = await listModels(id, key)
      toast.success(`${PROVIDERS[id].label} connected — ${models.length} models available`, {
        description: models.slice(0, 3).join(' · ') + (models.length > 3 ? ' …' : ''),
      })
    } catch (e: any) {
      toast.error(e.message ?? 'Connection failed')
    } finally {
      setTesting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> API Keys
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Keys are stored only in this browser's local storage and sent directly from your
            browser to each provider. Nothing passes through any other server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <div key={id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="label-mono">{PROVIDERS[id].label}</Label>
                <a
                  href={PROVIDERS[id].keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Get a key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={keys[id]}
                  onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
                  placeholder={`${PROVIDERS[id].label} API key`}
                  className="border-input bg-secondary font-mono2 text-xs placeholder:text-muted-foreground/50"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-none"
                  disabled={testing !== null}
                  onClick={() => test(id)}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${testing === id ? 'animate-spin' : ''}`} />
                  Test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{PROVIDERS[id].hint}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <Label className="label-mono">Review &amp; publish to hexpo</Label>
          <p className="text-[11px] text-muted-foreground">
            A second, different model reviews each course. Only passing courses can be committed
            to your hexpo repo's masterclasses folder, which triggers your redeploy.
          </p>
          <select
            value={publish.reviewerModelId}
            onChange={(e) => setPublish({ ...publish, reviewerModelId: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-secondary px-2 text-xs"
          >
            <option value="">Reviewer model…</option>
            {models.map((m) => (
              <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                {m.label} — {PROVIDERS[m.provider].label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Input
              value={publish.repo}
              onChange={(e) => setPublish({ ...publish, repo: e.target.value.trim() })}
              placeholder="owner/repo"
              className="border-input bg-secondary font-mono2 text-xs"
            />
            <Input
              value={publish.branch}
              onChange={(e) => setPublish({ ...publish, branch: e.target.value.trim() })}
              placeholder="branch"
              className="border-input bg-secondary font-mono2 text-xs"
            />
          </div>
          <Input
            type="password"
            value={publish.token}
            onChange={(e) => setPublish({ ...publish, token: e.target.value.trim() })}
            placeholder="GitHub fine-grained token (Contents: read and write on the repo)"
            className="border-input bg-secondary font-mono2 text-xs"
          />
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Pass score</Label>
            <Input
              type="number"
              min={50}
              max={95}
              value={publish.threshold}
              onChange={(e) => setPublish({ ...publish, threshold: Number(e.target.value) || 75 })}
              className="h-8 w-20 border-input bg-secondary font-mono2 text-xs"
            />
            <span className="text-[11px] text-muted-foreground">/100, and no blocker issues</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
