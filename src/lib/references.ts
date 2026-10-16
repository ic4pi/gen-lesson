// Style references: real pages whose level of craft the writer should match.
// Drop more .html files into /references and they appear in the picker.
import { skeletonOf } from './design'

const files = import.meta.glob('../../references/*.html', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>

const LABELS: Record<string, string> = {
  'novelty-theory': 'Novelty Theory (neon, timewave + spiral instruments)',
  'the-chosen-one': 'The Chosen One (editorial, sigil canvas, drawers)',
  'shadow-codex': 'The Shadow Codex (chapters, saved exercises, journal export)',
}

const idOf = (path: string) => path.split('/').pop()!.replace(/\.html$/, '')

export const REFERENCE_OPTIONS: { id: string; label: string }[] = Object.keys(files)
  .map((p) => ({
    id: `builtin:${idOf(p)}`,
    label: LABELS[idOf(p)] ?? idOf(p).replace(/-/g, ' '),
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** Full CSS and JS of the reference with prose elided, capped to keep the prompt affordable. */
export function referenceExcerpt(html: string): string {
  const sk = skeletonOf(html)
  if (sk.length <= 70000) return sk
  const styles = (sk.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n').slice(0, 30000)
  const scripts = (sk.match(/<script[\s\S]*?<\/script>/gi) || []).join('\n').slice(0, 30000)
  const body = (sk.match(/<body[\s\S]*<\/body>/i)?.[0] ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 9000)
  return `${styles}\n${body}\n${scripts}`
}

export async function loadReference(id: string): Promise<string | null> {
  if (!id || id === 'none') return null
  const path = Object.keys(files).find((p) => `builtin:${idOf(p)}` === id)
  if (!path) return null
  try {
    return referenceExcerpt(await files[path]())
  } catch {
    return null
  }
}
