/**
 * AI helpers for question editor.
 */
import type { QuestionType } from '../types/question'
import { compressImageSrc } from './imageCompress'

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
}

export type ImproveStimulusResult = {
  stimulusHtml: string
  changed: boolean
  note: string
  warnings: string[]
  verification: OptionVerification
}

export async function rewriteOptionsWithAI(
  _input: RewriteOptionsInput
): Promise<RewriteOptionsResult> {
  throw new Error(
    'rewriteOptionsWithAI sementara dipulihkan parsial — fitur generate multi-stimulus sudah aktif; tombol seimbangkan opsi akan dipulihkan penuh segera.'
  )
}

export async function improveStimulusWithAI(
  _input: ImproveStimulusInput
): Promise<ImproveStimulusResult> {
  throw new Error(
    'improveStimulusWithAI sementara dipulihkan parsial — fitur generate multi-stimulus sudah aktif; tombol perbaiki stimulus akan dipulihkan penuh segera.'
  )
}
