/** Kunci mata pelajaran (tetap, sesuai kurikulum SD) */
export type SubjectKey =
  | 'bahasa-indonesia'
  | 'pendidikan-pancasila'
  | 'ipas'
  | 'seni-musik'
  | 'seni-rupa'
  | 'matematika'
  | 'al-islam'
  | 'bahasa-inggris'

export interface Subject {
  key: SubjectKey
  name: string
  shortName: string
  color: string
  icon: string
}

export const SUBJECTS: Subject[] = [
  { key: 'bahasa-indonesia', name: 'Bahasa Indonesia', shortName: 'BIN', color: 'rose', icon: '📖' },
  { key: 'pendidikan-pancasila', name: 'Pendidikan Pancasila', shortName: 'PP', color: 'red', icon: '🇮🇩' },
  { key: 'ipas', name: 'Ilmu Pengetahuan Alam dan Sosial', shortName: 'IPAS', color: 'emerald', icon: '🌿' },
  { key: 'seni-musik', name: 'Seni Musik', shortName: 'Musik', color: 'purple', icon: '🎵' },
  { key: 'seni-rupa', name: 'Seni Rupa', shortName: 'Rupa', color: 'amber', icon: '🎨' },
  { key: 'matematika', name: 'Matematika', shortName: 'MTK', color: 'blue', icon: '🔢' },
  { key: 'al-islam', name: 'Al-Islam', shortName: 'AI', color: 'teal', icon: '☪' },
  { key: 'bahasa-inggris', name: 'Bahasa Inggris', shortName: 'ENG', color: 'indigo', icon: '🔤' },
]

export function getSubject(key: string): Subject | undefined {
  return SUBJECTS.find((s) => s.key === key)
}

export interface Topic {
  id?: string
  subjectKey: SubjectKey
  name: string
  /** ID dokumen bookMaterials, jika ditautkan */
  bookMaterialId?: string
  /** Kode TP dari materi buku (denormalisasi, bisa diubah) */
  tpCodes?: string[]
  createdAt?: any
}

/** Tipe internal Ruang Kuis */
export type QuestionType = 'single' | 'multiple' | 'category'

/** Alias tipe tka2026 → internal */
export type TkaQuestionType = 'pg' | 'pgk' | 'pgk-cat'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Pilihan Ganda',
  multiple: 'Pilihan Ganda Kompleks',
  category: 'Pilihan Ganda Kategori',
}

export const DEFAULT_CATEGORY_LABELS = ['Benar', 'Salah'] as const

/** Level kompleksitas (opsional, selaras tka2026) */
export type Kompleksitas = 'L1-Pemahaman' | 'L2-Aplikasi' | 'L3-Penalaran' | string

export const KOMPLEKSITAS_OPTIONS = ['L1-Pemahaman', 'L2-Aplikasi', 'L3-Penalaran'] as const

export interface Question {
  id?: string
  topicId: string
  subjectKey: SubjectKey
  type: QuestionType
  question: string
  options: string[]
  /** Indeks opsi/pernyataan yang benar (format internal stabil) */
  correctAnswers: number[]
  categoryLabels?: string[]
  explanation?: string
  /** Konteks atau teks bacaan yang dibutuhkan untuk menjawab */
  stimulus?: string
  /** URL atau data-URL gambar stimulus (opsional, selaras tka2026 stimulusImage) */
  stimulusImage?: string
  /** Kode TP pertama, untuk kompatibilitas tampilan lama */
  tp?: string
  /** Satu soal boleh mengisi lebih dari satu TP */
  tpCodes?: string[]
  /** Nama materi saat impor, jika berbeda dari materi halaman */
  materialName?: string
  /** Domain/topik (alias tipeMateri tka2026) */
  tipeMateri?: string
  /** Level berpikir (L1/L2/L3) */
  kompleksitas?: Kompleksitas
  /** Bobot skor soal (default 1) */
  skor?: number
  /** Sidik jari soal agar impor ulang tidak menggandakan */
  importKey?: string
  createdAt?: any
}

export function isOptionCorrect(q: Question, optionIndex: number): boolean {
  return q.correctAnswers.includes(optionIndex)
}

/** Map tipe tka2026 / label bebas → QuestionType internal */
export function mapTkaType(raw: string): QuestionType {
  const t = String(raw || '').toLowerCase().trim()
  if (t === 'pg' || t === 'single' || t.includes('pilihan ganda') && !t.includes('kompleks') && !t.includes('kategori')) {
    return 'single'
  }
  if (t === 'pgk' || t === 'multiple' || t.includes('kompleks') || t.includes('multi')) {
    return 'multiple'
  }
  if (t === 'pgk-cat' || t === 'category' || t.includes('kategori') || t.includes('benar') || t.includes('salah')) {
    return 'category'
  }
  return 'single'
}

/**
 * Ubah kunci berbasis teks opsi (pola tka2026) menjadi indeks.
 * - single: string teks opsi → [index]
 * - multiple: array teks → indeks (urutan tidak penting)
 * - category: array "Benar"/"Salah" (atau label kolom) → indeks label per baris
 * Tetap menerima indeks angka / huruf A-D untuk kompatibilitas mundur.
 */
export function resolveCorrectAnswers(
  type: QuestionType,
  raw: unknown,
  options: string[],
  categoryLabels: string[] = [...DEFAULT_CATEGORY_LABELS]
): number[] {
  if (raw == null) return type === 'category' ? options.map(() => 0) : []

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

  // Sudah array angka
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'number')) {
    return (raw as number[]).filter((n) => n >= 0 && (type === 'category' ? n < categoryLabels.length : n < options.length))
  }

  // String tunggal: prioritaskan cocok penuh ke opsi (jangan dipecah koma dulu).
  // Contoh gagal lama: "Sabtu, 11 Oktober 2026 ..." terpecah di koma → tidak match.
  if (typeof raw === 'string' || typeof raw === 'number') {
    const full = String(raw).trim()
    if (full) {
      if (type === 'category') {
        // satu label untuk semua baris? jarang; biarkan lewat path array di bawah
      } else {
        const asNum = parseInt(full, 10)
        if (!isNaN(asNum) && String(asNum) === full && asNum >= 0 && asNum < options.length) {
          return type === 'single' ? [asNum] : [asNum]
        }
        if (full.length === 1) {
          const u = full.toUpperCase()
          if (u >= 'A' && u <= 'Z') {
            const i = u.charCodeAt(0) - 65
            if (i >= 0 && i < options.length) return [i]
          }
        }
        const exact = options.findIndex((o) => norm(o) === norm(full))
        if (exact >= 0) return [exact]
      }
    }
  }

  // Array atau string multi-kunci: pisah ; | atau koma (hanya jika bukan match penuh)
  const parts: string[] = Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : String(raw)
        .split(/[;|]/) // utamakan ; dan | — koma sering ada di teks opsi bahasa Indonesia
        .map((p) => p.trim())
        .filter(Boolean)

  // Fallback: jika masih 1 bagian dan mengandung koma, coba split koma hanya untuk huruf/indeks pendek
  if (parts.length === 1 && /[,]/.test(parts[0]) && type !== 'category') {
    const maybeIdx = parts[0].split(/[,]/).map((p) => p.trim()).filter(Boolean)
    if (maybeIdx.length > 1 && maybeIdx.every((p) => /^[A-Za-z]$|^\d+$/.test(p))) {
      parts.length = 0
      parts.push(...maybeIdx)
    }
  }

  if (type === 'category') {
    // Setiap elemen = label kolom untuk baris ke-i
    return options.map((_, i) => {
      const label = parts[i]
      if (label == null) return 0
      // angka?
      const asNum = parseInt(label, 10)
      if (!isNaN(asNum) && asNum >= 0 && asNum < categoryLabels.length) return asNum
      const idx = categoryLabels.findIndex((c) => norm(c) === norm(label))
      return idx >= 0 ? idx : 0
    })
  }

  const indices: number[] = []
  for (const p of parts) {
    const u = p.toUpperCase()
    if (u.length === 1 && u >= 'A' && u <= 'Z') {
      const i = u.charCodeAt(0) - 65
      if (i >= 0 && i < options.length) indices.push(i)
      continue
    }
    const asNum = parseInt(p, 10)
    if (!isNaN(asNum) && String(asNum) === p && asNum >= 0 && asNum < options.length) {
      indices.push(asNum)
      continue
    }
    // Cocokkan teks opsi (case-insensitive, spasi dinormalisasi)
    const idx = options.findIndex((o) => norm(o) === norm(p))
    if (idx >= 0) indices.push(idx)
  }

  // unique, sorted for multiple
  return [...new Set(indices)].sort((a, b) => a - b)
}

/* ========== LATIHAN SOAL (paket) ========== */

export type LatihanStatus = 'draft' | 'scheduled' | 'active' | 'finished' | 'archived'

export const LATIHAN_STATUS_LABELS: Record<LatihanStatus, string> = {
  draft: 'Draf',
  scheduled: 'Terjadwal',
  active: 'Aktif',
  finished: 'Selesai',
  archived: 'Arsip',
}

export interface LatihanPaket {
  id?: string
  title: string
  description?: string
  /** Mapel utama (opsional, untuk filter) */
  subjectKey?: SubjectKey
  /** ID soal yang masuk paket (urutan = urutan tampil) */
  questionIds: string[]
  /** Jumlah soal (denormalisasi) */
  questionCount: number
  /** Jadwal pelaksanaan */
  startAt: any // Timestamp atau string ISO
  endAt: any
  /** Token akses siswa (kode unik) */
  token: string
  status: LatihanStatus
  /** Batas waktu mengerjakan (menit), 0 = tanpa batas */
  timeLimitMinutes?: number
  shuffleQuestions?: boolean
  shuffleOptions?: boolean
  showScoreImmediately?: boolean
  createdAt?: any
  updatedAt?: any
}

/** Generate token 6 karakter mudah dibaca */
export function generateToken(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

/** Hitung status aktual berdasarkan waktu (client-side) */
export function resolveLatihanStatus(
  paket: Pick<LatihanPaket, 'status' | 'startAt' | 'endAt'>
): LatihanStatus {
  if (paket.status === 'draft' || paket.status === 'archived') return paket.status
  const now = Date.now()
  const start = toMillis(paket.startAt)
  const end = toMillis(paket.endAt)
  if (start && now < start) return 'scheduled'
  if (end && now > end) return 'finished'
  if (start && end && now >= start && now <= end) return 'active'
  return paket.status
}

function toMillis(v: any): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? null : t
  }
  if (v?.toDate) return v.toDate().getTime()
  if (v?.seconds) return v.seconds * 1000
  return null
}

export function formatDateTime(v: any): string {
  const ms = toMillis(v)
  if (!ms) return '—'
  return new Date(ms).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ========== HASIL / RIWAYAT PENGERJAAN ========== */

export interface QuestionAnswer {
  questionId: string
  /** Jawaban siswa — format sama dengan correctAnswers */
  selected: number[]
  isCorrect: boolean
  /** ms mengerjakan soal ini (opsional) */
  timeMs?: number
}

export interface LatihanAttempt {
  id?: string
  latihanId: string
  latihanTitle: string
  /** Nama siswa (tanpa akun) */
  studentName: string
  /** Kelas / identitas tambahan opsional */
  studentClass?: string
  answers: QuestionAnswer[]
  /** Jumlah benar */
  score: number
  /** Total soal */
  total: number
  /** Skor 0–100 */
  percent: number
  /** Ringkasan capaian per TP: { "3.1": { correct: 2, total: 3 }, ... } */
  tpSummary?: Record<string, { correct: number; total: number }>
  startedAt: any
  finishedAt: any
  durationMs?: number
}

/** Nilai benar/salah satu soal (indeks, kompatibel data lama) */
export function gradeAnswer(
  question: { type: QuestionType; correctAnswers: number[] },
  selected: number[]
): boolean {
  const correct = [...question.correctAnswers].sort((a, b) => a - b)
  const sel = [...selected].sort((a, b) => a - b)
  if (correct.length !== sel.length) return false
  return correct.every((v, i) => v === sel[i])
}
