/**
 * Mata pelajaran dinamis (Firestore `subjects`).
 * Daftar default di types/question.ts dipakai sebagai seed & fallback offline.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  SUBJECTS as DEFAULT_SUBJECTS,
  registerSubjectLookup,
  type Subject,
} from '../types/question'

export type SubjectDoc = Subject & {
  order: number
  active: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

const COL = 'subjects'

let cache: SubjectDoc[] | null = null
let seedPromise: Promise<void> | null = null

function refreshLookup() {
  registerSubjectLookup((key) => getCachedSubjects(false).find((s) => s.key === key))
}

// Daftarkan lookup segera (fallback default)
refreshLookup()

export function getCachedSubjects(activeOnly = true): SubjectDoc[] {
  const list = cache ?? DEFAULT_SUBJECTS.map((s, i) => ({ ...s, order: i + 1, active: true }))
  return activeOnly ? list.filter((s) => s.active !== false) : [...list]
}

export function getSubjectFromCache(key: string): SubjectDoc | undefined {
  return getCachedSubjects(false).find((s) => s.key === key)
}

export function normalizeSubjectKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

const COLOR_OPTIONS = [
  'rose', 'red', 'emerald', 'purple', 'amber', 'blue', 'teal', 'indigo',
  'green', 'orange', 'cyan', 'pink', 'lime', 'sky', 'violet',
] as const

export { COLOR_OPTIONS }

async function seedIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    try {
      const snap = await getDocs(collection(db, COL))
      if (!snap.empty) return
      const batch = writeBatch(db)
      DEFAULT_SUBJECTS.forEach((s, i) => {
        batch.set(doc(db, COL, s.key), {
          key: s.key,
          name: s.name,
          shortName: s.shortName,
          color: s.color,
          icon: s.icon,
          order: i + 1,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
    } catch (err) {
      console.warn('subjects seed', err)
    }
  })()
  return seedPromise
}

function mapDocs(
  docs: { id: string; data: () => Record<string, unknown> }[],
): SubjectDoc[] {
  return docs
    .map((d) => {
      const data = d.data()
      return {
        key: String(data.key || d.id),
        name: String(data.name || d.id),
        shortName: String(data.shortName || data.name || d.id).slice(0, 12),
        color: String(data.color || 'indigo'),
        icon: String(data.icon || '📚'),
        order: typeof data.order === 'number' ? data.order : 99,
        active: data.active !== false,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } satisfies SubjectDoc
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'id'))
}

export async function loadSubjects(activeOnly = true): Promise<SubjectDoc[]> {
  await seedIfEmpty()
  try {
    let snap
    try {
      snap = await getDocs(query(collection(db, COL), orderBy('order', 'asc')))
    } catch {
      snap = await getDocs(collection(db, COL))
    }
    const list = mapDocs(snap.docs)
    cache = list.length ? list : DEFAULT_SUBJECTS.map((s, i) => ({ ...s, order: i + 1, active: true }))
    refreshLookup()
    return getCachedSubjects(activeOnly)
  } catch (err) {
    console.warn('loadSubjects fallback', err)
    cache = DEFAULT_SUBJECTS.map((s, i) => ({ ...s, order: i + 1, active: true }))
    refreshLookup()
    return getCachedSubjects(activeOnly)
  }
}

export function subscribeSubjects(
  onData: (list: SubjectDoc[]) => void,
  onError?: (err: Error) => void,
): () => void {
  void seedIfEmpty()
  return onSnapshot(
    collection(db, COL),
    (snap) => {
      const list = mapDocs(snap.docs)
      cache =
        list.length > 0
          ? list
          : DEFAULT_SUBJECTS.map((s, i) => ({ ...s, order: i + 1, active: true }))
      refreshLookup()
      onData([...cache])
    },
    (err) => {
      console.error(err)
      onError?.(err)
      onData(getCachedSubjects(false))
    },
  )
}

export async function saveSubject(
  input: Omit<SubjectDoc, 'createdAt' | 'updatedAt'> & { key: string },
  isNew: boolean,
): Promise<void> {
  const key = normalizeSubjectKey(input.key)
  if (!key) throw new Error('Kunci mapel tidak valid')
  if (!input.name.trim()) throw new Error('Nama mapel wajib diisi')

  const ref = doc(db, COL, key)
  const payload: Record<string, unknown> = {
    key,
    name: input.name.trim(),
    shortName: (input.shortName || input.name).trim().slice(0, 12),
    color: input.color || 'indigo',
    icon: (input.icon || '📚').trim().slice(0, 8),
    order: Number(input.order) || 99,
    active: input.active !== false,
    updatedAt: serverTimestamp(),
  }
  if (isNew) payload.createdAt = serverTimestamp()
  await setDoc(ref, payload, { merge: true })

  const next = getCachedSubjects(false).filter((s) => s.key !== key)
  next.push({
    key,
    name: payload.name as string,
    shortName: payload.shortName as string,
    color: payload.color as string,
    icon: payload.icon as string,
    order: payload.order as number,
    active: payload.active as boolean,
  })
  cache = next.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'id'))
  refreshLookup()
}

export async function setSubjectActive(key: string, active: boolean): Promise<void> {
  await setDoc(doc(db, COL, key), { active, updatedAt: serverTimestamp() }, { merge: true })
  if (cache) {
    cache = cache.map((s) => (s.key === key ? { ...s, active } : s))
    refreshLookup()
  }
}

export async function removeSubject(key: string): Promise<void> {
  await deleteDoc(doc(db, COL, key))
  if (cache) {
    cache = cache.filter((s) => s.key !== key)
    refreshLookup()
  }
}
