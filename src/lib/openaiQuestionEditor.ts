/**
 * AI helpers for question editor.
 */
import type { QuestionType } from '../types/question'
import { compressImageSrc } from './imageCompress'
import { analyzeOptionLength } from './optionPattern'

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

export type StimulusImageInput = {
  subjectName: string
  topicName: string
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  stimulusHtml?: string
  hint?: string
}

export type StimulusImageResult = {
  dataUrl: string
  width: number
  height: number
  bytesApprox: number
  imagePrompt: string
}

function htmlToPlainText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

const IMAGE_FOR_QUESTION_GUIDANCE = `Kamu membantu guru SD kelas 5 membuat GAMBAR PENDUKUNG untuk satu soal yang sudah jadi.
Tugasmu: tulis satu prompt gambar (bahasa Inggris, 1–3 kalimat) agar gambar memuat informasi visual yang DIBUTUHKAN siswa untuk menjawab soal.
Balas HANYA JSON valid: {"imagePrompt":"..."}

Aturan:
1. Gambar harus konsisten dengan soal dan kunci jawaban, tetapi JANGAN membocorkan kunci.
2. Tampilkan DATA atau KONTEKS yang harus ditafsirkan siswa.
3. Hindari teks, angka, dan label di dalam gambar.
4. Gaya: ilustrasi sederhana, warna cerah, latar putih/polos, aman untuk anak.
5. Jika ada arahan guru, ikuti selama tidak membocorkan jawaban.`

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

  let imagePrompt = ''
  try {
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: IMAGE_FOR_QUESTION_GUIDANCE },
          { role: 'user', content: buildImagePromptRequest(input) },
        ],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string') {
        imagePrompt = String(JSON.parse(content)?.imagePrompt || '').trim()
      }
    }
  } catch (e: any) {
    if (/401|429/.test(String(e?.message))) throw e
  }
  if (!imagePrompt) {
    imagePrompt = `Simple educational illustration for an elementary school question: ${input.question.trim()}`
  }
  if (input.hint?.trim() && !imagePrompt.toLowerCase().includes(input.hint.trim().toLowerCase())) {
    imagePrompt = `${imagePrompt} Teacher note: ${input.hint.trim()}`
  }

  const img = await generateOpenAiImage(imagePrompt, key)
  if (!img.url) throw new Error(img.error || 'Gagal membuat gambar')

  const small = await compressImageSrc(img.url, { maxSide: 800, targetChars: 200_000 })
  return { ...small, imagePrompt }
}

export type RewriteOptionsInput = {
  subjectName: string
  topicName: string
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  stimulusHtml?: string
  explanation?: string
  hint?: string
  /** Soal punya gambar stimulus (verifikasi AI dilewati karena model tidak melihat gambar) */
  hasImage?: boolean
}

export type OptionVerification = {
  status: 'ok' | 'mismatch' | 'skipped' | 'error'
  message: string
  aiAnswers?: number[]
}

export type RewriteOptionsResult = {
  options: string[]
  /** Indeks opsi yang teksnya berubah */
  changed: number[]
  note: string
  verification: OptionVerification
}

export type ImproveStimulusInput = {
  subjectName: string
  topicName: string
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  stimulusHtml: string
  explanation?: string
  hint?: string
  /** Soal punya gambar stimulus (verifikasi AI dilewati karena model tidak melihat gambar) */
  hasImage?: boolean
}

export type ImproveStimulusResult = {
  stimulusHtml: string
  changed: boolean
  note: string
  warnings: string[]
  verification: OptionVerification
}

/* ============================================================================
 * Seimbangkan pilihan jawaban & perbaiki stimulus (AI)
 * =========================================================================== */

const OPTION_LETTERS = 'ABCDEFGH'
/** Awalan "A." / "B)" / "1." yang kadang ditambahkan model. */
const OPTION_PREFIX_RE = /^\s*(?:[A-Ha-h][.)]|\d+[.)])\s+/

const REWRITE_OPTIONS_GUIDANCE = `Kamu membantu guru SD kelas 5 (Kurikulum Merdeka) memperbaiki PILIHAN JAWABAN sebuah soal.
Tugas: tulis ulang teks tiap pilihan agar panjang, tingkat detail, dan gaya bahasanya SEIMBANG, sehingga siswa tidak bisa menebak jawaban dari bentuk teksnya (misalnya jawaban benar selalu paling panjang atau paling lengkap).
Balas HANYA JSON valid: {"options":["..."],"note":"..."}

Aturan:
1. Jumlah dan URUTAN pilihan sama persis dengan masukan. Jangan menukar posisi, menambah, atau menghapus pilihan.
2. Status benar/salah tiap pilihan TIDAK BOLEH berubah. Pilihan benar tetap benar, pengecoh tetap salah, dan makna intinya tetap.
3. Seimbangkan panjang: selisih panjang antar pilihan kira-kira tidak lebih dari 25%. Ringkas pilihan yang bertele-tele, atau tambahkan detail netral pada pilihan yang terlalu singkat (terutama pengecoh). Jawaban benar tidak boleh menjadi yang terpanjang.
4. Pengecoh harus masuk akal dan sama spesifiknya dengan jawaban benar (berasal dari miskonsepsi umum), bukan konyol.
5. Jangan menambahkan petunjuk tersembunyi: kata mutlak ("selalu", "tidak pernah") hanya pada pengecoh, atau pengulangan kata pertanyaan hanya pada jawaban benar. Jangan memakai "semua benar" / "tidak ada yang benar".
6. Tanpa awalan huruf atau nomor ("A.", "1)") dan tanpa tanda kutip tambahan.
7. Pilihan yang sudah baik dan seimbang boleh dibiarkan persis sama. Angka, satuan, nama, dan istilah baku jangan diubah.
8. Untuk tipe pernyataan (kategori): seimbangkan panjang antara pernyataan berlabel pertama dan berlabel kedua. Tiap pernyataan harus tetap berdiri sendiri dan labelnya tidak berubah.
9. Bahasa Indonesia baku yang ramah siswa SD kelas 5. Ikuti arahan guru selama tidak melanggar aturan di atas.
10. "note": satu kalimat singkat (Indonesia) tentang apa yang disesuaikan.`

const IMPROVE_STIMULUS_GUIDANCE = `Kamu membantu guru SD kelas 5 (Kurikulum Merdeka) memperbaiki STIMULUS TEKS sebuah soal agar jelas dan pas dengan pertanyaan serta pilihan jawabannya.
Balas HANYA JSON valid: {"stimulusHtml":"...","note":"...","warnings":["..."]}

Aturan:
1. Hanya stimulus yang boleh berubah. Pertanyaan, pilihan, dan kunci jawaban TIDAK diubah.
2. Stimulus harus memuat informasi yang DIBUTUHKAN untuk menjawab, jelas, runtut, dan ringkas (sekitar 2–6 kalimat atau data singkat). Hapus informasi yang tidak relevan.
3. Jangan membocorkan jawaban: jangan menulis kunci jawaban atau menyimpulkan jawabannya secara eksplisit.
4. Fakta, angka, dan nama harus akurat dan konsisten dengan pertanyaan dan kunci. Jangan mengarang data yang bertentangan dengan kunci.
5. Pertahankan format HTML guru. Tag yang boleh: p, br, b, strong, i, em, u, ul, ol, li, sub, sup, blockquote. Elemen <span class="math-tex" data-latex="..."> pertahankan apa adanya.
6. Bahasa Indonesia baku yang ramah siswa SD kelas 5. Ikuti arahan guru selama tidak membocorkan jawaban.
7. Jika stimulus sudah baik, kembalikan persis sama.
8. "note": satu kalimat singkat tentang apa yang diperbaiki.
9. "warnings": daftar singkat masalah yang tidak bisa diperbaiki otomatis (misalnya kunci tampak keliru atau pertanyaan ambigu). Kosongkan jika tidak ada.`

type QuestionView = {
  type: QuestionType
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  stimulusText?: string
  explanation?: string
}

function requireOpenAiKey(): string {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  return key
}

async function chatJson(
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
    if (res.status === 401) throw new Error('API key OpenAI tidak valid (401).')
    if (res.status === 429) throw new Error('Batas kuota/rate OpenAI (429). Coba lagi nanti.')
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Respons OpenAI kosong.')
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Respons OpenAI bukan JSON valid.')
  }
}

function categoryLabelsOf(v: { categoryLabels?: string[] }): string[] {
  return v.categoryLabels && v.categoryLabels.length >= 2 ? v.categoryLabels : ['Benar', 'Salah']
}

function describeQuestion(v: QuestionView, withKey: boolean): string {
  const lines: string[] = []
  if (v.stimulusText) lines.push(`Stimulus: ${v.stimulusText}`)
  lines.push(`Pertanyaan: ${v.question.trim()}`)
  if (v.type === 'category') {
    const labels = categoryLabelsOf(v)
    lines.push(`Label kategori: ${labels[0]} / ${labels[1]}`)
    lines.push('Pernyataan:')
    v.options.forEach((o, i) => {
      const label = labels[v.correctAnswers[i] === 1 ? 1 : 0]
      lines.push(`${i + 1}. ${o.trim()}${withKey ? `  → ${label}` : ''}`)
    })
  } else {
    lines.push(
      v.type === 'multiple'
        ? 'Tipe: pilihan ganda kompleks (lebih dari satu jawaban benar)'
        : 'Tipe: pilihan ganda (satu jawaban benar)'
    )
    lines.push('Pilihan:')
    v.options.forEach((o, i) => {
      const mark = withKey && v.correctAnswers.includes(i) ? '  [BENAR]' : ''
      lines.push(`${OPTION_LETTERS[i] || i + 1}. ${o.trim()}${mark}`)
    })
  }
  if (v.explanation?.trim()) lines.push(`Pembahasan guru: ${v.explanation.trim()}`)
  return lines.join('\n')
}

function formatAnswers(v: QuestionView, answers: number[]): string {
  if (v.type === 'category') {
    const labels = categoryLabelsOf(v)
    return answers.map((a, i) => `${i + 1}=${labels[a === 1 ? 1 : 0]}`).join(', ')
  }
  return (
    [...new Set(answers)]
      .sort((a, b) => a - b)
      .map((i) => OPTION_LETTERS[i] || String(i + 1))
      .join(', ') || '(kosong)'
  )
}

/**
 * Uji balik: AI diminta menjawab soal TANPA melihat kunci, lalu dibandingkan
 * dengan kunci guru. Dilewati jika soal punya gambar (model tidak melihat gambar).
 */
async function verifyKey(
  key: string,
  v: QuestionView,
  hasImage?: boolean
): Promise<OptionVerification> {
  if (hasImage) {
    return {
      status: 'skipped',
      message:
        'Verifikasi AI dilewati karena soal ini punya gambar (AI tidak bisa melihat gambar). Periksa kunci secara manual.',
    }
  }
  const labels = categoryLabelsOf(v)
  const format =
    v.type === 'category'
      ? `"answers" berisi satu angka per pernyataan, berurutan: 0 = ${labels[0]}, 1 = ${labels[1]}.`
      : v.type === 'multiple'
        ? '"answers" berisi SEMUA indeks pilihan yang benar (0-based: A=0, B=1, dst.).'
        : '"answers" berisi TEPAT satu indeks pilihan yang benar (0-based: A=0, B=1, dst.).'
  const system = `Kamu adalah siswa SD kelas 5 yang cermat. Jawablah soal hanya dari informasi yang tersedia. Balas HANYA JSON valid: {"answers":[...]}. ${format}`

  try {
    const data = await chatJson(
      key,
      system,
      describeQuestion({ ...v, explanation: undefined }, false),
      0
    )
    const max = v.type === 'category' ? 2 : v.options.length
    const ai: number[] = (Array.isArray(data?.answers) ? data.answers : [])
      .map((n: unknown) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < max)

    const expected =
      v.type === 'category'
        ? v.options.map((_, i) => (v.correctAnswers[i] === 1 ? 1 : 0))
        : [...v.correctAnswers].sort((a, b) => a - b)
    const got = v.type === 'category' ? ai : [...new Set(ai)].sort((a, b) => a - b)
    const same = expected.length === got.length && expected.every((n, i) => n === got[i])

    if (same) {
      return {
        status: 'ok',
        message: 'Uji balik: AI menjawab soal ini tanpa melihat kunci dan hasilnya sama dengan kunci Anda.',
        aiAnswers: got,
      }
    }
    return {
      status: 'mismatch',
      message: `Perhatian: saat diuji tanpa kunci, AI menjawab ${formatAnswers(v, got)}, sedangkan kunci Anda ${formatAnswers(v, expected)}. Periksa apakah soal ambigu atau pilihan berubah makna.`,
      aiAnswers: got,
    }
  } catch (e: any) {
    return {
      status: 'error',
      message: `Uji balik AI gagal dijalankan (${e?.message || 'error'}). Periksa pilihan secara manual.`,
    }
  }
}

export async function rewriteOptionsWithAI(
  input: RewriteOptionsInput
): Promise<RewriteOptionsResult> {
  const key = requireOpenAiKey()
  if (!input.question.trim()) {
    throw new Error('Isi pertanyaan terlebih dahulu.')
  }
  const original = input.options.map((o) => String(o ?? '').trim())
  if (original.length < 2 || original.some((o) => !o)) {
    throw new Error('Semua pilihan harus terisi sebelum ditulis ulang.')
  }
  const labels = categoryLabelsOf(input)
  const stimulusText = htmlToPlainText(input.stimulusHtml || '')
  const view: QuestionView = {
    type: input.type,
    question: input.question,
    options: original,
    correctAnswers: input.correctAnswers,
    categoryLabels: labels,
    stimulusText: stimulusText || undefined,
    explanation: input.explanation,
  }

  const baseUser = [
    describeQuestion(view, true),
    input.hint?.trim() ? `Arahan guru: ${input.hint.trim()}` : '',
    input.hasImage
      ? 'Catatan: soal ini punya gambar pendukung yang tidak kamu lihat. Jangan mengubah fakta yang mungkin bergantung pada gambar.'
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const attempt = async (extra?: string) => {
    const data = await chatJson(
      key,
      REWRITE_OPTIONS_GUIDANCE,
      extra ? `${baseUser}\n\n${extra}` : baseUser,
      0.5
    )
    const arr = Array.isArray(data?.options) ? data.options : null
    if (!arr || arr.length !== original.length) {
      throw new Error('AI mengembalikan jumlah pilihan yang tidak sesuai. Coba lagi.')
    }
    const options: string[] = arr.map((o: unknown, i: number) => {
      let t = String(o ?? '').trim()
      if (!OPTION_PREFIX_RE.test(original[i])) t = t.replace(OPTION_PREFIX_RE, '').trim()
      return t || original[i]
    })
    return { options, note: String(data?.note || '').trim() }
  }

  let result = await attempt()
  let report = analyzeOptionLength(input.type, result.options, input.correctAnswers, labels)

  // Masih ada pola panjang? Minta satu kali lagi dengan umpan balik.
  if (report) {
    try {
      const prev = result.options
        .map((o, i) => `${input.type === 'category' ? i + 1 : OPTION_LETTERS[i]}. ${o}`)
        .join('\n')
      const retry = await attempt(
        `Percobaan sebelumnya masih bermasalah: ${report.message}\nHasil percobaan sebelumnya:\n${prev}\nSeimbangkan lebih kuat: samakan panjang dan tingkat detail semua pilihan, tanpa mengubah kunci.`
      )
      result = retry
      report = analyzeOptionLength(input.type, result.options, input.correctAnswers, labels)
    } catch {
      /* pakai hasil pertama */
    }
  }

  const changed = result.options
    .map((o, i) => (o !== original[i] ? i : -1))
    .filter((i) => i >= 0)

  if (changed.length === 0) {
    return {
      options: original,
      changed: [],
      note: report
        ? 'AI tidak menemukan perubahan yang aman. Sesuaikan panjang pilihan secara manual.'
        : result.note || 'Pilihan sudah seimbang, tidak ada yang diubah.',
      verification: {
        status: 'skipped',
        message: 'Tidak ada perubahan, jadi uji balik tidak diperlukan.',
      },
    }
  }

  let note = result.note || 'Pilihan diseimbangkan.'
  if (report) {
    note += ' Masih ada sedikit selisih panjang; jalankan sekali lagi atau rapikan manual.'
  }
  const verification = await verifyKey(
    key,
    { ...view, options: result.options },
    input.hasImage
  )
  return { options: result.options, changed, note, verification }
}

/* ---------- Perbaiki stimulus ---------- */

const STIMULUS_ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'SPAN', 'DIV', 'SUB', 'SUP', 'BLOCKQUOTE', 'UL', 'OL', 'LI',
])
const STIMULUS_KEEP_STYLES = [
  'lineHeight', 'fontWeight', 'fontStyle', 'textDecoration', 'textAlign', 'marginLeft', 'paddingLeft',
] as const

/** Sanitasi HTML stimulus (allowlist sama dengan editor). */
function sanitizeStimulusHtmlLocal(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,img,link,meta').forEach((e) => e.remove())

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      walk(el) // bersihkan anak dulu, baru putuskan nasib elemen ini
      if (!STIMULUS_ALLOWED_TAGS.has(el.tagName)) {
        while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
        el.remove()
        continue
      }
      const kept: Record<string, string> = {}
      for (const p of STIMULUS_KEEP_STYLES) {
        const v = (el.style as any)[p]
        if (v) kept[p] = v
      }
      const isMath = el.classList.contains('math-tex')
      const latex = el.getAttribute('data-latex')
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name))
      for (const [p, v] of Object.entries(kept)) (el.style as any)[p] = v
      if (isMath) {
        el.setAttribute('class', 'math-tex')
        if (latex != null) el.setAttribute('data-latex', latex)
      }
    }
  }
  walk(doc.body)
  return doc.body.innerHTML.trim()
}

const normSpace = (s: string) => s.replace(/\s+/g, ' ').trim()

export async function improveStimulusWithAI(
  input: ImproveStimulusInput
): Promise<ImproveStimulusResult> {
  const key = requireOpenAiKey()
  if (!input.question.trim()) {
    throw new Error('Isi pertanyaan terlebih dahulu.')
  }
  const options = input.options.map((o) => String(o ?? '').trim())
  if (options.length < 2 || options.some((o) => !o)) {
    throw new Error('Semua pilihan harus terisi agar AI memahami hubungan stimulus dengan jawaban.')
  }
  const originalHtml = sanitizeStimulusHtmlLocal(input.stimulusHtml || '')
  if (!htmlToPlainText(originalHtml)) {
    throw new Error('Stimulus masih kosong. Tulis stimulus dulu, lalu minta AI memperbaikinya.')
  }

  const labels = categoryLabelsOf(input)
  const view: QuestionView = {
    type: input.type,
    question: input.question,
    options,
    correctAnswers: input.correctAnswers,
    categoryLabels: labels,
    explanation: input.explanation,
  }

  const user = [
    describeQuestion(view, true),
    `Stimulus saat ini (HTML):\n${originalHtml}`,
    input.hint?.trim() ? `Arahan guru: ${input.hint.trim()}` : '',
    input.hasImage
      ? 'Catatan: soal ini juga punya gambar pendukung yang tidak kamu lihat. Jangan menghapus rujukan ke gambar.'
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const data = await chatJson(key, IMPROVE_STIMULUS_GUIDANCE, user, 0.4)
  const newHtml = sanitizeStimulusHtmlLocal(
    typeof data?.stimulusHtml === 'string' ? data.stimulusHtml : ''
  )
  if (!htmlToPlainText(newHtml)) {
    throw new Error('AI mengembalikan stimulus kosong. Stimulus semula dipertahankan; coba lagi.')
  }

  const warnings: string[] = (Array.isArray(data?.warnings) ? data.warnings : [])
    .map((w: unknown) => String(w ?? '').trim())
    .filter(Boolean)
    .slice(0, 3)
  const modelNote = String(data?.note || '').trim()
  const changed = normSpace(newHtml) !== normSpace(originalHtml)

  if (!changed) {
    return {
      stimulusHtml: input.stimulusHtml,
      changed: false,
      note: modelNote || 'Stimulus sudah baik, tidak ada yang diubah.',
      warnings,
      verification: {
        status: 'skipped',
        message: 'Tidak ada perubahan, jadi uji balik tidak diperlukan.',
      },
    }
  }

  // Pemeriksaan lokal: apakah teks jawaban benar muncul utuh di stimulus?
  const plainNew = normSpace(htmlToPlainText(newHtml)).toLowerCase()
  if (input.type !== 'category') {
    for (const i of input.correctAnswers) {
      const t = normSpace(options[i] || '').toLowerCase()
      if (t.length >= 8 && plainNew.includes(t)) {
        warnings.push(
          `Stimulus memuat teks pilihan ${OPTION_LETTERS[i] || i + 1} yang merupakan kunci jawaban. Periksa apakah ini membocorkan jawaban.`
        )
      }
    }
  }

  const verification = await verifyKey(
    key,
    { ...view, stimulusText: htmlToPlainText(newHtml) },
    input.hasImage
  )
  return {
    stimulusHtml: newHtml,
    changed: true,
    note: modelNote || 'Stimulus dirapikan.',
    warnings,
    verification,
  }
}
