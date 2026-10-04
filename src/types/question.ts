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
  color: string // tailwind-ish accent for UI
  icon: string // emoji fallback
}

/** Daftar mata pelajaran tetap — guru tidak perlu ubah kode */
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

/** Materi di bawah mata pelajaran (guru buat sendiri) */
export interface Topic {
  id?: string
  subjectKey: SubjectKey
  name: string
  createdAt?: any
}

/**
 * Tipe soal:
 * - single   : pilihan ganda (1 jawaban benar)
 * - multiple : pilihan ganda kompleks (lebih dari 1 jawaban benar)
 * - category : pilihan ganda kategori (benar-salah, sesuai-tidak sesuai, dll.)
 */
export type QuestionType = 'single' | 'multiple' | 'category'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Pilihan Ganda',
  multiple: 'Pilihan Ganda Kompleks',
  category: 'Pilihan Ganda Kategori',
}

/** Label default untuk tipe kategori */
export const DEFAULT_CATEGORY_LABELS = ['Benar', 'Salah'] as const

export interface Question {
  id?: string
  /** Materi induk */
  topicId: string
  /** Denormalisasi agar mudah query pool per mapel (ATS / AS) */
  subjectKey: SubjectKey
  type: QuestionType
  /** Teks pertanyaan / stem */
  question: string
  /**
   * Untuk single & multiple: daftar opsi jawaban.
   * Untuk category: daftar pernyataan (statement).
   */
  options: string[]
  /**
   * Index jawaban benar.
   * - single: satu elemen, e.g. [1]
   * - multiple: satu atau lebih, e.g. [0, 2]
   * - category: untuk setiap statement, index label kategori (0 atau 1), e.g. [0, 1, 0]
   */
  correctAnswers: number[]
  /**
   * Hanya untuk type === 'category'.
   * Contoh: ['Benar', 'Salah'] atau ['Sesuai', 'Tidak Sesuai']
   */
  categoryLabels?: string[]
  explanation?: string
  createdAt?: any
}

/** Helper: apakah jawaban benar untuk opsi index tertentu (single/multiple) */
export function isOptionCorrect(q: Question, optionIndex: number): boolean {
  return q.correctAnswers.includes(optionIndex)
}
