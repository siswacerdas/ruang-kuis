/**
 * Generate draft soal via OpenAI Chat Completions.
 * Kunci: VITE_OPENAI_API_KEY di .env (jangan commit ke git).
 *
 * Catatan keamanan: memanggil OpenAI dari browser mengekspos kunci ke client.
 * Untuk produksi, pindahkan ke Cloud Function. Mode ini cukup untuk setup awal.
 */

import type { QuestionType, SubjectKey } from '../types/question'

export type AiDraftQuestion = {
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  explanation?: string
  stimulus?: string
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
  /** Konteks tambahan dari guru (opsional) */
  extraContext?: string
  model?: string
}

const SYSTEM = `Kamu adalah penulis soal asesmen untuk siswa SD kelas 5 di Indonesia.
Hasilkan soal dalam bahasa Indonesia yang jelas, sesuai usia, dan akurat.
Balas HANYA JSON valid tanpa markdown, bentuk:
{"questions":[{...}]}

Setiap soal:
- type: "single" | "multiple" | "category"
- question: string (teks soal)
- options: string[] (4 opsi untuk single/multiple; pernyataan untuk category)
- correctAnswers: number[] (indeks 0-based). single: satu indeks. multiple: satu atau lebih. category: indeks opsi yang "Benar" ATAU gunakan categoryLabels.
- categoryLabels: opsional, default ["Benar","Salah"] hanya untuk type category — jika category, correctAnswers adalah indeks label per baris opsi (0=Benar, 1=Salah) dengan panjang = options.length
- explanation: string singkat
- stimulus: opsional teks bacaan singkat
- tpCodes: array string kode TP bila diketahui
- kompleksitas: "L1-Pemahaman" | "L2-Aplikasi" | "L3-Penalaran"

Aturan:
- single: tepat 1 jawaban benar
- multiple: minimal 2 opsi benar
- category: setiap pernyataan dilabeli Benar/Salah via correctAnswers sejajar options
- Jangan gunakan opsi "semua benar" / "tidak ada yang benar"
- Hindari soal ambigu`

function buildUserPrompt(opts: GenerateAiOptions): string {
  const types = opts.types.length ? opts.types.join(', ') : 'single'
  const tps = opts.tpCodes?.length ? opts.tpCodes.join(', ') : '(sesuaikan dengan materi)'
  return [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Materi: ${opts.topicName}`,
    `Kode TP relevan: ${tps}`,
    `Jumlah soal: ${opts.count}`,
    `Tipe yang diizinkan: ${types}`,
    opts.extraContext?.trim() ? `Konteks guru: ${opts.extraContext.trim()}` : '',
    'Buat soal yang saling berbeda, tidak mengulang ide yang sama.',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeDraft(raw: any): AiDraftQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (['single', 'multiple', 'category'] as const).includes(raw.type)
    ? (raw.type as QuestionType)
    : 'single'
  const question = String(raw.question || '').trim()
  let options = Array.isArray(raw.options)
    ? raw.options.map((o: unknown) => String(o ?? '').trim()).filter(Boolean)
    : []
  if (!question || options.length < 2) return null

  let correctAnswers: number[] = []
  if (Array.isArray(raw.correctAnswers)) {
    correctAnswers = raw.correctAnswers
      .map((n: unknown) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length)
  }

  if (type === 'single') {
    if (correctAnswers.length === 0) correctAnswers = [0]
    correctAnswers = [correctAnswers[0]]
  } else if (type === 'multiple') {
    if (correctAnswers.length === 0) correctAnswers = [0]
    correctAnswers = [...new Set(correctAnswers)]
  } else {
    // category: correctAnswers length should match options (0/1 labels)
    const labels = Array.isArray(raw.categoryLabels) && raw.categoryLabels.length >= 2
      ? raw.categoryLabels.map((x: unknown) => String(x))
      : ['Benar', 'Salah']
    if (correctAnswers.length !== options.length) {
      correctAnswers = options.map(() => 0)
    } else {
      correctAnswers = correctAnswers.map((n) => (n === 1 ? 1 : 0))
    }
    return {
      type,
      question,
      options,
      correctAnswers,
      categoryLabels: labels.slice(0, 2),
      explanation: raw.explanation ? String(raw.explanation) : undefined,
      stimulus: raw.stimulus ? String(raw.stimulus) : undefined,
      tpCodes: Array.isArray(raw.tpCodes)
        ? raw.tpCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
        : undefined,
      kompleksitas: raw.kompleksitas ? String(raw.kompleksitas) : undefined,
    }
  }

  return {
    type,
    question,
    options,
    correctAnswers,
    explanation: raw.explanation ? String(raw.explanation) : undefined,
    stimulus: raw.stimulus ? String(raw.stimulus) : undefined,
    tpCodes: Array.isArray(raw.tpCodes)
      ? raw.tpCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
      : undefined,
    kompleksitas: raw.kompleksitas ? String(raw.kompleksitas) : undefined,
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim())
}

export async function generateQuestionsWithOpenAI(
  opts: GenerateAiOptions
): Promise<AiDraftQuestion[]> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }

  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  const count = Math.max(1, Math.min(opts.count || 5, 15))

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt({ ...opts, count }) },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('API key OpenAI tidak valid (401).')
    if (res.status === 429) throw new Error('Batas kuota/rate OpenAI (429). Coba lagi nanti.')
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Respons OpenAI kosong.')
  }

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Respons OpenAI bukan JSON valid.')
  }

  const arr = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
      ? parsed
      : []

  const drafts = arr.map(normalizeDraft).filter(Boolean) as AiDraftQuestion[]
  if (drafts.length === 0) {
    throw new Error('Tidak ada soal valid dari AI. Coba ubah prompt/jumlah.')
  }
  return drafts
}
