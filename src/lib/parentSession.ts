import { collection, doc, getDocs, query, updateDoc, where, increment, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import {
  PARENT_SESSION_KEY,
  PARENT_LOGIN_COUNTED_KEY,
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
  try {
    sessionStorage.removeItem(PARENT_LOGIN_COUNTED_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Naikkan loginCount di Firestore sekali per sesi browser (bukan tiap navigasi).
 * Dipakai untuk lightbox panduan (tampil sampai 3 login).
 */
async function bumpLoginCountOnce(session: ParentSession): Promise<ParentSession> {
  try {
    if (sessionStorage.getItem(PARENT_LOGIN_COUNTED_KEY) === session.parentId) {
      return session
    }
  } catch {
    /* private mode */
  }

  let nextCount = (session.loginCount || 0) + 1
  try {
    await updateDoc(doc(db, 'parents', session.parentId), {
      loginCount: increment(1),
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('bumpLoginCount', err)
  }

  try {
    sessionStorage.setItem(PARENT_LOGIN_COUNTED_KEY, session.parentId)
  } catch {
    /* ignore */
  }

  const updated = { ...session, loginCount: nextCount }
  setParentSession(updated)
  return updated
}

function sessionFromDoc(
  id: string,
  data: Parent,
  email: string,
  authUid: string
): ParentSession {
  return {
    parentId: id,
    fullName: data.fullName || '',
    email: data.email || email,
    whatsapp: data.whatsapp || '',
    studentIds: Array.isArray(data.studentIds) ? data.studentIds : [],
    authUid,
    mustChangePassword: !!data.mustChangePassword,
    guideSeenAt: data.guideSeenAt
      ? String((data.guideSeenAt as { toDate?: () => Date }).toDate?.() ?? data.guideSeenAt)
      : null,
    loginCount: typeof data.loginCount === 'number' ? data.loginCount : 0,
  }
}

/**
 * Pastikan sesi ortu tersedia dari localStorage atau restore dari Firestore
 * berdasarkan email Auth yang sedang login.
 * Sekali per sesi browser: naikkan loginCount.
 */
export async function ensureParentSession(): Promise<ParentSession | null> {
  const user = auth.currentUser
  if (!user?.email) return null

  const email = user.email.toLowerCase()
  const existing = getParentSession()

  // Hanya percaya localStorage jika email sesi == email Auth saat ini.
  // Sesi ortu basi / sisa uji tidak boleh mengalihkan login guru/siswa/dummy lain.
  if (
    existing?.parentId &&
    existing.email &&
    Array.isArray(existing.studentIds) &&
    existing.email.toLowerCase() === email
  ) {
    try {
      if (sessionStorage.getItem(PARENT_LOGIN_COUNTED_KEY) === existing.parentId) {
        return existing
      }
    } catch {
      /* private mode */
    }
    try {
      const snap = await getDocs(
        query(collection(db, 'parents'), where('email', '==', email))
      )
      if (!snap.empty) {
        const d = snap.docs[0]
        const data = d.data() as Parent
        if (data.active === false) {
          clearParentSession()
          return null
        }
        const fresh = sessionFromDoc(d.id, data, user.email, user.uid)
        if (!fresh.fullName) {
          clearParentSession()
          return null
        }
        return bumpLoginCountOnce(fresh)
      }
      // Auth email tidak ada di parents → sesi basi
      clearParentSession()
      return null
    } catch (err) {
      console.warn('ensureParentSession refresh', err)
      return existing
    }
  }

  if (existing) clearParentSession()

  try {
    const snap = await getDocs(
      query(collection(db, 'parents'), where('email', '==', email))
    )
    if (snap.empty) return null

    const d = snap.docs[0]
    const data = d.data() as Parent
    if (data.active === false) return null

    const session = sessionFromDoc(d.id, data, user.email, user.uid)
    if (!session.fullName) return null
    setParentSession(session)
    return bumpLoginCountOnce(session)
  } catch (err) {
    console.warn('ensureParentSession', err)
    return null
  }
}
