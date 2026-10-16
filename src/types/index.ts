export type ProviderId = 'openrouter' | 'venice' | 'nvidia'

export type Tier = 'flagship' | 'uncensored' | 'value' | 'budget'

export interface ModelOption {
  id: string
  label: string
  provider: ProviderId
  tier: Tier
  bestFor: string
  custom?: boolean
}

export interface PlanPart {
  part: number
  title: string
  scope: string
}

export interface Series {
  id: string
  title: string
  topic: string
  notes: string
  plan: PlanPart[]
  createdAt: number
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
  published?: { id: string; file: string; at: number; commit: string }
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
  scores: Record<'accuracy' | 'depth' | 'originality' | 'structure' | 'interactivity', number>
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
  reviewerModelId: string // "provider:model"
  threshold: number
}

export type Keys = Record<ProviderId, string>

export type GenPhase =
  | 'idle'
  | 'planning'
  | 'writing'
  | 'assembling'
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
}
