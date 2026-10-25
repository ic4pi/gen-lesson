export type ProviderId = 'openrouter' | 'venice' | 'nvidia'

export type Tier = 'flagship' | 'uncensored' | 'value' | 'budget'

export interface ModelOption {
  id: string
  label: string
  provider: ProviderId
  tier: Tier
  bestFor: string
  custom?: boolean
  /** hard cap on output tokens, when the model has one */
  maxOut?: number
}

export interface PlanPart {
  part: number
  title: string
  scope: string
}

export interface VisualDirection {
  mood: string
  palette: { name: string; hex: string; role: string }[]
  fonts: { display: string; body: string }
  motif: string
  hero: string
  visualizations: { name: string; shows: string; interaction: string; tech: 'canvas' | 'svg' }[]
  effects: string[]
  animations: string[]
  components: string
  avoid: string[]
}

export interface Series {
  id: string
  title: string
  topic: string
  notes: string
  plan: PlanPart[]
  createdAt: number
  /** one look for the whole series */
  design?: VisualDirection
}

export interface Course {
  id: string
  seriesId: string | null
  part: number | null
  title: string
  topic: string
  notes: string
  modelId: string
  provider: ProviderId
  html: string
  summary: string
  topicsCovered: string[]
  createdAt: number
  review?: ReviewResult
  /** writer's functional version, before the designer pass and Foundry fx */
  rawHtml?: string
  qa?: { passed: boolean; problems: string[]; at: number; repairs: number }
  meta?: DecimalMeta
  visual?: VisualDirection
  designedBy?: string
  published?: { id: string; file: string; at: number; commit: string }
  /** Why the last publish attempt failed; cleared on success. Shown on the Library card. */
  publishError?: string
}

export interface ReviewIssue {
  severity: 'blocker' | 'major' | 'minor'
  text: string
}

export interface ReviewResult {
  reviewerModelId: string
  reviewerProvider: ProviderId
  reviewedAt: number
  /** hash of the html that was reviewed — edits after review invalidate it */
  htmlLength: number
  valueScore: number
  scores: Record<'accuracy' | 'insight' | 'depth' | 'originality' | 'structure' | 'interactivity', number>
  verdict: 'publish' | 'revise' | 'reject'
  worthIt: string
  strengths: string[]
  issues: ReviewIssue[]
  passed: boolean
  threshold: number
  meta: {
    category: string
    format: string
    kicker: string
    blurb: string
    covers: string[]
    concepts: { id: string; angle: string }[]
  }
}

export interface PublishConfig {
  repo: string
  branch: string
  dir: string
  token: string
  reviewerModelId: string // "provider:model"; empty = free default (OpenRouter)
  reviewerFallbackId?: string // "provider:model"; empty = free default (NVIDIA)
  threshold: number
  maxRounds: number // auto-rebuild attempts after a failed review
  autoPublish?: boolean // queue: review + publish each course as soon as it is built (default on)
}

export type Keys = Record<ProviderId, string>

export type GenPhase =
  | 'idle'
  | 'planning'
  | 'writing'
  | 'assembling'
  | 'designing'
  | 'done'
  | 'error'

export interface GenState {
  phase: GenPhase
  message: string
  chars: number
  planPreview: PlanPart[] | null
}

export interface Suggestion {
  id: string
  topic: string
  angle: string
  checked: boolean
}

export interface DecimalMeta {
  number: string
  filename: string
  cls: string
  division: string
  kind: string
  wave?: number
  tier?: number
}

export type QueueMode = 'standalone' | 'series'
export type QueueStatus = 'pending' | 'running' | 'done' | 'failed'

export interface QueueItem {
  id: string
  topic: string
  notes: string
  mode: QueueMode
  status: QueueStatus
  seriesId?: string
  progress?: string
  error?: string
  meta?: DecimalMeta
}
