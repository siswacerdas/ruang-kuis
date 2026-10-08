import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from './firebase'
import {
  PARENT_SESSION_KEY,
  type Parent,
  type ParentSession,
} from '../types/parent'

export function getParentSession(): ParentSession | null {
  try {
    const raw = localStorage.getItem(PARENT_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ParentSession
  } catch {
    return null
  }
}

export function setParentSession(s: ParentSession): void {
  localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(s))
}

export function clearParentSession(): void {
  try {
    localStorage.removeItem(PARENT_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Pastikan sesi ortu tersedia dari localStorage atau restore dari Firestore
 * berdasarkan email Auth yang sedang login.
 */
export async function ensureParentSession(): Promise<ParentSession | null> {
  const existing = getParentSession()
  if (existing?.parentId && existing.email && existing.studentIds?.length >= 0) {
    return existing
  }

  const user = auth.currentUser
  if (!user?.email) return null

  try {
    const snap = await getDocs(
      query(collection(db, 'parents'), where('email', '==', user.email.toLowerCase()))
    )
    if (snap.empty) return null

    const d = snap.docs[0]
    const data = d.data() as Parent
    if (data.active === false) return null

    const session: ParentSession = {
      parentId: d.id,
      fullName: data.fullName || '',
      email: data.email || user.email,
      whatsapp: data.whatsapp || '',
      studentIds: Array.isArray(data.studentIds) ? data.studentIds : [],
      authUid: user.uid,
      mustChangePassword: !!data.mustChangePassword,
      guideSeenAt: data.guideSeenAt
        ? String((data.guideSeenAt as { toDate?: () => Date }).toDate?.() ?? data.guideSeenAt)
        : null,
    }
    if (!session.fullName) return null
    setParentSession(session)
    return session
  } catch (err) {
    console.warn('ensureParentSession', err)
    return null
  }
}
