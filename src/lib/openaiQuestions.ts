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

/* ============================================================================
 * ARAHAN UTAMA KE AI (system prompt)
 * Sesuaikan di sini jika ingin mengubah gaya penulisan soal nasional/sekolah.
 * =========================================================================== */
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
- stimulusKind: "none" | "text" | "image" — wajib; sesuai kuota yang diminta guru
- stimulus: string | null — teks konteks/bacaan/data (wajib jika stimulusKind=text atau image; null jika none)
- imagePrompt: string | null — prompt bahasa Inggris untuk ilustrasi (wajib jika stimulusKind=image; null selain itu)
- tpCodes: string[] bila diketahui
- kompleksitas: "L1-Pemahaman" | "L2-Aplikasi" | "L3-Penalaran"`,

  rules: `Aturan wajib:
1. Jangan opsi "semua benar" / "tidak ada yang benar" / "semua salah".
2. Soal tidak ambigu; satu interpretasi jelas.
3. Opsi pengecoh masuk akal (bukan konyol).
3b. Pilihan ganda kompleks (type "multiple"): WAJIB tepat 4 opsi dan TEPAT 2 jawaban benar (correctAnswers berisi tepat 2 indeks berbeda). Dua opsi lainnya harus salah. Dilarang menandai 3 atau 4 opsi sebagai benar.
4. Hormati field stimulusKind per soal. Jika none: stimulus & imagePrompt HARUS null. Jika text: stimulus wajib, imagePrompt null. Jika image: imagePrompt + stimulus (keterangan netral) wajib.
5. Jika stimulusKind text/image: pertanyaan HARUS bergantung pada stimulus (tidak bisa dijawab tanpa membacanya/melihatnya).
6. Stimulus teks: 2–6 kalimat atau data singkat (tabel ASCII sederhana boleh).
7. Stimulus gambar — WAJIB netral terhadap kunci jawaban:
   - imagePrompt (English): ilustrasi sederhana, ramah anak, SEBAIKNYA tanpa teks/angka/label yang langsung menunjuk jawaban.
   - JANGAN menggambar kunci jawaban secara eksplisit (contoh: jangan lingkari opsi benar, jangan tulis "jawaban: 3", jangan hanya menampilkan angka/hasil akhir yang sama dengan kunci).
   - Gambar harus memberi DATA atau KONTEKS untuk dianalisis (diagram, benda dihitung, situasi, peta sederhana, grafik kasar) sehingga siswa menafsirkan sendiri.
   - Field stimulus (Indonesia): keterangan netral 1–3 kalimat (apa yang terlihat), TANPA menyimpulkan jawaban soal.
   - Pertanyaan mengarahkan siswa mengolah informasi dari gambar; opsi pengecoh masuk akal dari interpretasi yang salah.
8. Sesuaikan kompleksitas:
   - L1-Pemahaman: mengingat/mengidentifikasi fakta dari stimulus atau konsep dasar
   - L2-Aplikasi: memakai konsep pada situasi baru
   - L3-Penalaran: menganalisis, membandingkan, menyimpulkan dari data/stimulus
9. Usia SD kelas 5: hindari istilah kuliah; angka dan konteks sehari-hari.`,
} as const

function buildSystemPrompt(): string {
  const g = AI_QUESTION_GUIDANCE
  return [g.role, g.outputFormat, g.rules].join('\n\n')
}

function buildUserPrompt(opts: GenerateAiOptions): string {
  const types = opts.types.length ? opts.types.join(', ') : 'single'
  const tps = opts.tpCodes?.length ? opts.tpCodes.join(', ') : '(sesuaikan dengan materi)'
  const plan = resolveStimulusPlan(
    opts.count,
    opts.stimulusModes,
    opts.stimulusMode,
    opts.stimulusCounts
  )
  const komp = opts.kompleksitas || 'campuran'

  const parts: string[] = []
  if (plan.none > 0) {
    parts.push(
      `${plan.none} soal TANPA stimulus (stimulusKind="none"; stimulus=null; imagePrompt=null; soal mandiri)`
    )
  }
  if (plan.text > 0) {
    parts.push(
      `${plan.text} soal STIMULUS TEKS (stimulusKind="text"; isi stimulus bacaan/data/situasi 2–6 kalimat; imagePrompt=null; pertanyaan bergantung stimulus)`
    )
  }
  if (plan.image > 0) {
    parts.push(
      `${plan.image} soal STIMULUS GAMBAR (stimulusKind="image"; imagePrompt English netral tanpa teks jawaban; stimulus Indonesia 1–3 kalimat keterangan netral; pertanyaan memaksa interpretasi gambar)`
    )
  }
  const stimulusInstr =
    `Stimulus — bagikan TEPAT sesuai kuota berikut (total ${opts.count} soal):\n- ` +
    parts.join('\n- ') +
    `\nTandai setiap soal dengan stimulusKind yang sesuai. Jangan menukar kuota. Campur urutan (jangan semua none dulu lalu semua image).`

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
    while (options.length < 4) options.push(`Opsi ${String.fromCharCode(65 + options.length)}`)
    if (options.length > 4) options = options.slice(0, 4)
    correctAnswers = [...new Set(correctAnswers.filter((n) => n >= 0 && n < options.length))]
    if (correctAnswers.length > 2) {
      correctAnswers = correctAnswers.slice(0, 2)
    }
    if (correctAnswers.length === 0) {
      correctAnswers = [0, 1]
    } else if (correctAnswers.length === 1) {
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
  const plan = resolveStimulusPlan(count, opts.stimulusModes, opts.stimulusMode, opts.stimulusCounts)

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

  drafts = enforceStimulusPlan(drafts, plan)

  const needImages = plan.image > 0
  if (needImages && opts.generateImages !== false) {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      if (!(d.imagePrompt || '').trim() && !(d.stimulusImage || '').trim()) continue
      let p = (d.imagePrompt || '').trim()
      if (!p && d.stimulus) {
        p = `Educational scene for elementary school: ${d.stimulus}`
        drafts[i] = { ...d, imagePrompt: p }
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
  } else if (needImages && opts.generateImages === false) {
    imageWarnings.push(
      'Generate gambar dimatikan. Soal mode gambar hanya punya keterangan/prompt; unggah gambar manual nanti.'
    )
  }

  return { drafts, imageWarnings }
}

/** Rapikan draft agar sesuai kuota none/text/image. */
function enforceStimulusPlan(drafts: AiDraftQuestion[], plan: StimulusPlan): AiDraftQuestion[] {
  const kinds: StimulusMode[] = []
  for (let i = 0; i < plan.none; i++) kinds.push('none')
  for (let i = 0; i < plan.text; i++) kinds.push('text')
  for (let i = 0; i < plan.image; i++) kinds.push('image')
  while (kinds.length > drafts.length) kinds.pop()
  while (kinds.length < drafts.length) kinds.push('none')

  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
  }

  return drafts.map((d, i) => {
    const kind = kinds[i]
    if (kind === 'none') {
      return { ...d, stimulus: undefined, imagePrompt: undefined, stimulusImage: undefined }
    }
    if (kind === 'text') {
      const stim =
        (d.stimulus || '').trim() ||
        'Bacalah informasi berikut dengan saksama sebelum menjawab.'
      return { ...d, stimulus: stim, imagePrompt: undefined, stimulusImage: undefined }
    }
    let prompt = (d.imagePrompt || '').trim()
    let stim = (d.stimulus || '').trim()
    if (!prompt && stim) {
      prompt = `Educational scene for elementary school: ${stim}`
    }
    if (!stim) {
      stim = 'Perhatikan ilustrasi pada soal, lalu jawab pertanyaan berikut.'
    }
    return { ...d, stimulus: stim, imagePrompt: prompt || undefined }
  })
}

export type {
  StimulusImageInput,
  StimulusImageResult,
  RewriteOptionsInput,
  RewriteOptionsResult,
  OptionVerification,
  ImproveStimulusInput,
  ImproveStimulusResult,
} from './openaiQuestionEditor'
export {
  generateStimulusImage,
  rewriteOptionsWithAI,
  improveStimulusWithAI,
} from './openaiQuestionEditor'
