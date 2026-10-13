import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { AdminNotification } from '../types/parent'

export function toMillis(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? null : t
  }
  const any = v as { toDate?: () => Date; seconds?: number }
  if (any?.toDate) return any.toDate().getTime()
  if (any?.seconds) return any.seconds * 1000
  return null
}

export function formatNotifTime(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Jumlah pengajuan ortu berstatus pending */
export async function countPendingParentRequests(): Promise<number> {
  try {
    const snap = await getDocs(
      query(collection(db, 'parentRequests'), where('status', '==', 'pending'))
    )
    return snap.size
  } catch {
    try {
      const all = await getDocs(collection(db, 'parentRequests'))
      return all.docs.filter((d) => d.data().status === 'pending').length
    } catch {
      return 0
    }
  }
}

function mapNotifDocs(
  docs: { id: string; data: () => Record<string, unknown> }[]
): AdminNotification[] {
  return docs
    .map((d) => ({ id: d.id, ...d.data() } as AdminNotification))
    .filter((n) => n.read === false)
    .sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0))
    .slice(0, 30)
}

/**
 * Notifikasi belum dibaca (maks 30).
 * Urutan preferensi query:
 * 1) where(read==false) + orderBy(createdAt) + limit  — butuh composite index
 * 2) where(read==false) + limit                       — tanpa index order
 * 3) full collection + filter client                   — terakhir, hindari jika bisa
 */
export async function fetchUnreadNotifications(): Promise<AdminNotification[]> {
  const col = collection(db, 'adminNotifications')
  try {
    try {
      const snap = await getDocs(
        query(col, where('read', '==', false), orderBy('createdAt', 'desc'), limit(30))
      )
      return mapNotifDocs(snap.docs)
    } catch {
      /* index composite belum ada */
    }
    try {
      const snap = await getDocs(query(col, where('read', '==', false), limit(30)))
      return mapNotifDocs(snap.docs)
    } catch {
      /* where saja gagal (jarang) */
    }
    const snap = await getDocs(query(col, limit(80)))
    return mapNotifDocs(snap.docs)
  } catch {
    return []
  }
}

/**
 * Setelah dilihat: hapus dokumen agar lonceng hanya berisi yang baru.
 * Jika delete gagal (rules/jaringan), fallback tandai read=true.
 */
export async function dismissNotification(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'adminNotifications', id))
    return
  } catch (err) {
    console.warn('dismissNotification delete', err)
  }
  try {
    await updateDoc(doc(db, 'adminNotifications', id), { read: true })
  } catch (err) {
    console.warn('dismissNotification mark read', err)
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'adminNotifications', id), { read: true })
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => markNotificationRead(id)))
}

/** Hapus semua notifikasi yang tampil di lonceng. */
export async function dismissAllNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => dismissNotification(id)))
}

/**
 * Satu listener bersama per jenis hitungan (bukan satu per komponen/halaman).
 *
 * Query difilter di server; semua komponen berbagi satu listener; listener
 * ditahan 60 detik setelah komponen terakhir lepas supaya pindah halaman
 * tidak memulai ulang (dan menagih ulang) pembacaan.
 */
const HUB_GRACE_MS = 60_000

function createCountHub(start: (emit: (n: number) => void, fail: () => void) => Unsubscribe) {
  const listeners = new Set<(n: number) => void>()
  let last: number | null = null
  let unsub: Unsubscribe | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = null
    unsub?.()
    unsub = null
    last = null
  }

  return (onCount: (n: number) => void): Unsubscribe => {
    listeners.add(onCount)
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (last !== null) onCount(last)
    if (!unsub) {
      unsub = start(
        (n) => {
          last = n
          listeners.forEach((l) => l(n))
        },
        () => {
          unsub = null
          last = null
          listeners.forEach((l) => l(0))
        }
      )
    }
    return () => {
      listeners.delete(onCount)
      if (listeners.size === 0 && !timer) {
        timer = setTimeout(stop, HUB_GRACE_MS)
      }
    }
  }
}

/** Jumlah pengajuan ortu berstatus pending (badge nav). */
export const subscribePendingParentCount = createCountHub((emit, fail) =>
  onSnapshot(
    query(collection(db, 'parentRequests'), where('status', '==', 'pending')),
    (snap) => emit(snap.size),
    () => fail()
  )
)

/** Jumlah notifikasi belum dibaca (badge lonceng real-time). */
export const subscribeUnreadNotifCount = createCountHub((emit, fail) =>
  onSnapshot(
    query(collection(db, 'adminNotifications'), where('read', '==', false)),
    (snap) => emit(snap.size),
    () => fail()
  )
)
