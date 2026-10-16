// Turns a pasted contents page / outline / list into topic candidates.
export interface ParsedTopic {
  topic: string
  notes: string
}

const SPLIT = /\s+[—–]\s+|\s+-\s+/

export function parseContents(text: string): ParsedTopic[] {
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
