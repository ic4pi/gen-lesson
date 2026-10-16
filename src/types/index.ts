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
