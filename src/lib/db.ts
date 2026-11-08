// Minimal IndexedDB wrapper — course HTML is far too big for localStorage.
import type { Course, Series } from '@/types'

const DB_NAME = 'masterclass-foundry'
// RULE: never delete or rename these stores/keys, and never lower DB_VERSION. A change needs a migration in
// onupgradeneeded that copies existing data, and the UI must warn and offer a backup before any destructive step.
const DB_VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('courses')) {
        db.createObjectStore('courses', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('series')) {
        db.createObjectStore('series', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  store: 'courses' | 'series',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export const db = {
  putCourse: (c: Course) => tx('courses', 'readwrite', (s) => s.put(c) as IDBRequest<any>),
  getCourse: (id: string) => tx<Course | undefined>('courses', 'readonly', (s) => s.get(id)),
  allCourses: () => tx<Course[]>('courses', 'readonly', (s) => s.getAll()),
  delCourse: (id: string) => tx('courses', 'readwrite', (s) => s.delete(id) as IDBRequest<any>),

  putSeries: (s: Series) => tx('series', 'readwrite', (st) => st.put(s) as IDBRequest<any>),
  allSeries: () => tx<Series[]>('series', 'readonly', (st) => st.getAll()),
  delSeries: (id: string) => tx('series', 'readwrite', (st) => st.delete(id) as IDBRequest<any>),
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
