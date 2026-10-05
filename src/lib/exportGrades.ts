import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

/** Escape satu sel CSV (RFC 4180 sederhana). */
function cell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [
    headers.map(cell).join(','),
    ...rows.map((r) => r.map(cell).join(',')),
  ]
  // BOM agar Excel Windows mengenali UTF-8
  return '\uFEFF' + lines.join('\r\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function studentKey(a: { studentId?: string | null; studentName: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${(a.studentName || '').trim().toLowerCase()}`
}

function toMillis(v: unknown): number | null {
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

function formatDate(ms: number | null) {
  if (!ms) return ''
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface GradeExportInput {
  attempts: LatihanAttempt[]
  paketMap: Map<string, LatihanPaket>
  /** Filter mapel aktif (kosong = semua) */
  filterSubject?: string
  filterClass?: string
}

/**
 * Matriks nilai akhir per mapel (rata-rata percent per subjectKey).
 * Kolom: Nama, Kelas, [mapel...], Rata-rata, Jumlah Kuis
 */
export function buildNilaiPerMapelCsv(input: GradeExportInput): string {
  const { attempts, paketMap, filterSubject, filterClass } = input

  const filtered = attempts.filter((a) => {
    if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
    if (filterSubject) {
      const p = paketMap.get(a.latihanId)
      if (!p || p.subjectKey !== filterSubject) return false
    }
    return true
  })

  // subject keys that appear
  const subjectSet = new Set<string>()
  filtered.forEach((a) => {
    const sk = paketMap.get(a.latihanId)?.subjectKey
    if (sk) subjectSet.add(sk)
  })
  const subjectKeys = (
    filterSubject
      ? [filterSubject]
      : SUBJECTS.map((s) => s.key).filter((k) => subjectSet.has(k))
  ) as SubjectKey[]
  // include unknown subjects at end
  subjectSet.forEach((k) => {
    if (!subjectKeys.includes(k as SubjectKey)) subjectKeys.push(k as SubjectKey)
  })

  type Agg = {
    name: string
    className: string
    bySub: Map<string, { sum: number; n: number }>
    totalSum: number
    totalN: number
  }
  const byStudent = new Map<string, Agg>()

  filtered.forEach((a) => {
    const key = studentKey(a)
    const cur =
      byStudent.get(key) ||
      ({
        name: a.studentName || '—',
        className: (a.studentClass || '').trim(),
        bySub: new Map(),
        totalSum: 0,
        totalN: 0,
      } as Agg)
    if (a.studentName) cur.name = a.studentName
    if (a.studentClass) cur.className = a.studentClass.trim()
    const sk = paketMap.get(a.latihanId)?.subjectKey || 'unknown'
    const sub = cur.bySub.get(sk) || { sum: 0, n: 0 }
    const pct = a.percent ?? 0
    sub.sum += pct
    sub.n += 1
    cur.bySub.set(sk, sub)
    cur.totalSum += pct
    cur.totalN += 1
    byStudent.set(key, cur)
  })

  const headers = [
    'No',
    'Nama Siswa',
    'Kelas',
    ...subjectKeys.map((k) => getSubject(k)?.shortName || k),
    'Rata-rata',
    'Jumlah Kuis',
  ]

  const rows = [...byStudent.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    .map((s, i) => {
      const subScores = subjectKeys.map((k) => {
        const v = s.bySub.get(k)
        return v && v.n ? Math.round(v.sum / v.n) : ''
      })
      const avg = s.totalN ? Math.round(s.totalSum / s.totalN) : ''
      return [i + 1, s.name, s.className || '', ...subScores, avg, s.totalN]
    })

  return rowsToCsv(headers, rows)
}

/**
 * Rekap per siswa: keseluruhan + ringkas.
 * Kolom: No, Nama, Kelas, Jumlah Kuis, Rata-rata, Skor Terbaik, Benar/Total, Waktu (menit), Terakhir
 */
export function buildRekapSiswaCsv(input: GradeExportInput): string {
  const { attempts, paketMap, filterSubject, filterClass } = input

  const filtered = attempts.filter((a) => {
    if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
    if (filterSubject) {
      const p = paketMap.get(a.latihanId)
      if (!p || p.subjectKey !== filterSubject) return false
    }
    return true
  })

  type Agg = {
    name: string
    className: string
    n: number
    sumPct: number
    best: number
    score: number
    totalQ: number
    ms: number
    lastAt: number | null
  }
  const map = new Map<string, Agg>()

  filtered.forEach((a) => {
    const key = studentKey(a)
    const cur =
      map.get(key) ||
      ({
        name: a.studentName || '—',
        className: (a.studentClass || '').trim(),
        n: 0,
        sumPct: 0,
        best: 0,
        score: 0,
        totalQ: 0,
        ms: 0,
        lastAt: null as number | null,
      } as Agg)
    if (a.studentName) cur.name = a.studentName
    if (a.studentClass) cur.className = a.studentClass.trim()
    const pct = a.percent ?? 0
    cur.n += 1
    cur.sumPct += pct
    if (pct > cur.best) cur.best = pct
    cur.score += a.score || 0
    cur.totalQ += a.total || 0
    cur.ms += a.durationMs || 0
    const fin = toMillis(a.finishedAt) || toMillis(a.startedAt)
    if (fin && (cur.lastAt == null || fin > cur.lastAt)) cur.lastAt = fin
    map.set(key, cur)
  })

  const headers = [
    'No',
    'Nama Siswa',
    'Kelas',
    'Jumlah Kuis',
    'Rata-rata (%)',
    'Skor Terbaik (%)',
    'Benar',
    'Total Soal',
    'Waktu (menit)',
    'Terakhir Mengerjakan',
  ]

  const rows = [...map.values()]
    .sort((a, b) => {
      const avgA = a.n ? a.sumPct / a.n : 0
      const avgB = b.n ? b.sumPct / b.n : 0
      return avgB - avgA || a.name.localeCompare(b.name, 'id')
    })
    .map((s, i) => [
      i + 1,
      s.name,
      s.className || '',
      s.n,
      s.n ? Math.round(s.sumPct / s.n) : '',
      Math.round(s.best),
      s.score,
      s.totalQ,
      Math.round(s.ms / 60000),
      formatDate(s.lastAt),
    ])

  return rowsToCsv(headers, rows)
}

/** Detail setiap attempt (untuk audit). */
export function buildDetailAttemptCsv(input: GradeExportInput): string {
  const { attempts, paketMap, filterSubject, filterClass } = input

  const filtered = attempts.filter((a) => {
    if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
    if (filterSubject) {
      const p = paketMap.get(a.latihanId)
      if (!p || p.subjectKey !== filterSubject) return false
    }
    return true
  })

  const headers = [
    'No',
    'Nama Siswa',
    'Kelas',
    'Judul Paket',
    'Mata Pelajaran',
    'Skor (%)',
    'Benar',
    'Total',
    'Waktu (menit)',
    'Selesai',
  ]

  const rows = filtered
    .slice()
    .sort((a, b) => {
      const na = (a.studentName || '').localeCompare(b.studentName || '', 'id')
      if (na !== 0) return na
      return (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0)
    })
    .map((a, i) => {
      const p = paketMap.get(a.latihanId)
      const sk = p?.subjectKey
      return [
        i + 1,
        a.studentName || '',
        a.studentClass || '',
        a.latihanTitle || p?.title || a.latihanId,
        sk ? getSubject(sk)?.name || sk : '',
        a.percent ?? '',
        a.score ?? '',
        a.total ?? '',
        a.durationMs != null ? Math.round(a.durationMs / 60000) : '',
        formatDate(toMillis(a.finishedAt)),
      ]
    })

  return rowsToCsv(headers, rows)
}

export function stampFilename(prefix: string) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.csv`
}
