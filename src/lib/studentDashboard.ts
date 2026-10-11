/**
 * Logika daftar kuis di dashboard siswa (dipisah agar bisa diuji).
 *
 * - `buildAllMine`  : semua paket guru yang berlaku untuk siswa (termasuk yang sudah dikerjakan).
 * - `visiblePakets` : yang ditampilkan — paket yang sudah dikerjakan DAN tidak boleh diulang disembunyikan.
 *
 * "Sudah dikerjakan" diturunkan dari keberadaan dokumen `attempts`. Ketika guru mereset hasil
 * (dokumen attempts dihapus), `doneIds` tidak lagi memuat paket itu sehingga muncul kembali.
 */
import {
  canRetryPaket,
  isPaketForStudent,
  resolveLatihanStatus,
  type LatihanPaket,
  type LatihanStatus,
} from '../types/question'

export interface PaketRow {
  paket: LatihanPaket
  resolved: LatihanStatus
  done: boolean
  blocked: boolean
  start: number
}

function toMs(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? 0 : t
  }
  const any = v as { toDate?: () => Date; seconds?: number }
  if (any?.toDate) return any.toDate().getTime()
  if (any?.seconds) return any.seconds * 1000
  return 0
}

export function buildAllMine(
  pakets: LatihanPaket[],
  student: { studentId?: string; className?: string } | null,
  doneIds: Set<string>
): PaketRow[] {
  if (!student) return []
  return pakets
    .filter((p) => isPaketForStudent(p, student))
    .map((p) => {
      const resolved = resolveLatihanStatus(p)
      const done = p.id ? doneIds.has(p.id) : false
      const blocked = done && !canRetryPaket(p)
      return { paket: p, resolved, done, blocked, start: toMs(p.startAt) }
    })
    .filter((r) => r.resolved === 'active' || r.resolved === 'scheduled' || r.resolved === 'finished')
    .sort((a, b) => {
      const order = { active: 0, scheduled: 1, finished: 2 } as Record<string, number>
      const d = (order[a.resolved] ?? 9) - (order[b.resolved] ?? 9)
      if (d !== 0) return d
      return a.start - b.start
    })
}

export function visiblePakets(all: PaketRow[]): PaketRow[] {
  return all.filter((r) => !r.blocked)
}

/** Jumlah paket "Berakhir" yang ditampilkan di tampilan Semua (sisanya lewat tombol). */
export const FINISHED_CAP = 6

/**
 * Batasi paket berakhir yang belum diarsip guru agar daftar tidak memanjang seiring waktu.
 * Yang ditampilkan: FINISHED_CAP paket berakhir paling baru; urutan tampil tidak berubah.
 */
export function capFinished(
  rows: PaketRow[],
  cap = FINISHED_CAP
): { rows: PaketRow[]; hidden: number } {
  const fin = rows.filter((r) => r.resolved === 'finished')
  if (fin.length <= cap) return { rows, hidden: 0 }
  const keep = new Set(
    fin
      .slice()
      .sort((a, b) => b.start - a.start)
      .slice(0, cap)
      .map((r) => r.paket.id)
  )
  return {
    rows: rows.filter((r) => r.resolved !== 'finished' || keep.has(r.paket.id)),
    hidden: fin.length - cap,
  }
}
