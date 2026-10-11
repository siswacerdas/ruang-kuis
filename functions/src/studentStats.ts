/**
 * Ringkasan peringkat per siswa (murni, tanpa Firestore) — dipakai fungsi `syncStudentStats`
 * dan skrip backfill. Bentuk dokumen `studentStats/{docId}`:
 *   { key, name, studentId?, className?, buckets: [{ c: kelas, s: mapel, sum, n, best }] }
 *
 * Bucket = (kelas, mapel). Halaman peringkat menjumlahkan bucket sesuai filter kelas/mapel,
 * sehingga hasilnya sama persis dengan menghitung dari seluruh dokumen `attempts`.
 */
import { createHash } from 'crypto'

export interface AttemptLike {
  studentId?: string | null
  studentName?: string
  studentClass?: string
  percent?: number
  latihanId?: string
  finishedAt?: unknown
}

export interface StatsBucket {
  c: string
  s: string
  sum: number
  n: number
  best: number
}

export interface StudentStatsDoc {
  key: string
  name: string
  studentId?: string
  className?: string
  buckets: StatsBucket[]
}

/** Identitas siswa: studentId bila ada, jika tidak nama (huruf kecil). */
export function statsKey(a: AttemptLike): string {
  const id = String(a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${String(a.studentName || '').trim().toLowerCase()}`
}

export function statsDocId(key: string): string {
  const slug = key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60)
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 10)
  return `${slug}_${hash}`
}

function toMs(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? 0 : t
  }
  const x = v as { toDate?: () => Date; seconds?: number }
  if (typeof x.toDate === 'function') return x.toDate().getTime()
  if (typeof x.seconds === 'number') return x.seconds * 1000
  return 0
}

export function buildStudentStats(
  attempts: AttemptLike[],
  subjectOf: (latihanId?: string) => string | undefined
): StudentStatsDoc[] {
  const groups = new Map<
    string,
    {
      doc: StudentStatsDoc
      buckets: Map<string, StatsBucket>
      latestMs: number
    }
  >()

  attempts.forEach((a, idx) => {
    const key = statsKey(a)
    let g = groups.get(key)
    if (!g) {
      g = {
        doc: { key, name: '', buckets: [] },
        buckets: new Map(),
        latestMs: -1,
      }
      groups.set(key, g)
    }
    const c = String(a.studentClass || '').trim()
    const s = subjectOf(a.latihanId) || ''
    const bk = `${c}\u0000${s}`
    const b = g.buckets.get(bk) || { c, s, sum: 0, n: 0, best: 0 }
    const pct = typeof a.percent === 'number' ? a.percent : 0
    b.sum += pct
    b.n += 1
    if (pct > b.best) b.best = pct
    g.buckets.set(bk, b)

    // nama / kelas / id terbaru (berdasarkan waktu selesai; urutan data sebagai pemutus)
    const ms = toMs(a.finishedAt) * 1000 + Math.min(idx, 999)
    if (ms >= g.latestMs) {
      g.latestMs = ms
      if (a.studentName) g.doc.name = String(a.studentName)
      if (a.studentClass) g.doc.className = String(a.studentClass)
      if (a.studentId) g.doc.studentId = String(a.studentId)
    }
  })

  return [...groups.values()].map((g) => ({
    ...g.doc,
    name: g.doc.name || '—',
    buckets: [...g.buckets.values()],
  }))
}
