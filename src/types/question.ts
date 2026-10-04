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
  createdAt?: any
}

export type QuestionType = 'single' | 'multiple' | 'category'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Pilihan Ganda',
  multiple: 'Pilihan Ganda Kompleks',
  category: 'Pilihan Ganda Kategori',
}

export const DEFAULT_CATEGORY_LABELS = ['Benar', 'Salah'] as const

export interface Question {
  id?: string
  topicId: string
  subjectKey: SubjectKey
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  explanation?: string
  /**
   * Tujuan Pembelajaran (TP) — kode atau teks, e.g. "3.1" atau
   * "Menganalisis komponen ekosistem". Dipakai untuk memaknai capaian.
   */
  tp?: string
  createdAt?: any
}

export function isOptionCorrect(q: Question, optionIndex: number): boolean {
  return q.correctAnswers.includes(optionIndex)
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

/** Nilai benar/salah satu soal */
export function gradeAnswer(
  question: { type: QuestionType; correctAnswers: number[] },
  selected: number[]
): boolean {
  const correct = [...question.correctAnswers].sort((a, b) => a - b)
  const sel = [...selected].sort((a, b) => a - b)
  if (correct.length !== sel.length) return false
  return correct.every((v, i) => v === sel[i])
}
