/**
 * Generate draft soal via OpenAI — arahan & API.
 *
 * File ini adalah "penghubung" petunjuk ke AI (system + user prompt).
 * Kunci: VITE_OPENAI_API_KEY di .env (jangan commit).
 *
 * Produksi: pindahkan pemanggilan ke Cloud Function agar key tidak di client.
 */

import type { QuestionType, SubjectKey } from '../types/question'
import { compressImageSrc } from './imageCompress'
import { sanitizeAiStimulusHtml } from './stimulusHtml'

/** Mode stimulus yang diminta guru */
export type StimulusMode = 'none' | 'text' | 'image'

/** Level kognitif (Taksonomi sederhana SD) */
export type KompleksitasLevel = 'L1-Pemahaman' | 'L2-Aplikasi' | 'L3-Penalaran' | 'campuran'

export type AiDraftQuestion = {
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  explanation?: string
  /** Teks bacaan / konteks / deskripsi gambar */
  stimulus?: string
  /** URL gambar (DALL·E) bila mode image berhasil */
  stimulusImage?: string
  /** Prompt gambar (untuk dokumentasi / generate ulang) */
  imagePrompt?: string
  tpCodes?: string[]
  kompleksitas?: string
}

export type GenerateAiOptions = {
  subjectName: string
  subjectKey: SubjectKey
  topicName: string
  tpCodes?: string[]
  count: number
  types: QuestionType[]
  /**
   * Satu mode (kompat lama) ATAU beberapa mode sekaligus.
   * Jika `stimulusModes` diisi, itu yang dipakai (boleh campur none/text/image).
   */
  stimulusMode?: StimulusMode
  /** Multi-pilih: campur tanpa stimulus, teks, dan/atau gambar dalam satu batch */
  stimulusModes?: StimulusMode[]
  /**
   * Kuota eksplisit per mode (opsional). Jika kosong, kuota dibagi merata ke mode terpilih.
   */
  stimulusCounts?: Partial<Record<StimulusMode, number>>
  kompleksitas?: KompleksitasLevel
  extraContext?: string
  model?: string
  /** Generate gambar (GPT Image) untuk soal mode image (default true) */
  generateImages?: boolean
}

/** Rencana kuota stimulus per batch */
export type StimulusPlan = Record<StimulusMode, number>

/** Normalisasi mode + kuota menjadi rencana pasti berjumlah `count`. */
export function resolveStimulusPlan(
  count: number,
  modes?: StimulusMode[],
  single?: StimulusMode,
  counts?: Partial<Record<StimulusMode, number>>
): StimulusPlan {
  const n = Math.max(1, count)
  let selected: StimulusMode[] = []
  if (modes && modes.length > 0) {
    selected = [...new Set(modes)]
  } else if (single) {
    selected = [single]
  } else {
    selected = ['none']
  }

  const plan: StimulusPlan = { none: 0, text: 0, image: 0 }

  if (counts) {
    let sum = 0
    for (const m of selected) {
      const v = Math.max(0, Math.floor(Number(counts[m]) || 0))
      plan[m] = v
      sum += v
    }
    if (sum === n) return plan
    if (sum > 0 && sum < n) {
      plan[selected[0]] += n - sum
      return plan
    }
    if (sum > n) {
      let excess = sum - n
      const order = [...selected].sort((a, b) => plan[b] - plan[a])
      for (const m of order) {
        if (excess <= 0) break
        const cut = Math.min(plan[m], excess)
        plan[m] -= cut
        excess -= cut
      }
      return plan
    }
  }

  const k = selected.length
  const base = Math.floor(n / k)
  const rem = n % k
  selected.forEach((m, i) => {
    plan[m] = base + (i < rem ? 1 : 0)
  })
  return plan
}
