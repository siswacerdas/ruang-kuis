/** Progress pengerjaan kuis — localStorage agar bisa dilanjutkan setelah keluar */

export interface QuizProgress {
  latihanId: string
  studentKey: string
  questionIds: string[]
  answers: Record<string, number[]>
  current: number
  startedAt: number
  /** Batas waktu absolut (ms); null = tanpa batas */
  deadlineAt: number | null
  timePerQ: Record<string, number>
  updatedAt: number
}

export function studentKey(s: { studentId?: string; studentName?: string }) {
  return (s.studentId || s.studentName || 'anon').toLowerCase().trim()
}

export function progressKey(latihanId: string, sess: { studentId?: string; studentName?: string }) {
  return `rk_quiz_progress_${latihanId}_${studentKey(sess)}`
}

export function loadProgress(
  latihanId: string,
  sess: { studentId?: string; studentName?: string }
): QuizProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(latihanId, sess))
    if (!raw) return null
    const p = JSON.parse(raw) as QuizProgress
    if (p.latihanId !== latihanId) return null
    if (p.studentKey !== studentKey(sess)) return null
    // Kadaluarsa 48 jam
    if (Date.now() - (p.updatedAt || 0) > 48 * 60 * 60 * 1000) {
      localStorage.removeItem(progressKey(latihanId, sess))
      return null
    }
    return p
  } catch {
    return null
  }
}

export function saveProgress(
  latihanId: string,
  sess: { studentId?: string; studentName?: string },
  data: Omit<QuizProgress, 'latihanId' | 'studentKey' | 'updatedAt'>
) {
  try {
    const payload: QuizProgress = {
      ...data,
      latihanId,
      studentKey: studentKey(sess),
      updatedAt: Date.now(),
    }
    localStorage.setItem(progressKey(latihanId, sess), JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function clearProgress(
  latihanId: string,
  sess: { studentId?: string; studentName?: string }
) {
  try {
    localStorage.removeItem(progressKey(latihanId, sess))
  } catch {
    /* ignore */
  }
}

/** Acak deterministik berdasarkan seed (siswa + paket) agar urutan stabil saat resume */
export function shuffleSeeded<T>(arr: T[], seed: string): T[] {
  const a = [...arr]
  let hash = 2166136261
  for (const ch of seed) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
  for (let i = a.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
    const j = (hash >>> 0) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
