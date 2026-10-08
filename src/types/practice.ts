import type { QuestionAnswer } from './question'

/** Sesi sementara — dihapus setelah selesai / dibatalkan */
export interface PracticeSession {
  id?: string
  studentId: string
  studentName: string
  studentClass?: string
  subjectKey: string
  topicIds: string[]
  topicNames?: string[]
  questionIds: string[]
  questionCount: number
  status: 'in_progress'
  /** Judul tampilan (opsional, diisi ortu / sistem) */
  title?: string
  /** true jika dibuat dari portal orang tua */
  createdByParent?: boolean
  parentId?: string | null
  parentName?: string
  kind?: 'parent_assigned' | 'self'
  /** Hanya siswa pemilik studentId yang boleh mengerjakan */
  visibility?: 'student_only'
  createdAt?: unknown
}

/** Hasil permanen — riwayat mandiri (bukan collection latihan admin) */
export interface PracticeAttempt {
  id?: string
  studentId: string
  studentName: string
  studentClass?: string
  subjectKey: string
  topicIds: string[]
  topicNames?: string[]
  title: string
  questionIds: string[]
  answers: QuestionAnswer[]
  score: number
  total: number
  percent: number
  tpSummary?: Record<string, { correct: number; total: number }>
  startedAt?: unknown
  finishedAt?: unknown
  durationMs?: number
  /** Label untuk email & UI */
  kind?: 'practice'
}

export const PRACTICE_COUNTS = [15, 20] as const
export type PracticeCount = (typeof PRACTICE_COUNTS)[number]
