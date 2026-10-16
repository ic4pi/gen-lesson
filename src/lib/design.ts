// Designer pass: a second model restyles the writer's finished, working course.
import { streamChat } from './llm'
import { designPrompt, looksTruncated, parseCourseHtml } from './prompts'
import { visibleWords } from './hexpo'
import type { ModelOption } from '@/types'

const ids = (html: string) => new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]))

/** Did the designer keep the content and the code? Returns problems (empty = safe to use). */
export function checkDesign(raw: string, designed: string): string[] {
  const p: string[] = []
  if (looksTruncated(designed)) p.push('output was cut off')
  const w0 = visibleWords(raw)
  const w1 = visibleWords(designed)
  if (w1 < w0 * 0.96) p.push(`content shrank (${w0} → ${w1} words)`)
  const s0 = (raw.match(/<script\b/gi) || []).length
  const s1 = (designed.match(/<script\b/gi) || []).length
  if (s1 < s0) p.push('scripts were removed')
  const i0 = ids(raw)
  const i1 = ids(designed)
  const lost = [...i0].filter((x) => !i1.has(x))
  if (lost.length > Math.max(1, i0.size * 0.03)) p.push(`${lost.length} element ids the scripts rely on were lost`)
  if (/\b(fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|navigator\.sendBeacon)/.test(designed)) p.push('network calls added')
  let n = 0
  for (const m of designed.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    n++
    const type = /type=["']([^"']+)["']/i.exec(m[1])?.[1]
    if (type && !/javascript/i.test(type)) continue
    try {
      new Function(m[2]) // compile only
    } catch (e: any) {
      p.push(`JS syntax error in script ${n}: ${e.message}`)
    }
  }
  return p
}

export async function designCourse(opts: {
  rawHtml: string
  title: string
  designer: ModelOption
  apiKey: string
  onProgress?: (chars: number) => void
  signal?: AbortSignal
  rejected?: string
}): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  let acc = ''
  for await (const d of streamChat({
    provider: opts.designer.provider,
    apiKey: opts.apiKey,
    model: opts.designer.id,
    messages: [{ role: 'user', content: designPrompt({ html: opts.rawHtml, title: opts.title, rejected: opts.rejected }) }],
    maxTokens: 32000,
    temperature: 0.8,
    signal: opts.signal,
  })) {
    acc += d
    opts.onProgress?.(acc.length)
  }
  const parsed = parseCourseHtml(acc)
  if (!parsed.html || parsed.html.length < 800) return { ok: false, reason: 'designer returned no usable document' }
  // the writer's COURSE_META comment is stripped by the parser; keep content checks on the HTML itself
  const problems = checkDesign(opts.rawHtml, parsed.html)
  if (problems.length) return { ok: false, reason: problems.join('; ') }
  return { ok: true, html: parsed.html }
}
