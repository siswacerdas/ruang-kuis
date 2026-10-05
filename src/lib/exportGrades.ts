import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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
  filterSubject?: string
  filterClass?: string
}

export interface TableData {
  title: string
  subtitle: string
  headers: string[]
  rows: (string | number)[][]
  /** landscape jika banyak kolom */
  landscape?: boolean
}

function filterAttempts(input: GradeExportInput): LatihanAttempt[] {
  const { attempts, paketMap, filterSubject, filterClass } = input
  return attempts.filter((a) => {
    if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
    if (filterSubject) {
      const p = paketMap.get(a.latihanId)
      if (!p || p.subjectKey !== filterSubject) return false
    }
    return true
  })
}

function filterLabel(input: GradeExportInput): string {
  const parts: string[] = []
  if (input.filterSubject) {
    parts.push(getSubject(input.filterSubject as SubjectKey)?.name || input.filterSubject)
  } else {
    parts.push('Semua mapel')
  }
  if (input.filterClass) parts.push(`Kelas ${input.filterClass}`)
  else parts.push('Semua kelas')
  return parts.join(' · ')
}

export function buildNilaiPerMapelTable(input: GradeExportInput): TableData {
  const { paketMap, filterSubject } = input
  const filtered = filterAttempts(input)

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
        return v && v.n ? Math.round(v.sum / v.n) : '—'
      })
      const avg = s.totalN ? Math.round(s.totalSum / s.totalN) : '—'
      return [i + 1, s.name, s.className || '—', ...subScores, avg, s.totalN]
    })

  return {
    title: 'Nilai Akhir per Mata Pelajaran',
    subtitle: filterLabel(input),
    headers,
    rows,
    landscape: subjectKeys.length > 4,
  }
}

export function buildRekapSiswaTable(input: GradeExportInput): TableData {
  const filtered = filterAttempts(input)

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
    'Terbaik (%)',
    'Benar',
    'Total Soal',
    'Waktu (mnt)',
    'Terakhir',
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
      s.className || '—',
      s.n,
      s.n ? Math.round(s.sumPct / s.n) : '—',
      Math.round(s.best),
      s.score,
      s.totalQ,
      Math.round(s.ms / 60000),
      formatDate(s.lastAt) || '—',
    ])

  return {
    title: 'Rekap Nilai Siswa',
    subtitle: filterLabel(input),
    headers,
    rows,
    landscape: true,
  }
}

export function buildDetailAttemptTable(input: GradeExportInput): TableData {
  const { paketMap } = input
  const filtered = filterAttempts(input)

  const headers = [
    'No',
    'Nama Siswa',
    'Kelas',
    'Judul Paket',
    'Mapel',
    'Skor (%)',
    'Benar',
    'Total',
    'Waktu (mnt)',
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
        a.studentName || '—',
        a.studentClass || '—',
        a.latihanTitle || p?.title || a.latihanId,
        sk ? getSubject(sk)?.shortName || sk : '—',
        a.percent ?? '—',
        a.score ?? '—',
        a.total ?? '—',
        a.durationMs != null ? Math.round(a.durationMs / 60000) : '—',
        formatDate(toMillis(a.finishedAt)) || '—',
      ]
    })

  return {
    title: 'Detail Pengerjaan Kuis',
    subtitle: filterLabel(input),
    headers,
    rows,
    landscape: true,
  }
}

/** CSV wrappers (kompatibel API lama) */
export function buildNilaiPerMapelCsv(input: GradeExportInput): string {
  const t = buildNilaiPerMapelTable(input)
  return rowsToCsv(t.headers, t.rows)
}

export function buildRekapSiswaCsv(input: GradeExportInput): string {
  const t = buildRekapSiswaTable(input)
  return rowsToCsv(t.headers, t.rows)
}

export function buildDetailAttemptCsv(input: GradeExportInput): string {
  const t = buildDetailAttemptTable(input)
  return rowsToCsv(t.headers, t.rows)
}

export function stampFilename(prefix: string, ext: 'csv' | 'pdf' = 'csv') {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`
}

/** Generate & unduh PDF tabel. */
export function downloadPdfTable(filename: string, data: TableData) {
  const doc = new jsPDF({
    orientation: data.landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12

  doc.setFontSize(14)
  doc.setTextColor(30, 30, 40)
  doc.text(data.title, margin, 16)

  doc.setFontSize(9)
  doc.setTextColor(100, 100, 110)
  doc.text(data.subtitle, margin, 22)

  const generated = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Dicetak: ${generated} · Ruang Kuis`, pageW - margin, 22, { align: 'right' })

  autoTable(doc, {
    startY: 28,
    head: [data.headers],
    body: data.rows.map((r) => r.map((c) => (c == null ? '' : String(c)))),
    styles: {
      fontSize: data.landscape ? 8 : 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (hook: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(
        `Halaman ${hook.pageNumber} / ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      )
    },
  })

  doc.save(filename)
}
