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

/** Notifikasi belum dibaca (maks 30) */
export async function fetchUnreadNotifications(): Promise<AdminNotification[]> {
  try {
    let snap
    try {
      snap = await getDocs(
        query(
          collection(db, 'adminNotifications'),
          where('read', '==', false),
          orderBy('createdAt', 'desc'),
          limit(30)
        )
      )
    } catch {
      snap = await getDocs(collection(db, 'adminNotifications'))
    }
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminNotification))
    return list
      .filter((n) => n.read === false)
      .sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0))
      .slice(0, 30)
  } catch {
    return []
  }
}

/** Setelah dilihat: tandai read lalu hapus dokumen. */
export async function dismissNotification(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminNotifications', id), { read: true })
  } catch {
    /* ignore */
  }
  try {
    await deleteDoc(doc(db, 'adminNotifications', id))
  } catch (err) {
    console.warn('dismissNotification delete', err)
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'adminNotifications', id), { read: true })
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => markNotificationRead(id)))
}

export async function dismissAllNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => dismissNotification(id)))
}

export function subscribePendingParentCount(onCount: (n: number) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'parentRequests'),
    (snap) => {
      const n = snap.docs.filter((d) => d.data().status === 'pending').length
      onCount(n)
    },
    () => onCount(0)
  )
}

export function subscribeUnreadNotifCount(onCount: (n: number) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminNotifications'),
    (snap) => {
      const n = snap.docs.filter((d) => d.data().read === false).length
      onCount(n)
    },
    () => onCount(0)
  )
}
