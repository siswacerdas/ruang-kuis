import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from './firebase'

export interface StudentSession {
  studentId: string
  fullName: string
  nickname?: string
  email: string
  nisn?: string
  className?: string
  authUid?: string
}

const KEY = 'rk_student'

/** Baca sesi siswa dari localStorage (migrasi otomatis dari sessionStorage lama). */
export function getStudentSession(): StudentSession | null {
  try {
    const fromLocal = localStorage.getItem(KEY)
    if (fromLocal) return JSON.parse(fromLocal) as StudentSession

    // Migrasi sekali dari sessionStorage (versi lama)
    const fromSession = sessionStorage.getItem(KEY)
    if (fromSession) {
      localStorage.setItem(KEY, fromSession)
      sessionStorage.removeItem(KEY)
      return JSON.parse(fromSession) as StudentSession
    }
    return null
  } catch {
    return null
  }
}

export function setStudentSession(s: StudentSession): void {
  localStorage.setItem(KEY, JSON.stringify(s))
  // Bersihkan sisa versi lama
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function clearStudentSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem('rk_session')
    sessionStorage.removeItem('rk_result')
  } catch {
    /* ignore */
  }
}

/**
 * Pastikan sesi siswa tersedia.
 * - Jika sudah ada di localStorage → kembalikan.
 * - Jika Firebase Auth aktif & email terdaftar sebagai siswa → restore dari Firestore.
 * - Jika tidak → null (perlu login ulang).
 */
export async function ensureStudentSession(): Promise<StudentSession | null> {
  const existing = getStudentSession()
  if (existing?.studentId && existing.fullName) return existing

  const user = auth.currentUser
  if (!user?.email) return null

  try {
    const snap = await getDocs(
      query(collection(db, 'students'), where('email', '==', user.email.toLowerCase()))
    )
    if (snap.empty) return null

    const d = snap.docs[0]
    const data = d.data()
    const session: StudentSession = {
      studentId: d.id,
      fullName: data.fullName || '',
      nickname: data.nickname || '',
      email: data.email || user.email,
      nisn: data.nisn || '',
      className: data.className || '5A',
      authUid: user.uid,
    }
    if (!session.fullName) return null
    setStudentSession(session)
    return session
  } catch (err) {
    console.warn('ensureStudentSession', err)
    return null
  }
}
