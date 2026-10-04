/**
 * Generate draft soal via OpenAI — arahan & API.
 *
 * File ini adalah "penghubung" petunjuk ke AI (system + user prompt).
 * Kunci: VITE_OPENAI_API_KEY di .env (jangan commit).
 *
 * Produksi: pindahkan pemanggilan ke Cloud Function agar key tidak di client.
 */

import type { QuestionType, SubjectKey } from '../types/question'

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
  stimulusMode?: StimulusMode
  kompleksitas?: KompleksitasLevel
  extraContext?: string
  model?: string
  /** Generate gambar DALL·E bila stimulusMode === 'image' (default true) */
  generateImages?: boolean
}

/* ============================================================================
 * ARAHAN UTAMA KE AI (system prompt)
 * Sesuaikan di sini jika ingin mengubah gaya penulisan soal nasional/sekolah.
 * ============================================================================ */
export const AI_QUESTION_GUIDANCE = {
  role: `Kamu adalah penulis soal asesmen formatif untuk siswa SD kelas 5 di Indonesia
(Kurikulum Merdeka). Bahasa Indonesia baku, jelas, ramah anak, akurat secara konten.`,

  outputFormat: `Balas HANYA JSON valid (tanpa markdown), bentuk:
{"questions":[ ... ]}

Setiap elemen questions:
- type: "single" | "multiple" | "category"
- question: string — pertanyaan yang merujuk ke stimulus bila ada (jangan mengulang seluruh stimulus)
- options: string[] — 4 opsi untuk single/multiple; 3–5 pernyataan untuk category
- correctAnswers: number[] indeks 0-based
  · single: tepat 1 indeks
  · multiple (PG kompleks): TEPAT 2 indeks benar dari 4 opsi (2 benar + 2 salah). JANGAN semua opsi benar.
  · category: array panjang = options.length, tiap nilai 0 atau 1 (0=Benar, 1=Salah) sesuai categoryLabels
- categoryLabels: ["Benar","Salah"] hanya untuk type category
- explanation: string singkat mengapa jawaban benar
- stimulus: string | null — teks konteks/bacaan/tabel sederhana/deskripsi situasi
- imagePrompt: string | null — prompt bahasa Inggris singkat untuk ilustrasi (hanya jika diminta gambar)
- tpCodes: string[] bila diketahui
- kompleksitas: "L1-Pemahaman" | "L2-Aplikasi" | "L3-Penalaran"`,

  rules: `Aturan wajib:
1. Jangan opsi "semua benar" / "tidak ada yang benar" / "semua salah".
2. Soal tidak ambigu; satu interpretasi jelas.
3. Opsi pengecoh masuk akal (bukan konyol).
3b. Pilihan ganda kompleks (type "multiple"): WAJIB tepat 4 opsi dan TEPAT 2 jawaban benar (correctAnswers berisi tepat 2 indeks berbeda). Dua opsi lainnya harus salah. Dilarang menandai 3 atau 4 opsi sebagai benar.
4. Jika ada stimulus: pertanyaan HARUS bergantung pada stimulus (tidak bisa dijawab tanpa membacanya).
5. Stimulus teks: 2–6 kalimat atau data singkat (tabel ASCII sederhana boleh).
6. Stimulus gambar: isi imagePrompt (English, simple illustration, no text in image if possible) DAN stimulus berisi keterangan singkat berbahasa Indonesia untuk siswa (apa yang digambarkan).
7. Sesuaikan kompleksitas:
   - L1-Pemahaman: mengingat/mengidentifikasi fakta dari stimulus atau konsep dasar
   - L2-Aplikasi: memakai konsep pada situasi baru
   - L3-Penalaran: menganalisis, membandingkan, menyimpulkan dari data/stimulus
8. Usia SD kelas 5: hindari istilah kuliah; angka dan konteks sehari-hari.`,
} as const

function buildSystemPrompt(): string {
  const g = AI_QUESTION_GUIDANCE
  return [g.role, g.outputFormat, g.rules].join('\n\n')
}

function buildUserPrompt(opts: GenerateAiOptions): string {
  const types = opts.types.length ? opts.types.join(', ') : 'single'
  const tps = opts.tpCodes?.length ? opts.tpCodes.join(', ') : '(sesuaikan dengan materi)'
  const stim = opts.stimulusMode || 'none'
  const komp = opts.kompleksitas || 'campuran'

  const stimulusInstr =
    stim === 'none'
      ? 'Stimulus: TIDAK PERLU. Biarkan stimulus dan imagePrompt null. Soal mandiri tanpa teks/gambar konteks.'
      : stim === 'text'
        ? `Stimulus: WAJIB teks kontekstual untuk SETIAP soal.
- Isi field "stimulus" dengan bacaan/data/situasi.
- imagePrompt = null.
- Pertanyaan dan opsi harus merujuk pada stimulus tersebut.`
        : `Stimulus: WAJIB berbasis gambar untuk SETIAP soal.
- Isi "imagePrompt" (English, clear scene for illustration, age-appropriate, no scary content).
- Isi "stimulus" dengan keterangan singkat Indonesia yang mendampingi gambar (1–3 kalimat).
- Pertanyaan harus mengandalkan informasi visual yang digambarkan (mis. menghitung objek, membaca situasi di gambar).`

  const kompInstr =
    komp === 'campuran'
      ? 'Kompleksitas: campur L1, L2, dan L3 secara seimbang; tandai field kompleksitas per soal.'
      : `Kompleksitas: SEMUA soal harus level ${komp}. Field kompleksitas = "${komp}".`

  return [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Materi / topik: ${opts.topicName}`,
    `Kode TP relevan: ${tps}`,
    `Jumlah soal: ${opts.count}`,
    `Tipe diizinkan: ${types}`,
    stimulusInstr,
    kompInstr,
    opts.extraContext?.trim() ? `Instruksi tambahan guru: ${opts.extraContext.trim()}` : '',
    types.includes('multiple')
      ? 'Untuk type multiple: setiap soal punya 4 opsi, tepat 2 benar dan 2 salah. Jangan correctAnswers berisi 3 atau 4 indeks.'
      : '',
    'Buat soal saling berbeda; jangan mengulang ide yang sama.',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeDraft(raw: any, fallbackKomp?: string): AiDraftQuestion | null {
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
      .filter((n: number) => Number.isInteger(n) && n >= 0)
  }

  const stimulus = raw.stimulus ? String(raw.stimulus).trim() : undefined
  const imagePrompt = raw.imagePrompt ? String(raw.imagePrompt).trim() : undefined
  const kompleksitas = raw.kompleksitas
    ? String(raw.kompleksitas)
    : fallbackKomp && fallbackKomp !== 'campuran'
      ? fallbackKomp
      : undefined

  if (type === 'single') {
    correctAnswers = correctAnswers.filter((n) => n < options.length)
    if (correctAnswers.length === 0) correctAnswers = [0]
    correctAnswers = [correctAnswers[0]]
  } else if (type === 'multiple') {
    // PG kompleks: tepat 4 opsi, tepat 2 kunci benar
    while (options.length < 4) options.push(`Opsi ${String.fromCharCode(65 + options.length)}`)
    if (options.length > 4) options = options.slice(0, 4)
    correctAnswers = [...new Set(correctAnswers.filter((n) => n >= 0 && n < options.length))]
    // Jika AI menandai semua/ terlalu banyak benar → potong jadi 2 pertama yang valid
    if (correctAnswers.length > 2) {
      correctAnswers = correctAnswers.slice(0, 2)
    }
    if (correctAnswers.length === 0) {
      correctAnswers = [0, 1]
    } else if (correctAnswers.length === 1) {
      // Lengkapi satu kunci lagi yang belum dipilih
      const extra = [0, 1, 2, 3].find((i) => !correctAnswers.includes(i))
      if (extra != null) correctAnswers = [...correctAnswers, extra]
    }
    correctAnswers = correctAnswers.slice(0, 2).sort((a, b) => a - b)
  } else {
    const labels =
      Array.isArray(raw.categoryLabels) && raw.categoryLabels.length >= 2
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
      stimulus,
      imagePrompt,
      tpCodes: Array.isArray(raw.tpCodes)
        ? raw.tpCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
        : undefined,
      kompleksitas,
    }
  }

  return {
    type,
    question,
    options,
    correctAnswers,
    explanation: raw.explanation ? String(raw.explanation) : undefined,
    stimulus,
    imagePrompt,
    tpCodes: Array.isArray(raw.tpCodes)
      ? raw.tpCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
      : undefined,
    kompleksitas,
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim())
}

async function generateDalleImage(prompt: string, apiKey: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: `${prompt}. Children's educational illustration, simple, colorful, no text, no watermark.`,
        n: 1,
        size: '512x512',
      }),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    return data?.data?.[0]?.url as string | undefined
  } catch {
    return undefined
  }
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
  const stimulusMode = opts.stimulusMode || 'none'

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
        { role: 'system', content: buildSystemPrompt() },
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

  let drafts = arr
    .map((r: any) => normalizeDraft(r, opts.kompleksitas))
    .filter(Boolean) as AiDraftQuestion[]

  if (drafts.length === 0) {
    throw new Error('Tidak ada soal valid dari AI. Coba ubah opsi/jumlah.')
  }

  // Mode gambar: coba DALL·E per soal yang punya imagePrompt
  if (stimulusMode === 'image' && opts.generateImages !== false) {
    for (let i = 0; i < drafts.length; i++) {
      const p = drafts[i].imagePrompt || drafts[i].stimulus
      if (!p) continue
      const url = await generateDalleImage(p, key)
      if (url) drafts[i] = { ...drafts[i], stimulusImage: url }
    }
  }

  return drafts
}
