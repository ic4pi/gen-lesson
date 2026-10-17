// OpenAI-compatible client for OpenRouter, Venice and NVIDIA NIM.
import { PROVIDERS } from './models'
import type { ProviderId } from '@/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}


/** Error raised when a model call goes silent (dropped connection, a locked phone, a hung provider). */
export function stallError(what: string, ms: number): Error {
  const e = new Error(
    `${what} stopped responding for ${Math.round(ms / 1000)}s. The connection probably dropped (a locked or backgrounded phone pauses the page).`,
  ) as Error & { status?: number; stalled?: boolean }
  e.status = 0
  e.stalled = true
  return e
}

/** An AbortController that also fires when `outer` aborts; `isOuter()` says which one did it. */
function linked(outer?: AbortSignal) {
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  outer?.addEventListener('abort', onAbort)
  return {
    ctl,
    isOuter: () => !!outer?.aborted,
    done: () => outer?.removeEventListener('abort', onAbort),
  }
}

function friendlyError(status: number, body: string, provider: ProviderId): Error {
  const e = friendlyErrorBase(status, body, provider) as Error & { status?: number; detail?: string }
  e.status = status
  e.detail = body.slice(0, 400)
  return e
}

function friendlyErrorBase(status: number, body: string, provider: ProviderId): Error {
  let detail = ''
  try {
    const j = JSON.parse(body)
    detail = j?.error?.message || j?.message || ''
  } catch {
    detail = body.slice(0, 200)
  }
  const name = PROVIDERS[provider].label
  if (status === 401 || status === 403)
    return new Error(`${name} rejected the API key (${status}). Check it in Keys settings.`)
  if (status === 402)
    return new Error(`${name} says you're out of credits (402). Top up or switch provider.`)
  if (status === 404)
    return new Error(`Model not found on ${name} (404). Refresh the model list or pick another.`)
  if (status === 429)
    return new Error(`${name} rate-limited the request (429). Wait a moment and retry.`)
  return new Error(`${name} error ${status}: ${detail || 'unknown'}`)
}

/** Non-streaming call — used for the curriculum plan. Returns full text. */
export async function chatOnce(opts: {
  provider: ProviderId
  apiKey: string
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<string> {
  const ms = opts.timeoutMs ?? 180_000
  const L = linked(opts.signal)
  const timer = setTimeout(() => L.ctl.abort(), ms)
  try {
    const res = await fetch(`${PROVIDERS[opts.provider].baseUrl}/chat/completions`, {
      method: 'POST',
      signal: L.ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        stream: false,
      }),
    })
    if (!res.ok) throw friendlyError(res.status, await res.text(), opts.provider)
    const json = await res.json()
    return json?.choices?.[0]?.message?.content ?? ''
  } catch (e: any) {
    if (e?.name === 'AbortError' && !L.isOuter()) throw stallError('The model', ms)
    throw e
  } finally {
    clearTimeout(timer)
    L.done()
  }
}

/** Streaming call — yields content deltas as they arrive. */
export async function* streamChat(opts: {
  provider: ProviderId
  apiKey: string
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  firstByteMs?: number
  idleMs?: number
}): AsyncGenerator<string> {
  const firstMs = opts.firstByteMs ?? 300_000 // thinking models can be slow to start
  const idleMs = opts.idleMs ?? 120_000
  const L = linked(opts.signal)
  let limit = firstMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const bump = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => L.ctl.abort(), limit)
  }
  try {
    bump()
    const res = await fetch(`${PROVIDERS[opts.provider].baseUrl}/chat/completions`, {
      method: 'POST',
      signal: L.ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 32000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    })
    if (!res.ok) throw friendlyError(res.status, await res.text(), opts.provider)
    if (!res.body) throw new Error('No response body — provider may not support streaming.')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    limit = idleMs
    for (;;) {
      bump()
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const data = t.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const j = JSON.parse(data)
          const delta = j?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) yield delta
        } catch {
          // partial JSON chunk — ignore
        }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError' && !L.isOuter()) throw stallError('The model', limit)
    throw e
  } finally {
    if (timer) clearTimeout(timer)
    L.done()
  }
}

/** Live model list from the provider — keeps the catalog honest. */
export async function listModels(
  provider: ProviderId,
  apiKey: string,
): Promise<string[]> {
  const res = await fetch(`${PROVIDERS[provider].baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw friendlyError(res.status, await res.text(), provider)
  const json = await res.json()
  const ids: string[] = (json?.data ?? [])
    .map((m: any) => m?.id)
    .filter((x: any) => typeof x === 'string')
  return ids.sort()
}
