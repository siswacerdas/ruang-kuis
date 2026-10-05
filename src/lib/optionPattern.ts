/**
 * Deteksi pola panjang pilihan jawaban ("jawaban terpanjang = jawaban benar").
 *
 * Murni lokal (tanpa API) sehingga bisa dihitung setiap kali guru mengetik.
 * Dipakai editor soal untuk memberi peringatan dan menyorot tombol
 * "Seimbangkan pilihan dengan AI".
 */

import type { QuestionType } from '../types/question'

export type OptionPatternReport = {
  message: string
}

/** Selisih rata-rata minimal (rasio) yang dianggap menjadi petunjuk bagi siswa. */
const RATIO = 1.25
/** Opsi pendek (angka, satu kata) diabaikan: panjangnya wajar berbeda-beda. */
const MIN_LONGEST_CHARS = 15
const MIN_DIFF_CHARS = 8

const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length

export function analyzeOptionLength(
  type: QuestionType,
  options: string[],
  correctAnswers: number[],
  categoryLabels: string[] = ['Benar', 'Salah']
): OptionPatternReport | null {
  const texts = options.map((o) => o.trim())
  if (texts.length < 2 || texts.some((t) => !t)) return null
  const len = texts.map((t) => t.length)
  if (Math.max(...len) < MIN_LONGEST_CHARS) return null

  if (type === 'category') {
    const labelOf = (i: number) => (correctAnswers[i] === 1 ? 1 : 0)
    const g0 = len.filter((_, i) => labelOf(i) === 0)
    const g1 = len.filter((_, i) => labelOf(i) === 1)
    if (!g0.length || !g1.length) return null
    const m0 = avg(g0)
    const m1 = avg(g1)
    if (Math.abs(m0 - m1) < MIN_DIFF_CHARS) return null
    const name0 = categoryLabels[0] || 'Benar'
    const name1 = categoryLabels[1] || 'Salah'
    if (m0 / m1 >= RATIO) {
      return {
        message: `Pernyataan berlabel "${name0}" rata-rata lebih panjang (${Math.round(m0)} vs ${Math.round(m1)} karakter). Siswa bisa menebak dari panjang kalimat.`,
      }
    }
    if (m1 / m0 >= RATIO) {
      return {
        message: `Pernyataan berlabel "${name1}" rata-rata lebih panjang (${Math.round(m1)} vs ${Math.round(m0)} karakter). Siswa bisa menebak dari panjang kalimat.`,
      }
    }
    return null
  }

  const correct = texts.map((_, i) => i).filter((i) => correctAnswers.includes(i))
  const wrong = texts.map((_, i) => i).filter((i) => !correctAnswers.includes(i))
  if (!correct.length || !wrong.length) return null

  const meanC = avg(correct.map((i) => len[i]))
  const meanW = avg(wrong.map((i) => len[i]))
  const maxLen = Math.max(...len)
  const longestIsCorrect =
    correct.some((i) => len[i] === maxLen) && wrong.every((i) => len[i] < maxLen)

  if (longestIsCorrect && meanC / meanW >= RATIO && meanC - meanW >= MIN_DIFF_CHARS) {
    return {
      message:
        type === 'single'
          ? `Jawaban benar adalah opsi terpanjang (${len[correct[0]]} karakter; pengecoh rata-rata ${Math.round(meanW)}). Siswa bisa menebak tanpa memahami materi.`
          : `Jawaban benar cenderung paling panjang (rata-rata ${Math.round(meanC)} karakter vs ${Math.round(meanW)} pada pengecoh). Siswa bisa menebak tanpa memahami materi.`,
    }
  }
  return null
}
