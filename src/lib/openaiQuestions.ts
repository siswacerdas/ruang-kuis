/**
 * Generate draft soal via OpenAI — arahan & API.
 *
 * File ini adalah "penghubung" petunjuk ke AI (system + user prompt).
 * Kunci: VITE_OPENAI_API_KEY di .env (jangan commit).
 *
 * Produksi: pindahkan pemanggilan ke Cloud Function agar key tidak di client.
 */

import type { QuestionType, SubjectKey } from '../types/question'
<<<<<<< Updated upstream
=======
import { compressImageSrc } from './imageCompress'
>>>>>>> Stashed changes

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
