/**
 * Hitung peringkat dari (a) data mentah `attempts` atau (b) ringkasan `studentStats`.
 * Keduanya HARUS memberi hasil identik — diuji otomatis (lihat docs/PERINGKAT-RINGKASAN.md).
 */
import type { LatihanAttempt } from '../types/question'

export interface StatsBucket {
  c: string
  s: string
  sum: number
  n: number
  best: number
}

export interface StudentStats {
  id?: string
  key: string
  name: string
  studentId?: string
  className?: string
  buckets: StatsBucket[]
}

export interface RankFilters {
  /** Kosong / undefined = semua kelas */
  className?: string
  /** 'all' / undefined = semua mapel */
  subjectKey?: string
  /** Hanya untuk mode data mentah: peringkat satu paket. 'all' / undefined = semua */
  latihanId?: string
}

export interface BaseRankRow {
  key: string
  name: string
  studentId?: string
  className?: string
  attempts: number
  avg: number
  best: number
}

/** Identitas siswa: id bila ada, jika tidak nama (huruf kecil) — sama dengan statsKey di server. */
export function rowKey(s: { studentId?: string | null; studentName?: string }) {
  const id = String(s.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${String(s.studentName || '').trim().toLowerCase()}`
}

const all = (v?: string) => !v || v === 'all'

export function rankFromAttempts(
  attempts: LatihanAttempt[],
  subjectOf: (latihanId: string) => string | undefined,
  f: RankFilters
): BaseRankRow[] {
  const cls = (f.className || '').trim()
  const filtered = attempts.filter((a) => {
    if (cls && (a.studentClass || '').trim() !== cls) return false
    if (!all(f.latihanId)) {
      if (a.latihanId !== f.latihanId) return false
    } else if (!all(f.subjectKey)) {
      if (subjectOf(a.latihanId) !== f.subjectKey) return false
    }
    return true
  })

  const map = new Map<
    string,
    { name: string; studentId?: string; className?: string; sum: number; n: number; best: number }
  >()
  filtered.forEach((a) => {
    const key = rowKey(a)
    const cur = map.get(key) || {
      name: a.studentName || '—',
      studentId: a.studentId || undefined,
      className: a.studentClass || undefined,
      sum: 0,
      n: 0,
      best: 0,
    }
    const pct = a.percent ?? 0
    cur.sum += pct
    cur.n += 1
    if (pct > cur.best) cur.best = pct
    if (a.studentName) cur.name = a.studentName
    if (a.studentClass) cur.className = a.studentClass
    if (a.studentId) cur.studentId = a.studentId
    map.set(key, cur)
  })

  return [...map.entries()].map(([key, v]) => ({
    key,
    name: v.name,
    studentId: v.studentId,
    className: v.className,
    attempts: v.n,
    avg: v.n ? Math.round(v.sum / v.n) : 0,
    best: Math.round(v.best),
  }))
}

export function rankFromStats(stats: StudentStats[], f: RankFilters): BaseRankRow[] {
  const cls = (f.className || '').trim()
  const rows: BaseRankRow[] = []
  stats.forEach((st) => {
    let sum = 0
    let n = 0
    let best = 0
    let className = st.className
    st.buckets.forEach((b) => {
      if (cls && b.c !== cls) return
      if (!all(f.subjectKey) && b.s !== f.subjectKey) return
      sum += b.sum
      n += b.n
      if (b.best > best) best = b.best
      if (cls) className = b.c
    })
    if (n === 0) return
    rows.push({
      key: rowKey({ studentId: st.studentId, studentName: st.name }),
      name: st.name,
      studentId: st.studentId,
      className,
      attempts: n,
      avg: Math.round(sum / n),
      best: Math.round(best),
    })
  })
  return rows
}

/** Daftar kelas yang muncul di ringkasan (untuk dropdown admin). */
export function classesFromStats(stats: StudentStats[]): string[] {
  const s = new Set<string>()
  stats.forEach((st) => st.buckets.forEach((b) => b.c && s.add(b.c)))
  return [...s].sort((a, b) => a.localeCompare(b, 'id'))
}
