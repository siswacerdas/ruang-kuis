/** Kunci mata pelajaran — string bebas; daftar master di Firestore `subjects`. */
export type SubjectKey = string

export interface Subject {
  key: SubjectKey
  name: string
  shortName: string
  color: string
  icon: string
}

/** Daftar default (seed + fallback jika Firestore belum terisi). */
export const SUBJECTS: Subject[] = [
  { key: 'bahasa-indonesia', name: 'Bahasa Indonesia', shortName: 'BIN', color: 'rose', icon: '📖' },
  { key: 'pendidikan-pancasila', name: 'Pendidikan Pancasila', shortName: 'PP', color: 'red', icon: '🇮🇩' },
  { key: 'ipas', name: 'Ilmu Pengetahuan Alam dan Sosial', shortName: 'IPAS', color: 'emerald', icon: '🌿' },
  { key: 'seni-musik', name: 'Seni Musik', shortName: 'Musik', color: 'purple', icon: '🎵' },
  { key: 'seni-rupa', name: 'Seni Rupa', shortName: 'Rupa', color: 'amber', icon: '🎨' },
  { key: 'matematika', name: 'Matematika', shortName: 'MTK', color: 'blue', icon: '🔢' },
  { key: 'al-islam', name: 'Al-Islam', shortName: 'AI', color: 'teal', icon: '☪' },
  { key: 'bahasa-inggris', name: 'Bahasa Inggris', shortName: 'ENG', color: 'indigo', icon: '🔤' },
  { key: 'kemuhammadiyahan', name: 'Kemuhammadiyahan', shortName: 'KM', color: 'green', icon: '🕌' },
  { key: 'bahasa-sunda', name: 'Bahasa Sunda', shortName: 'BS', color: 'orange', icon: '🗣️' },
  { key: 'bahasa-arab', name: 'Bahasa Arab', shortName: 'ARB', color: 'cyan', icon: '🕌' },
]

/** Diisi oleh lib/subjects agar mapel dinamis ikut ter-resolve. */
let subjectLookup: ((key: string) => Subject | undefined) | null = null

export function registerSubjectLookup(fn: (key: string) => Subject | undefined) {
  subjectLookup = fn
}

export function getSubject(key: string): Subject | undefined {
  return subjectLookup?.(key) || SUBJECTS.find((s) => s.key === key)
}

export interface Topic {
  id?: string
  subjectKey: SubjectKey
  name: string
  bookMaterialId?: string
  tpCodes?: string[]
  createdAt?: any
}

export type QuestionType = 'single' | 'multiple' | 'category'
export type TkaQuestionType = 'pg' | 'pgk' | 'pgk-cat'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Pilihan Ganda',
  multiple: 'Pilihan Ganda Kompleks',
  category: 'Pilihan Ganda Kategori',
}

export const DEFAULT_CATEGORY_LABELS = ['Benar', 'Salah'] as const
export type Kompleksitas = 'L1-Pemahaman' | 'L2-Aplikasi' | 'L3-Penalaran' | string
export const KOMPLEKSITAS_OPTIONS = ['L1-Pemahaman', 'L2-Aplikasi', 'L3-Penalaran'] as const

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
  stimulus?: string
  stimulusImage?: string
  tp?: string
  tpCodes?: string[]
  materialName?: string
  tipeMateri?: string
  kompleksitas?: Kompleksitas
  skor?: number
  importKey?: string
  createdAt?: any
}

export function isOptionCorrect(q: Question, optionIndex: number): boolean {
  return q.correctAnswers.includes(optionIndex)
}

export function mapTkaType(raw: string): QuestionType {
  const t = String(raw || '').toLowerCase().trim()
  if (t === 'pg' || t === 'single' || (t.includes('pilihan ganda') && !t.includes('kompleks') && !t.includes('kategori'))) {
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

export function resolveCorrectAnswers(
  type: QuestionType,
  raw: unknown,
  options: string[],
  categoryLabels: string[] = [...DEFAULT_CATEGORY_LABELS]
): number[] {
  if (raw == null) return type === 'category' ? options.map(() => 0) : []
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'number')) {
    return (raw as number[]).filter((n) => n >= 0 && (type === 'category' ? n < categoryLabels.length : n < options.length))
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const full = String(raw).trim()
    if (full) {
      if (type !== 'category') {
        const asNum = parseInt(full, 10)
        if (!isNaN(asNum) && String(asNum) === full && asNum >= 0 && asNum < options.length) {
          return [asNum]
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
  const parts: string[] = Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : String(raw).split(/[;|]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 1 && /[,]/.test(parts[0]) && type !== 'category') {
    const maybeIdx = parts[0].split(/[,]/).map((p) => p.trim()).filter(Boolean)
    if (maybeIdx.length > 1 && maybeIdx.every((p) => /^[A-Za-z]$|^\d+$/.test(p))) {
      parts.length = 0
      parts.push(...maybeIdx)
    }
  }
  if (type === 'category') {
    return options.map((_, i) => {
      const label = parts[i]
      if (label == null) return 0
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
    const idx = options.findIndex((o) => norm(o) === norm(p))
    if (idx >= 0) indices.push(idx)
  }
  return [...new Set(indices)].sort((a, b) => a - b)
}

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
  subjectKey?: SubjectKey
  questionIds: string[]
  questionCount: number
  startAt: any
  endAt: any
  token: string
  status: LatihanStatus
  timeLimitMinutes?: number
  shuffleQuestions?: boolean
  shuffleOptions?: boolean
  showScoreImmediately?: boolean
  assignedClasses?: string[]
  assignedStudentIds?: string[]
  allowRetry?: boolean
  requireToken?: boolean
  createdAt?: any
  updatedAt?: any
}

export function generateToken(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

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

export function isPaketForStudent(
  paket: Pick<LatihanPaket, 'assignedClasses' | 'assignedStudentIds'>,
  student: { studentId?: string; className?: string }
): boolean {
  const classes = (paket.assignedClasses || []).map((c) => c.trim()).filter(Boolean)
  const ids = (paket.assignedStudentIds || []).map((c) => c.trim()).filter(Boolean)
  if (classes.length === 0 && ids.length === 0) return true
  if (ids.length && student.studentId && ids.includes(student.studentId)) return true
  const cls = (student.className || '').trim().toLowerCase()
  if (classes.length && cls && classes.some((c) => c.toLowerCase() === cls)) return true
  return false
}

export function hoursUntilEnd(paket: Pick<LatihanPaket, 'endAt'>): number | null {
  const end = toMillis(paket.endAt as any)
  if (!end) return null
  return (end - Date.now()) / 3_600_000
}

export function canRetryPaket(paket: Pick<LatihanPaket, 'allowRetry'>): boolean {
  return paket.allowRetry === true
}

export function needsToken(paket: Pick<LatihanPaket, 'requireToken'>): boolean {
  return paket.requireToken === true
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

export interface QuestionAnswer {
  questionId: string
  selected: number[]
  isCorrect: boolean
  timeMs?: number
}

export interface LatihanAttempt {
  id?: string
  latihanId: string
  latihanTitle: string
  studentName: string
  studentId?: string | null
  studentClass?: string
  answers: QuestionAnswer[]
  score: number
  total: number
  percent: number
  tpSummary?: Record<string, { correct: number; total: number }>
  startedAt: any
  finishedAt: any
  durationMs?: number
}

export function gradeAnswer(
  question: { type: QuestionType; correctAnswers: number[] },
  selected: number[]
): boolean {
  const correct = [...question.correctAnswers].sort((a, b) => a - b)
  const sel = [...selected].sort((a, b) => a - b)
  if (correct.length !== sel.length) return false
  return correct.every((v, i) => v === sel[i])
}
