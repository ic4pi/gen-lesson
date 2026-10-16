import type { Course } from '@/types'

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'masterclass'
  )
}

export function downloadCourse(c: Course) {
  const name = c.part ? `${slug(c.title)}-part-${c.part}.html` : `${slug(c.title)}.html`
  const blob = new Blob([c.html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
