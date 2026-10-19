// GitHub access for the hexpo library repo: read registry/taxonomy, validate, publish in one commit.
import type { Course, PublishConfig, ReviewResult } from '@/types'

export interface Taxonomy {
  categories: { id: string; label: string; blurb: string }[]
  formats: { id: string; label: string; blurb: string }[]
  concepts: { id: string; label: string; definition: string }[]
}
export interface Registry {
  version: number
  affiliateTag?: string
  topics: any[]
  [k: string]: unknown
}

export const DEFAULT_PUBLISH: PublishConfig = {
  repo: 'ic4pi/hexpo',
  branch: 'main',
  dir: 'masterclasses',
  token: '',
  reviewerModelId: '',
  reviewerFallbackId: '',
  threshold: 75,
  maxRounds: 3,
}

const API = 'https://api.github.com'

async function gh(cfg: PublishConfig, path: string, init?: RequestInit) {
  let res: Response | undefined
  for (let n = 1; !res; n++) {
    try {
      res = await fetch(`${API}/repos/${cfg.repo}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      })
    } catch (e: any) {
      // fetch() rejects with a bare TypeError on dropped connections ("network error when attempting to fetch resources")
      if (n < 3) {
        await new Promise((r) => setTimeout(r, 800 * n))
        continue
      }
      throw new Error(`Couldn't reach GitHub (${e?.message ?? 'network error'}). Check your connection and retry.`)
    }
  }
  if (!res.ok) {
    let msg = ''
    try {
      msg = (await res.json())?.message ?? ''
    } catch {
      /* ignore */
    }
    const e: any = new Error(
      res.status === 401 || res.status === 403
        ? `GitHub rejected the token (${res.status}). It needs Contents: Read and write on ${cfg.repo}.`
        : res.status === 404
          ? `GitHub 404 — check repo name "${cfg.repo}", branch "${cfg.branch}" and that the token can see the repo.`
          : `GitHub ${res.status}: ${msg}`,
    )
    e.status = res.status
    throw e
  }
  return res.json()
}

async function readText(cfg: PublishConfig, file: string): Promise<string> {
  const j = await gh(cfg, `/contents/${file}?ref=${encodeURIComponent(cfg.branch)}`)
  if (j.content) {
    const bin = atob(j.content.replace(/\n/g, ''))
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  }
  // >1MB files come back without content — use the blob API
  const b = await gh(cfg, `/git/blobs/${j.sha}`)
  const bin = atob(b.content.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export async function loadHexpo(cfg: PublishConfig): Promise<{ tax: Taxonomy; reg: Registry }> {
  if (!cfg.token.trim()) throw new Error('Add a GitHub token in Settings → Publish first.')
  const [tax, reg] = await Promise.all([
    readText(cfg, `${cfg.dir}/taxonomy.json`).then(JSON.parse),
    readText(cfg, `${cfg.dir}/topics.json`).then(JSON.parse),
  ])
  return { tax, reg }
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'masterclass'

// ── validation: mirrors forge/lib.mjs validateHtml so nothing unpublishable gets pushed ──
export function visibleWords(html: string): number {
  const t = html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
  return t.split(/\s+/).filter(Boolean).length
}

export function validateForHexpo(html: string, slug: string, minWords = 1800): string[] {
  const p: string[] = []
  if (!/^<!doctype html/i.test(html)) p.push('does not start with <!DOCTYPE html>')
  if (!/<\/html>\s*$/i.test(html)) p.push('does not end with </html>')
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) p.push('missing viewport meta')
  if (!/<title>[^<]+<\/title>/i.test(html)) p.push('missing <title>')
  if (!/<script\b/i.test(html)) p.push('no <script> (page must be interactive)')
  const open = (html.match(/<script\b/gi) || []).length
  const close = (html.match(/<\/script>/gi) || []).length
  if (open !== close) p.push(`unbalanced <script> tags (${open}/${close})`)
  if (/<script\b[^>]*\bsrc=/i.test(html)) p.push('external <script src> not allowed')
  if (/\b(fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|navigator\.sendBeacon)/.test(html))
    p.push('network calls (fetch/XHR/WebSocket/sendBeacon) not allowed')
  for (const m of html.matchAll(/<link\b[^>]*href=["'](https?:[^"']+)["']/gi)) {
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(m[1]))
      p.push(`external stylesheet/link not allowed: ${m[1]}`)
  }
  if (/localStorage/.test(html) && !html.includes(`hx:${slug}:`))
    p.push(`localStorage keys must use prefix hx:${slug}:`)
  const words = visibleWords(html)
  if (words < minWords) p.push(`too short: ${words} words (min ${minWords})`)
  const bytes = new TextEncoder().encode(html).length
  if (bytes > 900_000) p.push(`too large: ${bytes} bytes (max 900000)`)
  let idx = 0
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    idx++
    const type = /type=["']([^"']+)["']/i.exec(m[1])?.[1]
    if (type && !/javascript/i.test(type)) continue
    try {
      // compile only — never executed
      new Function(m[2])
    } catch (e: any) {
      p.push(`JS syntax error in script ${idx}: ${e.message}`)
    }
  }
  return p
}

/** Fetch each external <script src> and put its code inline, so the course keeps working. Libraries that use
 *  network APIs hexpo bans are not inlined (that would fail its check); those and failed fetches are left for sanitizeForHexpo to strip. */
export async function inlineExternalScripts(
  html: string,
): Promise<{ html: string; inlined: string[]; failed: string[] }> {
  const inlined: string[] = []
  const failed: string[] = []
  const re = /<script\b([^>]*)\bsrc=["']?([^"'\s>]+)[^>]*>\s*<\/script>/gi
  const tags = [...html.matchAll(re)]
  if (!tags.length) return { html, inlined, failed }
  const code = new Map<string, string | null>()
  await Promise.all(
    [...new Set(tags.map((t) => t[2]))].map(async (src) => {
      try {
        const url = src.startsWith('//') ? 'https:' + src : src
        if (!/^https:\/\//i.test(url)) throw new Error('not https')
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
        if (!res.ok) throw new Error(String(res.status))
        const text = await res.text()
        if (!text.trim() || /^\s*</.test(text) || text.length > 600_000) throw new Error('unusable')
        if (/\b(fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|navigator\.sendBeacon)/.test(text)) throw new Error('uses network calls')
        code.set(src, text.replace(/<\/script/gi, '<\\/script'))
      } catch {
        code.set(src, null)
      }
    }),
  )
  const out = html.replace(re, (m, attrs, src) => {
    const text = code.get(src)
    if (!text) {
      failed.push(src)
      return m
    }
    inlined.push(src)
    const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1]
    return `<script${type ? ` type="${type}"` : ''}>/* inlined from ${src.replace(/\*\//g, '')} */\n${text}\n</script>`
  })
  return { html: out, inlined, failed }
}

/** Deterministic fixes for hexpo's rules: external scripts/links removed, viewport/title added. */
export function sanitizeForHexpo(html: string, title: string): { html: string; removed: string[] } {
  const removed: string[] = []
  let out = html
  // external <script src> (with or without body) — hexpo forbids them
  out = out.replace(/<script\b[^>]*\bsrc=["']?([^"'\s>]+)[^>]*>\s*<\/script>/gi, (_m, src) => {
    removed.push(src)
    return ''
  })
  out = out.replace(/<script\b[^>]*\bsrc=["']?([^"'\s>]+)[^>]*\/>/gi, (_m, src) => {
    removed.push(src)
    return ''
  })
  // external links other than Google Fonts
  out = out.replace(/<link\b[^>]*href=["'](https?:[^"']+)["'][^>]*>/gi, (m, href) => {
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(href)) return m
    removed.push(href)
    return ''
  })
  if (!/<meta[^>]+name=["']viewport["']/i.test(out))
    out = out.replace(/<head[^>]*>/i, (m) => m + '<meta name="viewport" content="width=device-width, initial-scale=1">')
  if (!/<title>[^<]+<\/title>/i.test(out)) {
    const t = `<title>${title.replace(/[<>&]/g, '')}</title>`
    out = /<title>\s*<\/title>/i.test(out) ? out.replace(/<title>\s*<\/title>/i, t) : out.replace(/<head[^>]*>/i, (m) => m + t)
  }
  return { html: out, removed }
}

/** Namespaces localStorage under hx:<slug>: so courses can't collide on the live site. */
export function prefixStorage(html: string, slug: string): string {
  if (!/localStorage/.test(html) || html.includes(`hx:${slug}:`)) return html
  const shim = `<script>/* hx:${slug}: storage namespace */(function(){try{var s=window.localStorage,P='hx:${slug}:';var w={getItem:function(k){return s.getItem(P+k)},setItem:function(k,v){s.setItem(P+k,v)},removeItem:function(k){s.removeItem(P+k)},clear:function(){Object.keys(s).filter(function(k){return k.indexOf(P)===0}).forEach(function(k){s.removeItem(k)})},key:function(i){return Object.keys(s).filter(function(k){return k.indexOf(P)===0})[i]},get length(){return Object.keys(s).filter(function(k){return k.indexOf(P)===0}).length}};Object.defineProperty(window,'localStorage',{value:w,configurable:true})}catch(e){}})();</script>`
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + shim)
    : html.replace(/<html[^>]*>/i, (m) => m + shim)
}

/** Catalogue metadata for a course published without an AI review. */
function fallbackReview(course: Course, tax: Taxonomy): ReviewResult {
  const m = course.meta
  const blurb = (course.summary || course.topic).replace(/\s+/g, ' ').trim().slice(0, 220)
  return {
    reviewerModelId: 'none',
    reviewerProvider: course.provider,
    reviewedAt: Date.now(),
    htmlLength: course.html.length,
    valueScore: 0,
    scores: { accuracy: 0, insight: 0, depth: 0, originality: 0, structure: 0, interactivity: 0 },
    verdict: 'publish',
    worthIt: '',
    strengths: [],
    issues: [],
    passed: true,
    threshold: 0,
    meta: {
      category: tax.categories[0].id,
      format: tax.formats[0].id,
      kicker: m ? `${m.number} · ${m.division.replace(/^\d+\s*/, '')}` : 'masterclass',
      blurb,
      covers: course.topicsCovered.slice(0, 7),
      concepts: [],
    },
  }
}

export interface PublishOutcome {
  id: string
  file: string
  commit: string
  url: string
  updated: boolean
  warnings: string[]
}

export async function publishCourse(
  cfg: PublishConfig,
  course: Course,
  onStatus: (s: string) => void = () => {},
): Promise<PublishOutcome> {
  // Manual publish needs no AI review: use the review's metadata when it is current, else derive it.
  const reviewed = course.review && course.review.htmlLength === course.html.length ? course.review : undefined

  const warnings: string[] = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    onStatus(attempt === 1 ? 'Reading hexpo registry…' : `Registry moved — retrying (${attempt}/3)…`)
    const { tax, reg } = await loadHexpo(cfg)

    // stable id: reuse ours on re-publish; otherwise a unique slug
    const prior = course.published
    const m = course.meta
    let id = prior?.id ?? (m?.filename ? m.filename.replace(/\.html$/i, '') : slugify(course.title))
    if (!prior) {
      // a numbered item that is already in hexpo is the same item: update it, never add a second copy
      const same = m ? reg.topics.find((t: any) => t.number === m.number || t.id === id) : undefined
      if (same) id = same.id
      const base = id
      let n = 2
      while (!same && reg.topics.some((t: any) => t.id === id)) id = `${base}-${n++}`
    } else if (!reg.topics.some((t: any) => t.id === id)) {
      // registry entry was removed upstream — treat as new
    }
    const file = `${id}.html`

    const review = reviewed ?? fallbackReview(course, tax)
    if (!tax.categories.some((c) => c.id === review.meta.category))
      throw new Error(`Category "${review.meta.category}" is not in hexpo's taxonomy — re-run review.`)
    if (!tax.formats.some((f) => f.id === review.meta.format))
      throw new Error(`Format "${review.meta.format}" is not in hexpo's taxonomy — re-run review.`)

    onStatus('Checking for external scripts…')
    const inl = await inlineExternalScripts(course.html)
    const clean = sanitizeForHexpo(inl.html, course.title)
    warnings.length = 0
    if (inl.inlined.length) warnings.push(`"${course.title}": inlined ${inl.inlined.length} external script(s) so it keeps working`)
    if (clean.removed.length)
      warnings.push(`"${course.title}": could not inline, so REMOVED: ${clean.removed.join(', ').slice(0, 200)} — check this page`)
    const html = prefixStorage(clean.html, id)
    const problems = validateForHexpo(html, id)
    if (problems.length)
      throw new Error(`Won't publish — hexpo's checks fail:\n• ${problems.join('\n• ')}`)

    const now = new Date().toISOString()
    const entry: any = {
      id,
      file,
      status: 'published',
      category: review.meta.category,
      format: review.meta.format,
      title: course.title,
      kicker: m ? `${m.number} · ${m.division.replace(/^\d+\s*/, '')}` : review.meta.kicker,
      blurb: review.meta.blurb,
      covers: review.meta.covers,
      concepts: review.meta.concepts.filter((c) => tax.concepts.some((x) => x.id === c.id)),
      related: [],
      books: [],
      generated: true,
      source: 'masterclass-foundry',
      model: course.modelId,
      ...(reviewed ? { reviewScore: review.valueScore } : {}),
      ...(m ? { number: m.number, decimalClass: m.cls, decimalDivision: m.division, decimalKind: m.kind, wave: m.wave } : {}),
      words: visibleWords(html),
      bytes: new TextEncoder().encode(html).length,
    }
    const at = reg.topics.findIndex((t: any) => t.id === id)
    const updated = at !== -1
    if (updated) {
      const old = reg.topics[at]
      reg.topics[at] = { ...old, ...entry, publishedAt: old.publishedAt ?? now, updatedAt: now }
    } else {
      reg.topics.push({ ...entry, publishedAt: now })
    }

    onStatus('Committing to ' + cfg.branch + '…')
    const ref = await gh(cfg, `/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
    const parentSha: string = ref.object.sha
    const parent = await gh(cfg, `/git/commits/${parentSha}`)
    const [blobHtml, blobReg] = await Promise.all([
      gh(cfg, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: html, encoding: 'utf-8' }) }),
      gh(cfg, '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: JSON.stringify(reg, null, 2) + '\n', encoding: 'utf-8' }),
      }),
    ])
    const tree = await gh(cfg, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [
          { path: `${cfg.dir}/${file}`, mode: '100644', type: 'blob', sha: blobHtml.sha },
          { path: `${cfg.dir}/topics.json`, mode: '100644', type: 'blob', sha: blobReg.sha },
        ],
      }),
    })
    const commit = await gh(cfg, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `masterclasses: ${updated ? 'update' : 'add'} ${course.title} (Foundry${reviewed ? `, review ${review.valueScore}/100` : ''})`,
        tree: tree.sha,
        parents: [parentSha],
      }),
    })
    try {
      await gh(cfg, `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      })
    } catch (e: any) {
      if (e.status === 422 && attempt < 3) continue // branch moved under us
      throw e
    }
    return {
      id,
      file,
      commit: commit.sha,
      url: `https://github.com/${cfg.repo}/commit/${commit.sha}`,
      updated,
      warnings,
    }
  }
  throw new Error('Could not publish — the branch kept moving. Try again.')
}
