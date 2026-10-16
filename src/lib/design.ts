// Designer pass: a second model writes the visual layer (CSS + optional decorative JS) for the
// writer's finished, working course. It never re-outputs the page, so content and code can't be damaged.
import { streamChat } from './llm'
import { designPrompt } from './prompts'
import { visibleWords } from './hexpo'
import type { ModelOption } from '@/types'

const ids = (html: string) => new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]))

/** Structure view for the designer: all tags, classes, ids, CSS and scripts; long text elided. */
export function skeletonOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  for (const t of nodes) {
    if (t.parentElement?.closest('script,style')) continue
    const v = t.data.replace(/\s+/g, ' ').trim()
    if (v.length > 70) t.data = v.slice(0, 48) + ' …'
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}

export interface DesignParts {
  fonts: string
  css: string
  js: string
}

export function parseDesign(raw: string): DesignParts | null {
  const m = raw.match(/<<<FONTS>>>([\s\S]*?)<<<CSS>>>([\s\S]*?)<<<JS>>>([\s\S]*?)(?:<<<END>>>|$)/)
  if (!m) return null
  const strip = (s: string) => s.replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const css = strip(m[2]).replace(/^<style[^>]*>/i, '').replace(/<\/style>\s*$/i, '').trim()
  const js = strip(m[3]).replace(/^<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '').trim()
  return { fonts: strip(m[1]), css, js }
}

/** Insert the designer's layer into the writer's page. */
export function applyDesign(html: string, d: DesignParts): string {
  const fonts = [...d.fonts.matchAll(/<link\b[^>]*>/gi)]
    .map((x) => x[0])
    .filter((l) => /href=["']https:\/\/fonts\.(googleapis|gstatic)\.com(\/|["'])/i.test(l))
    .join('\n')
  const style = `${fonts}\n<style id="designer-style">\n${d.css.replace(/<\/style/gi, '<\\/style')}\n</style>`
  let out = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => style + '\n</head>') : style + html
  if (d.js) {
    const script = `<script id="designer-script">\n${d.js.replace(/<\/script/gi, '<\\/script')}\n</script>`
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, () => script + '\n</body>') : out.replace(/<\/html>/i, () => script + '</html>')
  }
  return out
}

/** Did the result keep the content and the code? Returns problems (empty = safe to use). */
export function checkDesign(raw: string, designed: string): string[] {
  const p: string[] = []
  if (!/<\/html>\s*$/i.test(designed)) p.push('document is not closed')
  const w0 = visibleWords(raw)
  const w1 = visibleWords(designed)
  if (w1 < w0 * 0.98) p.push(`content shrank (${w0} → ${w1} words)`)
  const s0 = (raw.match(/<script\b/gi) || []).length
  const s1 = (designed.match(/<script\b/gi) || []).length
  if (s1 < s0) p.push('scripts were removed')
  const lost = [...ids(raw)].filter((x) => !ids(designed).has(x))
  if (lost.length) p.push(`${lost.length} element ids were lost`)
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
    messages: [
      { role: 'user', content: designPrompt({ skeleton: skeletonOf(opts.rawHtml), title: opts.title, rejected: opts.rejected }) },
    ],
    maxTokens: 32000,
    temperature: 0.9,
    signal: opts.signal,
  })) {
    acc += d
    opts.onProgress?.(acc.length)
  }
  const parts = parseDesign(acc)
  if (!parts) return { ok: false, reason: 'designer did not follow the output format (<<<FONTS>>> <<<CSS>>> <<<JS>>> <<<END>>>)' }
  if (parts.css.length < 3000) return { ok: false, reason: 'stylesheet was too thin to be a real design' }
  const html = applyDesign(opts.rawHtml, parts)
  const problems = checkDesign(opts.rawHtml, html)
  if (problems.length) return { ok: false, reason: problems.join('; ') }
  return { ok: true, html }
}
