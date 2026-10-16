// GitHub access for the hexpo library repo: read registry/taxonomy, validate, publish in one commit.
import type { Course, PublishConfig } from '@/types'

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
  threshold: 75,
}

const API = 'https://api.github.com'

async function gh(cfg: PublishConfig, path: string, init?: RequestInit) {
  const res = await fetch(`${API}/repos/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
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
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(m[1]))
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

/** Namespaces localStorage under hx:<slug>: so courses can't collide on the live site. */
export function prefixStorage(html: string, slug: string): string {
  if (!/localStorage/.test(html) || html.includes(`hx:${slug}:`)) return html
  const shim = `<script>/* hx:${slug}: storage namespace */(function(){try{var s=window.localStorage,P='hx:${slug}:';var w={getItem:function(k){return s.getItem(P+k)},setItem:function(k,v){s.setItem(P+k,v)},removeItem:function(k){s.removeItem(P+k)},clear:function(){Object.keys(s).filter(function(k){return k.indexOf(P)===0}).forEach(function(k){s.removeItem(k)})},key:function(i){return Object.keys(s).filter(function(k){return k.indexOf(P)===0})[i]},get length(){return Object.keys(s).filter(function(k){return k.indexOf(P)===0}).length}};Object.defineProperty(window,'localStorage',{value:w,configurable:true})}catch(e){}})();</script>`
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + shim)
    : html.replace(/<html[^>]*>/i, (m) => m + shim)
}

export interface PublishOutcome {
  id: string
  file: string
  commit: string
  url: string
  updated: boolean
}

export async function publishCourse(
  cfg: PublishConfig,
  course: Course,
  onStatus: (s: string) => void = () => {},
): Promise<PublishOutcome> {
  const review = course.review
  if (!review?.passed) throw new Error('This course has not passed review.')
  if (review.htmlLength !== course.html.length)
    throw new Error('The HTML changed after review — run the review again.')

  for (let attempt = 1; attempt <= 3; attempt++) {
    onStatus(attempt === 1 ? 'Reading hexpo registry…' : `Registry moved — retrying (${attempt}/3)…`)
    const { tax, reg } = await loadHexpo(cfg)

    // stable id: reuse ours on re-publish; otherwise a unique slug
    const prior = course.published
    let id = prior?.id ?? slugify(course.title)
    if (!prior) {
      const base = id
      let n = 2
      while (reg.topics.some((t: any) => t.id === id)) id = `${base}-${n++}`
    } else if (!reg.topics.some((t: any) => t.id === id)) {
      // registry entry was removed upstream — treat as new
    }
    const file = `${id}.html`

    if (!tax.categories.some((c) => c.id === review.meta.category))
      throw new Error(`Category "${review.meta.category}" is not in hexpo's taxonomy — re-run review.`)
    if (!tax.formats.some((f) => f.id === review.meta.format))
      throw new Error(`Format "${review.meta.format}" is not in hexpo's taxonomy — re-run review.`)

    const html = prefixStorage(course.html, id)
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
      kicker: review.meta.kicker,
      blurb: review.meta.blurb,
      covers: review.meta.covers,
      concepts: review.meta.concepts.filter((c) => tax.concepts.some((x) => x.id === c.id)),
      related: [],
      books: [],
      generated: true,
      source: 'masterclass-foundry',
      model: course.modelId,
      reviewScore: review.valueScore,
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
        message: `masterclasses: ${updated ? 'update' : 'add'} ${course.title} (Foundry, review ${review.valueScore}/100)`,
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
    }
  }
  throw new Error('Could not publish — the branch kept moving. Try again.')
}
