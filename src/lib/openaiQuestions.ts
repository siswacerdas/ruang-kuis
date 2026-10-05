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
  stimulusMode?: StimulusMode
  kompleksitas?: KompleksitasLevel
  extraContext?: string
  model?: string
  /** Generate gambar (GPT Image) bila stimulusMode === 'image' (default true) */
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
6. Stimulus gambar — WAJIB netral terhadap kunci jawaban:
   - imagePrompt (English): ilustrasi sederhana, ramah anak, SEBAIKNYA tanpa teks/angka/label yang langsung menunjuk jawaban.
   - JANGAN menggambar kunci jawaban secara eksplisit (contoh: jangan lingkari opsi benar, jangan tulis "jawaban: 3", jangan hanya menampilkan angka/hasil akhir yang sama dengan kunci).
   - Gambar harus memberi DATA atau KONTEKS untuk dianalisis (diagram, benda dihitung, situasi, peta sederhana, grafik kasar) sehingga siswa menafsirkan sendiri.
   - Field stimulus (Indonesia): keterangan netral 1–3 kalimat (apa yang terlihat), TANPA menyimpulkan jawaban soal.
   - Pertanyaan mengarahkan siswa mengolah informasi dari gambar; opsi pengecoh masuk akal dari interpretasi yang salah.
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
- Isi "imagePrompt" (English): scene netral, age-appropriate, no scary content. JANGAN menyertakan teks jawaban, angka kunci, atau penanda opsi benar di dalam gambar.
- Gambar = bahan analisis (objek dihitung, situasi, diagram), BUKAN spanduk jawaban.
- Isi "stimulus" (Indonesia) 1–3 kalimat keterangan netral; jangan tulis jawaban di sana.
- Pertanyaan memaksa siswa menginterpretasi gambar; kunci tidak boleh terbaca langsung hanya dari melihat gambar tanpa berpikir.`

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

export type GenerateAiResult = {
  drafts: AiDraftQuestion[]
  /** Peringatan jika soal berhasil tapi gambar gagal */
  imageWarnings: string[]
}

/**
 * Model gambar (GPT Image family — DALL·E sudah retired di banyak akun).
 * Default hemat: gpt-image-1-mini + quality low.
 * Override: VITE_OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
 */
function resolveImageModel(): string {
  return (
    import.meta.env.VITE_OPENAI_IMAGE_MODEL?.trim() ||
    'gpt-image-1-mini'
  )
}

async function generateOpenAiImage(
  prompt: string,
  apiKey: string
): Promise<{ url?: string; error?: string }> {
  const fullPrompt = [
    prompt.trim(),
    "Children's educational illustration for Indonesian elementary school, simple, colorful, neutral teaching material.",
    'No text overlays, no watermarks, no circled answers, no explicit solution numbers.',
  ].join(' ')

  const primary = resolveImageModel()
  // Urutan: model pilihan user → mini (hemat) → gpt-image-2
  const attempts: { model: string; quality: string; size: string }[] = [
    { model: primary, quality: 'low', size: '1024x1024' },
  ]
  if (primary !== 'gpt-image-1-mini') {
    attempts.push({ model: 'gpt-image-1-mini', quality: 'low', size: '1024x1024' })
  }
  if (primary !== 'gpt-image-2' && primary !== 'gpt-image-1-mini') {
    attempts.push({ model: 'gpt-image-2', quality: 'low', size: '1024x1024' })
  }

  const errors: string[] = []
  for (const a of attempts) {
    try {
      const body: Record<string, unknown> = {
        model: a.model,
        prompt: fullPrompt.slice(0, 32000),
        n: 1,
        size: a.size,
        quality: a.quality,
      }

      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.error?.code ||
          `HTTP ${res.status}`
        errors.push(`${a.model}: ${msg}`)
        continue
      }
      const item = data?.data?.[0]
      // GPT Image default: b64_json; beberapa model masih bisa url
      if (item?.b64_json) {
        return { url: `data:image/png;base64,${item.b64_json}` }
      }
      if (item?.url) {
        return { url: item.url as string }
      }
      errors.push(`${a.model}: respons tanpa gambar (b64/url)`)
    } catch (e: any) {
      errors.push(`${a.model}: ${e?.message || 'network error'}`)
    }
  }
  return { error: errors.join(' | ') || 'Gagal generate gambar' }
}

export async function generateQuestionsWithOpenAI(
  opts: GenerateAiOptions
): Promise<GenerateAiResult> {
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

  const imageWarnings: string[] = []

  // Mode gambar: GPT Image API per soal
  if (stimulusMode === 'image' && opts.generateImages !== false) {
    for (let i = 0; i < drafts.length; i++) {
      let p = (drafts[i].imagePrompt || '').trim()
      if (!p && drafts[i].stimulus) {
        // Fallback: buat prompt dari keterangan Indonesia
        p = `Educational scene for elementary school: ${drafts[i].stimulus}`
        drafts[i] = { ...drafts[i], imagePrompt: p }
      }
      if (!p) {
        imageWarnings.push(`Soal ${i + 1}: AI tidak memberi imagePrompt — gambar dilewati.`)
        continue
      }
      const result = await generateOpenAiImage(p, key)
      if (result.url) {
        drafts[i] = { ...drafts[i], stimulusImage: result.url }
      } else {
        imageWarnings.push(`Soal ${i + 1}: ${result.error || 'gagal'}`)
      }
    }
  } else if (stimulusMode === 'image' && opts.generateImages === false) {
    imageWarnings.push(
      'Generate gambar dimatikan. Hanya keterangan stimulus teks yang disimpan; unggah gambar manual nanti.'
    )
  }

  return { drafts, imageWarnings }
}

/* ============================================================================
 * GAMBAR SAJA untuk soal yang sudah ada (editor soal)
 * Alur: (1) teks AI menulis prompt gambar dari soal → (2) GPT Image membuat gambar
 *       → (3) dikonversi di browser ke JPEG kecil (≤ ±150 KB, maks 800 px).
 * ============================================================================ */

export type StimulusImageInput = {
  subjectName: string
  topicName: string
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  /** Stimulus teks dari editor (boleh HTML) */
  stimulusHtml?: string
  /** Arahan tambahan dari guru, mis. "7 apel dan 3 jeruk di atas meja" */
  hint?: string
}

export type StimulusImageResult = {
  dataUrl: string
  width: number
  height: number
  bytesApprox: number
  imagePrompt: string
}

const IMAGE_FOR_QUESTION_GUIDANCE = `Kamu membantu guru SD kelas 5 membuat GAMBAR PENDUKUNG untuk satu soal yang sudah jadi.
Tugasmu: tulis satu prompt gambar (bahasa Inggris, 1–3 kalimat) agar gambar memuat informasi visual yang DIBUTUHKAN siswa untuk menjawab soal.
Balas HANYA JSON valid: {"imagePrompt":"..."}

Aturan:
1. Gambar harus konsisten dengan soal dan kunci jawaban (jumlah benda, posisi, urutan, perbandingan), tetapi JANGAN membocorkan kunci: tanpa lingkaran/centang/tanda pada opsi benar, tanpa tulisan jawaban.
2. Tampilkan DATA atau KONTEKS yang harus ditafsirkan siswa (benda untuk dihitung, situasi, diagram sederhana, denah, grafik kasar), bukan sekadar hasil akhir.
3. Hindari teks, angka, dan label di dalam gambar (model gambar sering salah menulis). Bila soal benar-benar membutuhkannya, minta sesedikit mungkin, besar, dan jelas.
4. Gaya: ilustrasi sederhana, warna cerah, latar putih/polos, objek besar dan jelas, sedikit objek (maksimal sekitar 10), aman untuk anak.
5. Jangan menggambar tokoh nyata atau merek dagang.
6. Jika ada arahan guru, ikuti selama tidak membocorkan jawaban.`

function htmlToPlainText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

function buildImagePromptRequest(input: StimulusImageInput): string {
  const letters = 'ABCDEFGH'
  const opts = input.options.map((o) => o.trim())
  const optionLines = opts
    .map((o, i) => (o ? `${letters[i] || i + 1}. ${o}` : ''))
    .filter(Boolean)
    .join('\n')

  let keyLine = ''
  if (input.type === 'category') {
    const labels = input.categoryLabels?.length ? input.categoryLabels : ['Benar', 'Salah']
    keyLine = opts
      .map((o, i) => (o ? `- ${o} → ${labels[input.correctAnswers[i]] ?? '?'}` : ''))
      .filter(Boolean)
      .join('\n')
  } else {
    keyLine = input.correctAnswers
      .map((i) => (opts[i] ? `${letters[i] || i + 1}. ${opts[i]}` : ''))
      .filter(Boolean)
      .join('; ')
  }

  const stim = htmlToPlainText(input.stimulusHtml || '')

  return [
    `Mapel: ${input.subjectName}`,
    `Materi: ${input.topicName}`,
    `Pertanyaan: ${input.question.trim()}`,
    optionLines ? `Opsi:\n${optionLines}` : '',
    keyLine ? `Kunci (hanya agar gambar konsisten — JANGAN digambar/ditulis):\n${keyLine}` : '',
    stim ? `Teks stimulus yang sudah ada: ${stim}` : '',
    input.hint?.trim() ? `Arahan guru untuk gambar: ${input.hint.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Buat HANYA gambar stimulus untuk satu soal yang sudah ada.
 * Hasil sudah dikonversi ke JPEG kecil (data-URL) dan siap diisi ke form.stimulusImage.
 */
export async function generateStimulusImage(
  input: StimulusImageInput
): Promise<StimulusImageResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  if (!input.question.trim()) {
    throw new Error('Isi pertanyaan terlebih dahulu agar gambar sesuai soal.')
  }

  // (1) Prompt gambar dari soal
  let imagePrompt = ''
  try {
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: IMAGE_FOR_QUESTION_GUIDANCE },
          { role: 'user', content: buildImagePromptRequest(input) },
        ],
      }),
    })
    if (res.status === 401) throw new Error('API key OpenAI tidak valid (401).')
    if (res.status === 429) throw new Error('Batas kuota/rate OpenAI (429). Coba lagi nanti.')
    if (res.ok) {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string') {
        imagePrompt = String(JSON.parse(content)?.imagePrompt || '').trim()
      }
    }
  } catch (e: any) {
    // Kesalahan kunci/kuota diteruskan; selain itu pakai fallback di bawah
    if (/401|429/.test(String(e?.message))) throw e
  }
  if (!imagePrompt) {
    imagePrompt = `Simple educational illustration for an elementary school question: ${input.question.trim()}`
  }
  if (input.hint?.trim() && !imagePrompt.toLowerCase().includes(input.hint.trim().toLowerCase())) {
    imagePrompt = `${imagePrompt} Teacher note: ${input.hint.trim()}`
  }

  // (2) Gambar (memakai fungsi yang sama dengan generate soal: model, fallback, aturan "tanpa teks/jawaban")
  const img = await generateOpenAiImage(imagePrompt, key)
  if (!img.url) throw new Error(img.error || 'Gagal membuat gambar')

  // (3) Konversi ke ukuran/resolusi kecil agar muat disimpan di dokumen soal
  const small = await compressImageSrc(img.url, { maxSide: 800, targetChars: 200_000 })
  return { ...small, imagePrompt }
}

/* ============================================================================
 * SEIMBANGKAN PILIHAN JAWABAN (editor soal)
 * Menulis ulang TEKS opsi agar tidak ada pola yang membocorkan kunci
 * (mis. "opsi terpanjang = jawaban benar"), tanpa mengubah urutan, jumlah, maupun kunci.
 * Alur: (1) AI menulis ulang opsi → (2) pemeriksa AI menjawab soal secara buta
 *       (tanpa kunci) dan hasilnya dibandingkan dengan kunci guru.
 * ============================================================================ */

export type RewriteOptionsInput = {
  subjectName: string
  topicName: string
  type: QuestionType
  question: string
  /** Stimulus teks dari editor (boleh HTML) */
  stimulusHtml?: string
  /** Pembahasan guru (membantu AI memahami mengapa kunci benar) */
  explanation?: string
  /** Soal punya gambar stimulus yang tidak bisa dilihat AI */
  hasImage?: boolean
  options: string[]
  /** single/multiple: indeks opsi benar. category: indeks label (0/1) per pernyataan. */
  correctAnswers: number[]
  categoryLabels?: string[]
  /** Arahan tambahan dari guru */
  hint?: string
}

export type OptionVerification = {
  status: 'ok' | 'mismatch' | 'skipped'
  message: string
}

export type RewriteOptionsResult = {
  options: string[]
  /** Indeks opsi yang teksnya berubah */
  changed: number[]
  /** Ringkasan dari AI: apa yang diubah dan mengapa */
  note: string
  verification: OptionVerification
}

const OPTION_REWRITE_GUIDANCE = `Kamu adalah editor soal asesmen untuk siswa SD kelas 5 di Indonesia (Kurikulum Merdeka).
TUGASMU: menulis ulang TEKS pilihan jawaban sebuah soal supaya siswa TIDAK bisa menebak jawaban dari pola, misalnya "opsi terpanjang adalah jawaban benar". Pertanyaan dan kunci jawaban TIDAK boleh berubah.

FORMAT MASUKAN
Kamu menerima: pertanyaan, stimulus (jika ada), pembahasan guru (jika ada), dan daftar opsi. Setiap opsi diberi nomor/huruf, status kunci, dan panjang karakternya:
- [KUNCI BENAR] = opsi yang benar menurut guru.
- [SALAH – pengecoh] = opsi yang salah menurut guru.
- Untuk soal kategori, setiap pernyataan diberi label kunci (mis. [Benar] atau [Salah]).

LANGKAH BERPIKIR (lakukan dalam pikiranmu, jangan ditulis)
1. Pahami pertanyaan dan stimulus. Pahami MENGAPA opsi berstatus kunci itu benar (gunakan pembahasan guru bila ada).
2. Untuk setiap pengecoh, pahami kesalahan/kesalahpahaman apa yang diwakilinya terhadap pertanyaan tersebut.
3. Cari pola yang bisa dipakai siswa untuk menebak (lihat daftar pola di bawah).
4. Tulis ulang seperlunya, lalu periksa lagi bahwa kunci tetap benar dan setiap pengecoh tetap salah.

ATURAN KUNCI (TIDAK BOLEH DILANGGAR)
1. Jumlah opsi dan URUTANNYA sama persis dengan masukan. Opsi nomor/huruf ke-n tetap menjadi opsi ke-n, karena kunci disimpan berdasarkan urutan.
2. Opsi berstatus benar tetap BENAR secara makna; opsi berstatus salah tetap SALAH secara tegas. Jangan membuat pengecoh menjadi (juga) benar, dan jangan membuat opsi benar menjadi salah atau ambigu. Pada soal kategori, setiap pernyataan mempertahankan label kuncinya.
3. Jangan mengubah fakta, angka, satuan, nama, atau istilah yang menentukan benar/salahnya sebuah opsi.
4. Jangan mengarang fakta baru. Jika menyeimbangkan memerlukan fakta yang tidak kamu ketahui pasti, lebih baik PERPENDEK opsi yang terlalu panjang daripada menambah isi.
5. Jika soal memiliki gambar stimulus (yang tidak bisa kamu lihat), jangan menambahkan detail tentang isi gambar; cukup sesuaikan panjang dan gaya kalimat.

POLA YANG HARUS DIHILANGKAN
a. PANJANG: panjang semua opsi harus mirip (selisih opsi terpanjang dan terpendek sebaiknya tidak lebih dari sekitar 20–25% atau 3 kata). Opsi benar TIDAK boleh menjadi yang terpanjang maupun terpendek. Pada soal kategori, pernyataan berlabel benar dan salah harus berpanjang setara.
b. STRUKTUR: kalimat paralel — awalan, bentuk kata kerja, dan pola kalimat sama di semua opsi.
c. RINCIAN: tingkat detail sama. Jangan hanya opsi benar yang diberi alasan, contoh, atau kata "karena ...".
d. KATA PETUNJUK: hindari kata mutlak (selalu, tidak pernah, hanya, semua, satu-satunya) yang hanya muncul di pengecoh; hindari kata dari pertanyaan atau stimulus yang hanya muncul di opsi benar.
e. KEWAJARAN: setiap pengecoh harus terdengar masuk akal bagi siswa yang belum paham, dan terkait langsung dengan pertanyaan/stimulus. Tidak boleh konyol, tidak boleh menyimpang ke topik lain.
f. TUMPANG TINDIH: tidak ada dua opsi yang artinya sama atau saling mencakup. Jangan memakai "semua benar", "semua salah", atau "tidak ada yang benar".

CARA MEMPERBAIKI
- Ubah SEMINIMAL MUNGKIN. Opsi yang sudah baik dibiarkan PERSIS sama.
- Utamakan: menambah detail relevan yang tetap salah pada pengecoh yang terlalu pendek, dan/atau meringkas opsi benar tanpa kehilangan makna.
- Jika opsi berupa angka, satu kata, atau nilai singkat dan sudah seimbang, kembalikan apa adanya.
- Jika semua opsi sudah seimbang, kembalikan semuanya tanpa perubahan dan jelaskan di "note".
- Bahasa Indonesia baku, ramah anak SD. Tulis hanya isi opsi: tanpa awalan "A.", "B.", nomor, atau tanda kutip pembungkus.
- Ikuti arahan guru jika ada, selama tidak melanggar aturan kunci.

FORMAT KELUARAN
Balas HANYA JSON valid: {"options":["...","..."],"note":"..."}
- "options": array string dengan jumlah dan urutan sama persis dengan masukan.
- "note": 1–2 kalimat Bahasa Indonesia: opsi mana yang diubah dan alasannya (atau bahwa tidak ada yang perlu diubah).`

const OPTION_VERIFY_GUIDANCE = `Kamu pemeriksa soal untuk siswa SD kelas 5. Jawab soal berikut sendiri secara independen dan teliti, lalu balas HANYA JSON: {"answers":[...]}.
- Soal pilihan ganda: "answers" berisi tepat 1 indeks (mulai dari 0) opsi yang benar.
- Soal pilihan ganda kompleks: "answers" berisi semua indeks (mulai dari 0) opsi yang benar.
- Soal kategori: "answers" berisi satu angka per pernyataan, berurutan; 0 jika pernyataan sesuai label pertama, 1 jika sesuai label kedua.
Jika soal kurang jelas, tetap pilih jawaban yang paling tepat.`

async function callOpenAiJson(
  key: string,
  system: string,
  user: string,
  temperature: number
): Promise<any> {
  const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
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
  if (!content || typeof content !== 'string') throw new Error('Respons OpenAI kosong.')
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Respons OpenAI bukan JSON valid.')
  }
}

const OPTION_LETTERS = 'ABCDEF'

function describeKey(input: RewriteOptionsInput): string[] {
  const labels = input.categoryLabels?.length ? input.categoryLabels : ['Benar', 'Salah']
  return input.options.map((_, i) =>
    input.type === 'category'
      ? `[${labels[input.correctAnswers[i] === 1 ? 1 : 0] || '?'}]`
      : input.correctAnswers.includes(i)
        ? '[KUNCI BENAR]'
        : '[SALAH – pengecoh]'
  )
}

function buildRewriteRequest(input: RewriteOptionsInput): string {
  const typeLabel =
    input.type === 'single'
      ? 'Pilihan ganda (tepat 1 jawaban benar)'
      : input.type === 'multiple'
        ? 'Pilihan ganda kompleks (lebih dari satu jawaban benar mungkin)'
        : `Kategori (tiap pernyataan dinilai ${(input.categoryLabels?.length ? input.categoryLabels : ['Benar', 'Salah']).join(' / ')})`
  const keys = describeKey(input)
  const lines = input.options.map(
    (o, i) =>
      `${input.type === 'category' ? i + 1 : OPTION_LETTERS[i] || i + 1}. ${keys[i]} (${o.trim().length} karakter) ${o.trim()}`
  )

  // Statistik panjang supaya AI melihat pola yang ada
  let stats = ''
  if (input.type !== 'category') {
    const c = input.options.filter((_, i) => input.correctAnswers.includes(i)).map((o) => o.trim().length)
    const w = input.options.filter((_, i) => !input.correctAnswers.includes(i)).map((o) => o.trim().length)
    const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0)
    stats = `Rata-rata panjang: opsi benar ${mean(c)} karakter, pengecoh ${mean(w)} karakter.`
  }

  const stim = htmlToPlainText(input.stimulusHtml || '')
  return [
    `Mapel: ${input.subjectName}`,
    `Materi: ${input.topicName}`,
    `Jenis soal: ${typeLabel}`,
    `PERTANYAAN: ${input.question.trim()}`,
    stim ? `STIMULUS TEKS: ${stim}` : '',
    input.hasImage ? 'CATATAN: soal ini memiliki gambar stimulus yang TIDAK bisa kamu lihat.' : '',
    input.explanation?.trim() ? `PEMBAHASAN GURU: ${htmlToPlainText(input.explanation)}` : '',
    `DAFTAR OPSI (${input.options.length} opsi; urutan dan jumlah TIDAK boleh berubah):`,
    lines.join('\n'),
    stats,
    input.hint?.trim() ? `ARAHAN GURU: ${input.hint.trim()}` : '',
    `Tulis ulang opsi sesuai aturan. Kembalikan tepat ${input.options.length} opsi.`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function verifyOptionKey(
  key: string,
  input: RewriteOptionsInput,
  newOptions: string[],
  /** Yang diubah AI, untuk kalimat saran ("pilihan" / "stimulus") */
  what: string = 'pilihan'
): Promise<OptionVerification> {
  if (input.hasImage) {
    return {
      status: 'skipped',
      message: 'Soal memakai gambar, jadi pemeriksaan otomatis dilewati. Cek kunci jawaban secara manual.',
    }
  }
  try {
    const labels = input.categoryLabels?.length ? input.categoryLabels : ['Benar', 'Salah']
    const stim = htmlToPlainText(input.stimulusHtml || '')
    const user = [
      `Jenis soal: ${input.type === 'single' ? 'pilihan ganda' : input.type === 'multiple' ? 'pilihan ganda kompleks' : `kategori (label 0 = "${labels[0]}", label 1 = "${labels[1]}")`}`,
      stim ? `Stimulus: ${stim}` : '',
      `Pertanyaan: ${input.question.trim()}`,
      'Opsi:',
      newOptions.map((o, i) => `${i}. ${o}`).join('\n'),
    ]
      .filter(Boolean)
      .join('\n')
    const parsed = await callOpenAiJson(key, OPTION_VERIFY_GUIDANCE, user, 0)
    const ans: number[] = Array.isArray(parsed?.answers)
      ? parsed.answers.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
      : []

    if (input.type === 'category') {
      const expected = newOptions.map((_, i) => (input.correctAnswers[i] === 1 ? 1 : 0))
      const diff = expected
        .map((e, i) => (ans[i] !== e ? i + 1 : 0))
        .filter(Boolean)
      return diff.length === 0
        ? { status: 'ok', message: 'Pemeriksa AI menjawab soal tanpa melihat kunci dan hasilnya sama dengan kunci Anda.' }
        : {
            status: 'mismatch',
            message: `Pemeriksa AI menilai pernyataan nomor ${diff.join(', ')} berbeda dari kunci Anda. Periksa manual atau kembalikan ${what} semula.`,
          }
    }

    const got = [...new Set(ans)].sort((a, b) => a - b)
    const want = [...input.correctAnswers].sort((a, b) => a - b)
    const same = got.length === want.length && got.every((v, i) => v === want[i])
    const show = (a: number[]) => a.map((i) => OPTION_LETTERS[i] || i + 1).join(', ') || '-'
    return same
      ? { status: 'ok', message: 'Pemeriksa AI menjawab soal tanpa melihat kunci dan hasilnya sama dengan kunci Anda.' }
      : {
          status: 'mismatch',
          message: `Pemeriksa AI memilih ${show(got)}, sedangkan kunci Anda ${show(want)}. Periksa manual atau kembalikan ${what} semula.`,
        }
  } catch {
    return { status: 'skipped', message: 'Pemeriksaan otomatis gagal dijalankan. Cek kunci jawaban secara manual.' }
  }
}

/**
 * Tulis ulang teks pilihan jawaban agar bebas pola (mis. terpanjang = benar).
 * Urutan, jumlah, dan kunci tidak berubah; hasil diperiksa silang oleh AI kedua.
 */
export async function rewriteOptionsWithAI(
  input: RewriteOptionsInput
): Promise<RewriteOptionsResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  if (!input.question.trim()) throw new Error('Isi pertanyaan terlebih dahulu.')
  if (input.options.length < 2 || input.options.some((o) => !o.trim())) {
    throw new Error('Isi semua pilihan terlebih dahulu; AI menulis ulang pilihan yang sudah ada.')
  }

  const parsed = await callOpenAiJson(key, OPTION_REWRITE_GUIDANCE, buildRewriteRequest(input), 0.5)

  const raw: unknown[] = Array.isArray(parsed?.options) ? parsed.options : []
  if (raw.length !== input.options.length) {
    throw new Error(
      `AI mengembalikan ${raw.length} opsi, seharusnya ${input.options.length}. Coba lagi.`
    )
  }
  const options = raw.map((o) =>
    String(o ?? '')
      .trim()
      // buang awalan "A." / "B)" bila AI menambahkannya
      .replace(/^[A-Fa-f][.)]\s+/, '')
      .trim()
  )
  if (options.some((o) => !o)) throw new Error('AI menghasilkan opsi kosong. Coba lagi.')
  const norm = options.map((o) => o.toLowerCase().replace(/\s+/g, ' '))
  if (new Set(norm).size !== norm.length) {
    throw new Error('AI menghasilkan dua opsi yang sama. Coba lagi.')
  }

  const changed = options
    .map((o, i) => (o !== input.options[i].trim() ? i : -1))
    .filter((i) => i >= 0)
  const note =
    typeof parsed?.note === 'string' && parsed.note.trim()
      ? parsed.note.trim()
      : changed.length
        ? 'Panjang dan gaya pilihan disesuaikan.'
        : 'Pilihan sudah seimbang, tidak ada yang diubah.'

  const verification =
    changed.length === 0
      ? ({ status: 'ok', message: 'Tidak ada perubahan, kunci jawaban tetap.' } as OptionVerification)
      : await verifyOptionKey(key, input, options)

  return { options, changed, note, verification }
}

/* ============================================================================
 * PERBAIKI STIMULUS TEKS (editor soal)
 * Menulis ulang stimulus yang sudah ada agar jelas, runtut, dan pas dengan
 * pertanyaan + pilihan jawaban, tanpa membocorkan atau mengubah kunci.
 * Alur: (1) AI memperbaiki stimulus → (2) cek lokal (angka hilang, jawaban tersalin)
 *       → (3) pemeriksa AI menjawab soal secara buta memakai stimulus baru.
 * ============================================================================ */

export type ImproveStimulusInput = RewriteOptionsInput & {
  /** Stimulus saat ini (HTML dari editor atau teks polos). Wajib terisi. */
  stimulusHtml: string
}

export type ImproveStimulusResult = {
  /** HTML bersih (hanya tag yang aman untuk editor guru & halaman siswa) */
  stimulusHtml: string
  changed: boolean
  note: string
  /** Peringatan hasil cek lokal (angka hilang, jawaban tersalin, panjang berubah drastis) */
  warnings: string[]
  verification: OptionVerification
}

const STIMULUS_IMPROVE_GUIDANCE = `Kamu adalah editor stimulus soal asesmen untuk siswa SD kelas 5 di Indonesia (Kurikulum Merdeka).
TUGASMU: memperbaiki STIMULUS TEKS sebuah soal agar lebih baik: jelas, runtut, akurat, dan pas dengan pertanyaan serta pilihan jawabannya. Pertanyaan, pilihan jawaban, dan kunci TIDAK boleh berubah; kamu hanya mengubah stimulus.

FORMAT MASUKAN
Kamu menerima: stimulus saat ini (HTML atau teks polos), pertanyaan, daftar opsi dengan status kunci, dan pembahasan guru (jika ada).
- [KUNCI BENAR] = opsi yang benar menurut guru; [SALAH – pengecoh] = opsi yang salah.
- Untuk soal kategori, setiap pernyataan diberi label kuncinya.

LANGKAH BERPIKIR (lakukan dalam pikiranmu, jangan ditulis)
1. Pahami pertanyaan dan MENGAPA kunci benar. Tentukan informasi apa dari stimulus yang harus dibaca siswa untuk sampai ke kunci.
2. Pahami tiap pengecoh: kesalahan berpikir apa yang diwakilinya. Stimulus harus cukup agar siswa yang teliti bisa menolak pengecoh itu.
3. Nilai stimulus saat ini: apa yang kurang (kurang jelas, tidak runtut, ejaan/tata bahasa, terlalu panjang, tidak relevan, data penting tidak ada, istilah terlalu sulit).
4. Perbaiki seperlunya, lalu periksa lagi aturan di bawah.

HUBUNGAN STIMULUS – PERTANYAAN – OPSI (WAJIB)
1. Stimulus harus memuat semua informasi/data yang dibutuhkan untuk menjawab; pertanyaan harus tetap TIDAK bisa dijawab tanpa membaca stimulus.
2. Stimulus TIDAK boleh menyatakan jawaban secara langsung: jangan menyalin teks opsi benar, jangan menarik kesimpulan yang persis sama dengan kunci. Siswa harus mengolah informasi sendiri.
3. Stimulus harus mendukung kunci dan tidak boleh bertentangan dengannya. Tidak boleh ada informasi yang membuat pengecoh menjadi benar.
4. Stimulus tidak boleh memuat informasi yang membuat soal menjadi ambigu (dua opsi sama-sama benar).

ATURAN ISI
1. Pertahankan semua fakta, angka, nama, satuan, tanggal, dan data yang dipakai untuk menjawab. Jangan menghapus data penting; jangan mengubah nilai angka.
2. Jangan mengarang fakta baru yang bisa memengaruhi jawaban. Menambah konteks umum yang aman (latar cerita, nama tokoh, tempat) boleh, selama tidak mengubah jawaban.
3. Bahasa Indonesia baku sesuai PUEBI, kalimat efektif, ramah anak kelas 5, istilah sulit dijelaskan atau diganti. Panjang wajar: sekitar 2–6 kalimat atau data singkat; jangan bertele-tele.
4. Ubah SEMINIMAL yang perlu. Jika stimulus sudah baik, kembalikan sama persis dan jelaskan di "note".
5. Jika soal punya gambar stimulus (yang tidak bisa kamu lihat): jangan mengarang isi gambar dan jangan menghapus rujukan ke gambar.
6. Ikuti arahan guru jika ada, selama tidak melanggar aturan di atas.

ATURAN FORMAT (HTML)
- Gunakan HANYA tag: <p>, <br>, <b>, <i>, <u>, <sub>, <sup>.
- Satu paragraf = satu <p>. Data baris-per-baris (mis. "Apel: 5 buah") ditulis dalam satu <p> dengan <br> di antara baris. Jangan memakai tabel, daftar (ul/ol/li), gambar, judul (h1–h6), class, atau style.
- Jika stimulus lama memuat <span class="math-tex" data-latex="...">...</span> (persamaan), salin persis; jangan membuat yang baru.

FORMAT KELUARAN
Balas HANYA JSON valid: {"stimulus":"<p>...</p>","note":"..."}
- "stimulus": HTML stimulus yang sudah diperbaiki.
- "note": 1–2 kalimat Bahasa Indonesia: apa yang diperbaiki dan mengapa (atau bahwa stimulus sudah baik).`

function buildImproveStimulusRequest(input: ImproveStimulusInput): string {
  const keys = describeKey(input)
  const typeLabel =
    input.type === 'single'
      ? 'Pilihan ganda (tepat 1 jawaban benar)'
      : input.type === 'multiple'
        ? 'Pilihan ganda kompleks (lebih dari satu jawaban benar mungkin)'
        : `Kategori (tiap pernyataan dinilai ${(input.categoryLabels?.length ? input.categoryLabels : ['Benar', 'Salah']).join(' / ')})`
  const lines = input.options.map(
    (o, i) =>
      `${input.type === 'category' ? i + 1 : OPTION_LETTERS[i] || i + 1}. ${keys[i]} ${o.trim()}`
  )
  return [
    `Mapel: ${input.subjectName}`,
    `Materi: ${input.topicName}`,
    `Jenis soal: ${typeLabel}`,
    `PERTANYAAN: ${input.question.trim()}`,
    `STIMULUS SAAT INI (yang harus diperbaiki):\n${input.stimulusHtml.trim()}`,
    input.hasImage ? 'CATATAN: soal ini memiliki gambar stimulus yang TIDAK bisa kamu lihat.' : '',
    input.explanation?.trim() ? `PEMBAHASAN GURU: ${htmlToPlainText(input.explanation)}` : '',
    `DAFTAR OPSI (tidak boleh diubah):\n${lines.join('\n')}`,
    input.hint?.trim() ? `ARAHAN GURU: ${input.hint.trim()}` : '',
    'Perbaiki stimulus sesuai aturan.',
  ]
    .filter(Boolean)
    .join('\n')
}

const normText = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()

/** Angka dalam teks, dinormalisasi (tanpa pemisah ribuan/desimal) untuk perbandingan. */
function numberTokens(plain: string): { raw: string; token: string }[] {
  return (plain.match(/\d+(?:[.,]\d+)*/g) || []).map((raw) => ({
    raw,
    token: raw.replace(/[.,]/g, ''),
  }))
}

function stimulusWarnings(input: ImproveStimulusInput, oldPlain: string, newPlain: string): string[] {
  const out: string[] = []

  // 1. Angka dari stimulus lama yang hilang
  const have = new Set(numberTokens(newPlain).map((n) => n.token))
  const missing = [
    ...new Set(
      numberTokens(oldPlain)
        .filter((n) => !have.has(n.token))
        .map((n) => n.raw)
    ),
  ]
  if (missing.length) {
    out.push(
      `Angka dari stimulus lama tidak ditemukan lagi: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', …' : ''}. Pastikan tidak ada data penting yang hilang.`
    )
  }

  // 2. Stimulus memuat kalimat jawaban benar secara persis
  if (input.type !== 'category') {
    const n = normText(newPlain)
    const leaked = input.correctAnswers
      .filter((i) => {
        const opt = normText(input.options[i] || '')
        return opt.length >= 12 && n.includes(opt)
      })
      .map((i) => OPTION_LETTERS[i] || String(i + 1))
    if (leaked.length) {
      out.push(
        `Stimulus memuat teks yang sama persis dengan jawaban benar (opsi ${leaked.join(', ')}). Siswa bisa menjawab hanya dengan menyalin.`
      )
    }
  }

  // 3. Panjang berubah drastis
  if (oldPlain.length >= 80 && newPlain.length < oldPlain.length * 0.5) {
    out.push('Stimulus menjadi jauh lebih pendek dari sebelumnya. Cek apakah ada informasi yang hilang.')
  } else if (newPlain.length > 450 && newPlain.length > oldPlain.length * 2.2) {
    out.push('Stimulus menjadi jauh lebih panjang. Pertimbangkan meringkas agar sesuai untuk siswa SD.')
  }
  return out
}

/**
 * Perbaiki stimulus teks agar sesuai konteks pertanyaan dan pilihan jawaban.
 * Pertanyaan, opsi, dan kunci tidak berubah; hasil diperiksa lokal dan oleh AI kedua.
 */
export async function improveStimulusWithAI(
  input: ImproveStimulusInput
): Promise<ImproveStimulusResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  const oldPlain = htmlToPlainText(input.stimulusHtml)
  if (!oldPlain) throw new Error('Stimulus masih kosong. Tulis stimulus terlebih dahulu.')
  if (!input.question.trim()) throw new Error('Isi pertanyaan terlebih dahulu.')
  if (input.options.length < 2 || input.options.some((o) => !o.trim())) {
    throw new Error('Isi semua pilihan terlebih dahulu agar AI memahami hubungan stimulus dengan jawaban.')
  }

  const parsed = await callOpenAiJson(
    key,
    STIMULUS_IMPROVE_GUIDANCE,
    buildImproveStimulusRequest(input),
    0.4
  )

  const html = sanitizeAiStimulusHtml(typeof parsed?.stimulus === 'string' ? parsed.stimulus : '')
  const newPlain = htmlToPlainText(html)
  if (!newPlain) throw new Error('AI tidak mengembalikan stimulus. Coba lagi.')

  const changed = normText(newPlain) !== normText(oldPlain)
  const note =
    typeof parsed?.note === 'string' && parsed.note.trim()
      ? parsed.note.trim()
      : changed
        ? 'Stimulus diperbaiki agar lebih jelas dan sesuai soal.'
        : 'Stimulus sudah baik, tidak ada yang diubah.'

  if (!changed) {
    return {
      stimulusHtml: input.stimulusHtml,
      changed: false,
      note,
      warnings: [],
      verification: { status: 'ok', message: 'Tidak ada perubahan.' },
    }
  }

  const warnings = stimulusWarnings(input, oldPlain, newPlain)
  const verification = await verifyOptionKey(
    key,
    { ...input, stimulusHtml: html },
    input.options,
    'stimulus'
  )
  return { stimulusHtml: html, changed: true, note, warnings, verification }
}
