// Repair HTML documents that a model cut off mid-stream (no </html>, unclosed <script>).
import { streamChat } from './llm'
import { looksTruncated } from './prompts'
import type { ProviderId } from '@/types'

const lastIdx = (s: string, re: RegExp) => {
  let at = -1
  for (const m of s.matchAll(re)) at = m.index ?? at
  return at
}

/** True when the document is cut off or has an unclosed <script>/<style>. */
export function isBroken(html: string): boolean {
  if (looksTruncated(html)) return true
  const open = (html.match(/<script\b/gi) || []).length
  const close = (html.match(/<\/script>/gi) || []).length
  return open !== close
}

/** Mechanical close: drop an unfinished <script>/<style>, trim a partial tag, add the closing tags. */
export function closeTruncated(html: string): string {
  let out = html
  for (const tag of ['script', 'style']) {
    const o = lastIdx(out, new RegExp(`<${tag}\\b`, 'gi'))
    const c = lastIdx(out, new RegExp(`</${tag}>`, 'gi'))
    if (o > c) out = out.slice(0, o)
  }
  out = out.replace(/<[^>]*$/, '')
  if (!/<\/body>/i.test(out)) out += '\n</body>'
  if (!/<\/html>/i.test(out)) out += '\n</html>'
  return out
}

/** Ask the writer to continue from where it was cut off (up to `rounds` times), then close mechanically. */
export async function repairTruncated(opts: {
  html: string
  provider: ProviderId
  apiKey: string
  model: string
  rounds?: number
  signal?: AbortSignal
  onStatus?: (s: string) => void
}): Promise<{ html: string; continued: boolean; closed: boolean }> {
  let html = opts.html
  let continued = false
  for (let i = 1; i <= (opts.rounds ?? 2) && isBroken(html); i++) {
    opts.onStatus?.(`Document was cut off — asking the model to finish it (${i}/${opts.rounds ?? 2})…`)
    let acc = ''
    for await (const d of streamChat({
      provider: opts.provider,
      apiKey: opts.apiKey,
      model: opts.model,
      messages: [
        {
          role: 'user',
          content: `An HTML document was cut off mid-output. Here are its last 14000 characters:\n\n<<<TAIL\n${html.slice(-14000)}\nTAIL>>>\n\nContinue it EXACTLY from the last character shown — even mid-word or mid-statement. Output ONLY the continuation text: no markdown fences, no repeating earlier text, no commentary. Finish every open section, close the <script>, </body> and </html>. Keep it as short as the remaining content allows.`,
        },
      ],
      maxTokens: 16000,
      temperature: 0.2,
      signal: opts.signal,
    })) acc += d
    acc = acc.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '')
    const end = acc.search(/<\/html>/i)
    if (end >= 0) acc = acc.slice(0, end + 7)
    if (!acc.trim()) break
    html += acc
    continued = true
  }
  const closed = isBroken(html)
  if (closed) html = closeTruncated(html)
  return { html, continued, closed }
}
