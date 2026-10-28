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

/** Respons terstruktur dari AI (Gemini). */
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

/**
 * Predikat huruf dengan pita % sekolah + sub-range per huruf.
 *
 * Kategori:
 *   90–100 Sangat Baik | 80–89 Baik | 70–79 Cukup | 60–69 Kurang | <60 Sangat Kurang
 *
 * Sub-range:
 *   A+ 97–100 | A 93–96 | A- 90–92
 *   B+ 87–89  | B 83–86 | B- 80–82
 *   C+ 77–79  | C 73–76 | C- 70–72
 *   D  60–69  | E <60
 *
 * Observasi tetap 1–4 step 0,25. Simulasi mengisi KOMPONEN BERBEDA
 * agar rata tertimbang % jatuh di tengah sub-range (bukan satu level seragam).
 */
export const PREDICATE_OPTIONS = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D',
  'E',
] as const

export type LetterPredicate = (typeof PREDICATE_OPTIONS)[number]

/** Label kategori sekolah (keluarga huruf). */
export const PREDICATE_CATEGORY: Record<LetterPredicate, string> = {
  'A+': 'Sangat Baik',
  A: 'Sangat Baik',
  'A-': 'Sangat Baik',
  'B+': 'Baik',
  B: 'Baik',
  'B-': 'Baik',
  'C+': 'Cukup',
  C: 'Cukup',
  'C-': 'Cukup',
  D: 'Kurang',
  E: 'Sangat Kurang',
}

/**
 * Titik tengah sub-range % — dipakai simulasi agar total tertimbang tepat di pita.
 * B- 80–82 → 81 | B 83–86 → 84.5 | B+ 87–89 → 88 | dst.
 */
export const PREDICATE_PERCENT_CENTER: Record<LetterPredicate, number> = {
  'A+': 98.5,
  A: 94.5,
  'A-': 91,
  'B+': 88,
  B: 84.5,
  'B-': 81,
  'C+': 78,
  C: 74.5,
  'C-': 71,
  D: 64.5,
  E: 45,
}

/**
 * Level observasi acuan kasar (untuk prompt AI / fallback).
 * level ≈ (center% / 100) * 4, dibulatkan ke 0,25 terdekat.
 */
export const PREDICATE_TARGET_LEVEL: Record<LetterPredicate, number> = {
  'A+': 4,
  A: 3.75,
  'A-': 3.75,
  'B+': 3.5,
  B: 3.25,
  'B-': 3.25,
  'C+': 3,
  C: 3,
  'C-': 2.75,
  D: 2.5,
  E: 1.75,
}

/** Normalisasi input predikat (huruf, plus/minus, atau label kategori). */
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
    SANGATBAIK: 'A',
    ISTIMEWA: 'A+',
    EXCELLENT: 'A+',
    SANGATBAIKSEKALI: 'A+',
    BAIKSEKALI: 'A',
    BAIK: 'B',
    GOOD: 'B',
    CUKUP: 'C',
    PASS: 'C',
    KURANG: 'D',
    NEEDSIMPROVEMENT: 'D',
    SANGATKURANG: 'E',
    GAGAL: 'E',
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

export function predicateToTargetPercent(raw: string): number {
  const p = normalizePredicate(raw)
  if (!p) return 75
  return PREDICATE_PERCENT_CENTER[p]
}

/**
 * Simulasi lokal: sebar skor komponen (step 0,25) agar rata tertimbang ≈ tengah sub-range %.
 * Contoh B (83–86): target 84.5% → level rata-rata 3.38 → campuran 3.25 & 3.50.
 */
export function simulateScoresFromPredicateLocal(
  components: AssessmentComponent[],
  predicate: string
): Record<string, number> {
  const targetPct = predicateToTargetPercent(predicate)
  // level kontinu yang setara target %
  const targetLevel = (targetPct / 100) * SCORE_MAX

  if (!components.length) return {}

  // Urutkan: bobot besar lebih dulu (disesuaikan terakhir)
  const order = components
    .map((c, i) => ({ c, i, w: c.weight > 0 ? c.weight : 1 }))
    .sort((a, b) => b.w - a.w)

  // Inisialisasi semua ke floor 0,25 terdekat di bawah target
  const base = clampScore(Math.floor(targetLevel / SCORE_STEP) * SCORE_STEP)
  const levels: number[] = components.map(() => base)

  // Naikkan komponen (dari bobot besar) selangkah 0,25 sampai rata tertimbang >= target
  const weightedAvg = () => {
    let s = 0
    let w = 0
    components.forEach((c, i) => {
      const ww = c.weight > 0 ? c.weight : 1
      s += levels[i] * ww
      w += ww
    })
    return w > 0 ? s / w : 0
  }

  let guard = 0
  while (weightedAvg() < targetLevel - 1e-9 && guard < 200) {
    guard += 1
    let raised = false
    for (const { i } of order) {
      if (levels[i] + SCORE_STEP <= SCORE_MAX + 1e-9) {
        levels[i] = clampScore(levels[i] + SCORE_STEP)
        raised = true
        if (weightedAvg() >= targetLevel - 1e-9) break
      }
    }
    if (!raised) break
  }

  // Variasi ringan: geser ±0,25 pada komponen non-utama tanpa keluar jauh dari target
  // (jaga tetap di dalam sub-range setelah pembulatan %)
  const out: Record<string, number> = {}
  components.forEach((c, i) => {
    out[c.id] = clampScore(levels[i])
  })
  return out
}

/**
 * Predikat huruf dari total persen (0–100) menurut sub-range sekolah.
 *
 *   97–100 A+ | 93–96 A | 90–92 A-
 *   87–89  B+ | 83–86 B | 80–82 B-
 *   77–79  C+ | 73–76 C | 70–72 C-
 *   60–69  D  | <60 E
 */
export function percentToPredicate(pct: number | null): LetterPredicate | null {
  if (pct == null || !Number.isFinite(pct)) return null
  if (pct >= 97) return 'A+'
  if (pct >= 93) return 'A'
  if (pct >= 90) return 'A-'
  if (pct >= 87) return 'B+'
  if (pct >= 83) return 'B'
  if (pct >= 80) return 'B-'
  if (pct >= 77) return 'C+'
  if (pct >= 73) return 'C'
  if (pct >= 70) return 'C-'
  if (pct >= 60) return 'D'
  return 'E'
}






