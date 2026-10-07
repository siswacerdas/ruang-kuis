import type { SubjectKey } from './question'

/** Level rubrik 1–4 (skala observasi aktivitas). */
export type RubricLevel = 1 | 2 | 3 | 4

export const RUBRIC_LEVEL_LABELS: Record<RubricLevel, string> = {
  1: 'Belum tampak',
  2: 'Berkembang',
  3: 'Mahir',
  4: 'Sangat mahir',
}

export interface RubricBand {
  level: RubricLevel
  label: string
  descriptor: string
}

/** Satu komponen penilaian (kolom di tabel nilai). */
export interface AssessmentComponent {
  id: string
  label: string
  /** Kompetensi terukur yang diamati dalam aktivitas. */
  description: string
  tpCodes: string[]
  weight: number
  rubric: RubricBand[]
}

export type AssessmentStatus = 'draft' | 'active' | 'archived'

/**
 * Aktivitas penilaian berbasis proyek/observasi.
 * Koleksi Firestore: assessmentActivities
 */
export interface AssessmentActivity {
  id?: string
  title: string
  /** Deskripsi aktivitas dari guru (input AI). */
  description: string
  /** Hanya mapel yang dipilih guru — AI tidak boleh menambah di luar ini. */
  subjectKeys: SubjectKey[]
  linkedTpCodes: string[]
  components: AssessmentComponent[]
  className?: string
  status: AssessmentStatus
  /** Catatan singkat hasil AI (opsional). */
  aiNotes?: string
  createdAt?: any
  updatedAt?: any
}

/**
 * Nilai per siswa untuk satu aktivitas.
 * Koleksi Firestore: assessmentScores
 * Doc id disarankan: `${activityId}__${studentId}`
 */
export interface AssessmentScore {
  id?: string
  activityId: string
  studentId: string
  studentName: string
  studentClass?: string
  /**
   * Skor 1–4 per componentId, boleh kelipatan 0.25 (mis. 3.25 / 3.5 / 3.75).
   * Kosong = belum diisi.
   */
  scores: Record<string, number>
  notes?: string
  updatedAt?: any
}

/** Respons terstruktur dari OpenAI. */
export interface AiAssessmentDraft {
  title: string
  linkedTpCodes: string[]
  components: AssessmentComponent[]
  aiNotes?: string
}

/** Batas skor observasi: 1 … 4, langkah 0.25. */
export const SCORE_MIN = 1
export const SCORE_MAX = 4
export const SCORE_STEP = 0.25

/** Semua nilai yang bisa dipilih di dropdown (1, 1.25, …, 4). */
export const SCORE_OPTIONS: number[] = (() => {
  const opts: number[] = []
  for (let v = SCORE_MIN; v <= SCORE_MAX + 1e-9; v += SCORE_STEP) {
    opts.push(Math.round(v * 100) / 100)
  }
  return opts
})()

/** Clamp & bulatkan ke kelipatan 0.25 dalam rentang 1–4. */
export function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) return SCORE_MIN
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, raw))
  const stepped = Math.round(clamped / SCORE_STEP) * SCORE_STEP
  return Math.round(stepped * 100) / 100
}

/** Tampilkan skor (3 → "3", 3.5 → "3.5", 3.25 → "3.25"). */
export function formatScore(v: number): string {
  if (!Number.isFinite(v)) return ''
  const n = Math.round(v * 100) / 100
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')
}

/**
 * Hitung total 0–100 dari skor 1–4 (boleh pecahan 0.25) + bobot.
 * 1 → 25%, 2 → 50%, 3 → 75%, 4 → 100%; nilai antara diinterpolasi linier.
 */
export function computeWeightedPercent(
  components: AssessmentComponent[],
  scores: Record<string, number>
): number | null {
  let wSum = 0
  let scoreSum = 0
  let n = 0
  for (const c of components) {
    const raw = scores[c.id]
    if (raw == null || !Number.isFinite(raw)) continue
    const level = clampScore(raw)
    const w = c.weight > 0 ? c.weight : 1
    const pct = (level / SCORE_MAX) * 100
    scoreSum += pct * w
    wSum += w
    n += 1
  }
  if (n === 0 || wSum === 0) return null
  return Math.round(scoreSum / wSum)
}

export function emptyRubric(): RubricBand[] {
  return ([1, 2, 3, 4] as RubricLevel[]).map((level) => ({
    level,
    label: RUBRIC_LEVEL_LABELS[level],
    descriptor: '',
  }))
}

/** Predikat huruf yang dipetakan ke skala observasi 1–4. */
export const PREDICATE_OPTIONS = [
  'E',
  'D',
  'C-',
  'C',
  'C+',
  'B-',
  'B',
  'B+',
  'A-',
  'A',
  'A+',
] as const

export type LetterPredicate = (typeof PREDICATE_OPTIONS)[number]

/** Target level 1–4 (kelipatan 0.25) untuk tiap predikat. */
export const PREDICATE_TARGET_LEVEL: Record<LetterPredicate, number> = {
  E: 1,
  D: 1.5,
  'C-': 2,
  C: 2.25,
  'C+': 2.5,
  'B-': 2.75,
  B: 3,
  'B+': 3.25,
  'A-': 3.5,
  A: 3.75,
  'A+': 4,
}

/** Normalisasi input predikat (boleh "a+", "C −", "sangat baik", dll.). */
export function normalizePredicate(raw: string): LetterPredicate | null {
  const t = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
    .replace(/—/g, '-')
  if (!t) return null
  for (const p of PREDICATE_OPTIONS) {
    if (p === t) return p
  }
  const aliases: Record<string, LetterPredicate> = {
    SANGATBAIK: 'A+',
    EXCELLENT: 'A+',
    BAIKSEKALI: 'A',
    BAIK: 'B',
    CUKUP: 'C',
    KURANG: 'D',
    SANGATKURANG: 'E',
    NEEDSIMPROVEMENT: 'D',
    PASS: 'C',
    FAIL: 'E',
  }
  if (aliases[t]) return aliases[t]
  return null
}

export function predicateToTargetLevel(raw: string): number {
  const p = normalizePredicate(raw)
  if (!p) return 3
  return PREDICATE_TARGET_LEVEL[p]
}

/**
 * Simulasi lokal (tanpa AI): sebar skor komponen di sekitar target predikat,
 * sedikit divariasikan menurut bobot agar tidak identik semua kolom.
 */
export function simulateScoresFromPredicateLocal(
  components: AssessmentComponent[],
  predicate: string
): Record<string, number> {
  const target = predicateToTargetLevel(predicate)
  const out: Record<string, number> = {}
  const n = components.length || 1
  components.forEach((c, i) => {
    const bias = ((i % 3) - 1) * 0.25
    const weightBias = c.weight >= 1.5 ? 0.25 : c.weight < 1 ? -0.25 : 0
    const centerPull = i === Math.floor(n / 2) ? 0 : bias * 0.5
    out[c.id] = clampScore(target + centerPull + weightBias * 0.5)
  })
  return out
}

/** Predikat huruf dari total persen (0–100). */
export function percentToPredicate(pct: number | null): LetterPredicate | null {
  if (pct == null || !Number.isFinite(pct)) return null
  if (pct >= 97) return 'A+'
  if (pct >= 90) return 'A'
  if (pct >= 85) return 'A-'
  if (pct >= 80) return 'B+'
  if (pct >= 75) return 'B'
  if (pct >= 70) return 'B-'
  if (pct >= 65) return 'C+'
  if (pct >= 60) return 'C'
  if (pct >= 55) return 'C-'
  if (pct >= 45) return 'D'
  return 'E'
}
