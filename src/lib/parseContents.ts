// Turns a pasted contents page / outline / list into topic candidates.
export interface ParsedTopic {
  topic: string
  notes: string
}

const SPLIT = /\s+[—–]\s+|\s+-\s+/

function fromStructured(text: string): ParsedTopic[] | null {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      let j = JSON.parse(t)
      if (!Array.isArray(j)) j = j.topics ?? j.items ?? []
      const out = (j as any[])
        .map((x) =>
          typeof x === 'string'
            ? { topic: x.trim(), notes: '' }
            : {
                topic: String(x?.topic ?? x?.title ?? x?.name ?? '').trim(),
                notes: String(x?.notes ?? x?.angle ?? x?.description ?? x?.desc ?? '').trim(),
              },
        )
        .filter((x) => x.topic.length >= 3)
      return out.length ? out : null
    } catch {
      return null
    }
  }
  // CSV with a header row containing topic/title
  const lines = t.split(/\r?\n/)
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const ti = head.findIndex((h) => ['topic', 'title', 'name'].includes(h))
  if (ti === -1 || head.length < 2) return null
  const ni = head.findIndex((h) => ['notes', 'angle', 'description', 'desc'].includes(h))
  const cells = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim())
  const out = lines
    .slice(1)
    .map((l) => cells(l))
    .map((c) => ({ topic: c[ti] ?? '', notes: ni >= 0 ? (c[ni] ?? '') : '' }))
    .filter((x) => x.topic.length >= 3)
  return out.length ? out : null
}

export function parseContents(text: string): ParsedTopic[] {
  const structured = fromStructured(text)
  if (structured) {
    const seen = new Set<string>()
    return structured.filter((x) => !seen.has(x.topic.toLowerCase()) && !!seen.add(x.topic.toLowerCase()))
  }
  const out: ParsedTopic[] = []
  const seen = new Set<string>()
  let section = ''

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || /^[-=_*~\s]{3,}$/.test(line)) continue

    const isHeading = /^#{1,6}\s/.test(line)
    line = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*•▪◦‣+☐☑✓•]\s+/, '')
      .replace(/^\(?\d{1,3}[.)\]:]\s+/, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s*[.·…]{3,}\s*\d*\s*$/, '') // dot leaders + page number
      .replace(/^["“”']+|["“”']+$/g, '')
      .trim()
    if (line.length < 3) continue

    const letters = line.replace(/[^A-Za-z]/g, '')
    const isCaps = letters.length > 3 && line === line.toUpperCase()
    if (isHeading || isCaps || /:$/.test(line)) {
      section = line.replace(/:$/, '').trim()
      continue
    }

    const [topicRaw, ...rest] = line.split(SPLIT)
    const topic = topicRaw.trim()
    if (topic.length < 3 || topic.length > 200) continue
    const key = topic.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const desc = rest.join(' — ').trim()
    const ctx = section ? `Library section: ${section}.` : ''
    out.push({ topic, notes: [desc, ctx].filter(Boolean).join(' ') })
  }
  return out
}
