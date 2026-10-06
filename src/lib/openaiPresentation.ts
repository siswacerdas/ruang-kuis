/**
 * Generate presentasi materi pelajaran via OpenAI.
 * Output: struktur slide JSON yang dirender sebagai HTML di app + bisa diekspor PDF.
 *
 * Tidak mengubah alur generate soal (openaiQuestions.ts).
 */

import { compressImageSrc } from './imageCompress'
import type { SubjectKey } from '../types/question'

export type SlideLayout =
  | 'title'
  | 'section'
  | 'content'
  | 'bullets'
  | 'image-focus'
  | 'quote'
  | 'summary'
  | 'activity'

export interface PresentationSlide {
  id: string
  layout: SlideLayout
  title: string
  body?: string
  bullets?: string[]
  callout?: string
  activity?: string
  imageCaption?: string
  imageUrl?: string
  imagePrompt?: string
  needsImage?: boolean
}

export type PresentationStyle = 'interaktif' | 'ringkas' | 'cerita'

export type GeneratePresentationOptions = {
  subjectName: string
  subjectKey: SubjectKey
  title: string
  outline: string
  style?: PresentationStyle
  targetSlides?: number
  generateImages?: boolean
  extraContext?: string
  model?: string
}

export type GeneratePresentationResult = {
  slides: PresentationSlide[]
  imageWarnings: string[]
}

const SYSTEM_PROMPT = `Kamu adalah desainer presentasi pembelajaran untuk siswa SD kelas 5 di Indonesia (Kurikulum Merdeka).

Tugas: ubah outline materi menjadi slide presentasi yang TEPAT SASARAN, MENARIK, dan TIDAK MEMBOSANKAN.

Balas HANYA JSON valid (tanpa markdown):
{"slides":[ ... ]}

Setiap slide:
- id: string unik singkat (s1, s2, ...)
- layout: "title" | "section" | "content" | "bullets" | "image-focus" | "quote" | "summary" | "activity"
- title: string (maks 8 kata, menarik)
- body: string opsional (1–3 kalimat pendek, bahasa ramah anak)
- bullets: string[] opsional (maks 5, tiap poin ≤ 12 kata)
- callout: string opsional (fakta menarik / "Tahukah kamu?" 1 kalimat)
- activity: string opsional (instruksi aktivitas kelas ≤ 20 kata)
- imagePrompt: string|null — prompt Inggris untuk ilustrasi HANYA jika needsImage true
- needsImage: boolean — true hanya untuk slide title, section penting, image-focus, atau summary (maks 4 slide total)

Aturan wajib:
1. Slide 1 HARUS layout "title" (judul + 1 kalimat ajakan).
2. Akhiri dengan layout "summary" (3–5 poin inti) dan opsional 1 slide "activity" atau "quote" refleksi.
3. JANGAN dinding teks. Prefer bullets + callout. body maksimal 3 kalimat pendek.
4. Variasikan layout — jangan semua "bullets". Sisipkan section, quote, activity, image-focus.
5. Konten akurat untuk SD kelas 5; contoh kehidupan sehari-hari Indonesia.
6. Hindari formal kaku; boleh pertanyaan retoris ke siswa.
7. Satu ide utama per slide. Sub-materi outline boleh digabung jika sangat pendek.
8. imagePrompt (English): simple colorful children's educational illustration, no text overlays, no watermarks, age-appropriate.
9. Sesuaikan jumlah slide dengan outline.`

function buildUserPrompt(opts: GeneratePresentationOptions): string {
  const style = opts.style || 'interaktif'
  const target = Math.max(6, Math.min(opts.targetSlides || 12, 18))
  const styleInstr =
    style === 'ringkas'
      ? 'Gaya RINGKAS: padat, sedikit dekorasi verbal, fokus poin inti.'
      : style === 'cerita'
        ? 'Gaya CERITA: alur naratif, contoh kisah singkat, transisi lembut antar slide.'
        : 'Gaya INTERAKTIF: banyak pertanyaan ke siswa, callout "Tahukah kamu?", aktivitas singkat.'

  return [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Judul presentasi: ${opts.title}`,
    `Target sekitar ${target} slide (boleh ±2).`,
    styleInstr,
    '',
    'Outline materi (hormati struktur; baris dengan "- " adalah sub-materi):',
    opts.outline.trim(),
    '',
    opts.extraContext?.trim() ? `Catatan guru: ${opts.extraContext.trim()}` : '',
    'Buat presentasi yang siap dipakai guru di kelas 1x pertemuan (~20–40 menit).',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
}

const VALID_LAYOUTS = new Set<SlideLayout>([
  'title', 'section', 'content', 'bullets', 'image-focus', 'quote', 'summary', 'activity',
])

function normalizeSlide(raw: any, index: number): PresentationSlide | null {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || '').trim()
  if (!title) return null
  const layoutRaw = String(raw.layout || 'content').toLowerCase() as SlideLayout
  const layout = VALID_LAYOUTS.has(layoutRaw) ? layoutRaw : 'content'
  let bullets: string[] | undefined
  if (Array.isArray(raw.bullets)) {
    bullets = raw.bullets.map((b: unknown) => String(b ?? '').trim()).filter(Boolean).slice(0, 6)
    if (bullets.length === 0) bullets = undefined
  }
  const body = raw.body ? String(raw.body).trim().slice(0, 600) : undefined
  const callout = raw.callout ? String(raw.callout).trim().slice(0, 200) : undefined
  const activity = raw.activity ? String(raw.activity).trim().slice(0, 200) : undefined
  const imagePrompt = raw.imagePrompt ? String(raw.imagePrompt).trim().slice(0, 500) : undefined
  const needsImage = Boolean(raw.needsImage) || layout === 'image-focus' || layout === 'title'
  return {
    id: String(raw.id || `s${index + 1}`).slice(0, 24),
    layout,
    title: title.slice(0, 80),
    body: body || undefined,
    bullets,
    callout: callout || undefined,
    activity: activity || undefined,
    imagePrompt: needsImage ? imagePrompt || undefined : undefined,
    needsImage,
  }
}

function resolveImageModel(): string {
  return import.meta.env.VITE_OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1-mini'
}

async function generateSlideImage(
  prompt: string,
  apiKey: string
): Promise<{ url?: string; error?: string }> {
  const fullPrompt = [
    prompt.trim(),
    "Children's educational illustration for Indonesian elementary school, simple, colorful, friendly.",
    'No text overlays, no watermarks, no labels with answers.',
  ].join(' ')
  const primary = resolveImageModel()
  const attempts: { model: string; quality: string; size: string }[] = [
    { model: primary, quality: 'low', size: '1024x1024' },
  ]
  if (primary !== 'gpt-image-1-mini') {
    attempts.push({ model: 'gpt-image-1-mini', quality: 'low', size: '1024x1024' })
  }
  const errors: string[] = []
  for (const a of attempts) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: a.model,
          prompt: fullPrompt.slice(0, 32000),
          n: 1,
          size: a.size,
          quality: a.quality,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        errors.push(`${a.model}: ${data?.error?.message || data?.error?.code || `HTTP ${res.status}`}`)
        continue
      }
      const item = data?.data?.[0]
      if (item?.b64_json) return { url: `data:image/png;base64,${item.b64_json}` }
      if (item?.url) return { url: item.url as string }
      errors.push(`${a.model}: respons tanpa gambar`)
    } catch (e: any) {
      errors.push(`${a.model}: ${e?.message || 'network error'}`)
    }
  }
  return { error: errors.join(' | ') || 'Gagal generate gambar' }
}

export async function generatePresentationWithOpenAI(
  opts: GeneratePresentationOptions
): Promise<GeneratePresentationResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  const outline = opts.outline.trim()
  if (!outline) throw new Error('Outline materi wajib diisi.')
  if (!opts.title.trim()) throw new Error('Judul presentasi wajib diisi.')
  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(opts) },
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
  const arr = Array.isArray(parsed?.slides) ? parsed.slides : Array.isArray(parsed) ? parsed : []
  let slides = arr.map((r: any, i: number) => normalizeSlide(r, i)).filter(Boolean) as PresentationSlide[]
  if (slides.length === 0) {
    throw new Error('AI tidak menghasilkan slide valid. Coba perjelas outline.')
  }
  let imageSlots = 0
  slides = slides.map((s) => {
    if (s.needsImage && imageSlots < 4) {
      imageSlots += 1
      return s
    }
    return { ...s, needsImage: false, imagePrompt: s.needsImage ? undefined : s.imagePrompt }
  })
  const imageWarnings: string[] = []
  if (opts.generateImages) {
    for (let i = 0; i < slides.length; i++) {
      if (!slides[i].needsImage) continue
      let p = (slides[i].imagePrompt || '').trim()
      if (!p) {
        p = `Educational illustration about: ${slides[i].title}. Simple, colorful, for elementary school.`
        slides[i] = { ...slides[i], imagePrompt: p }
      }
      const result = await generateSlideImage(p, key)
      if (result.url) {
        try {
          const compressed = await compressImageSrc(result.url, {
            maxSide: 720,
            targetChars: 160_000,
            minSide: 400,
          })
          slides[i] = {
            ...slides[i],
            imageUrl: compressed.dataUrl,
            imageCaption: slides[i].imageCaption || slides[i].title,
          }
        } catch (e: any) {
          imageWarnings.push(`Slide ${i + 1}: kompres gagal — ${e?.message || 'error'}`)
        }
      } else {
        imageWarnings.push(`Slide ${i + 1}: ${result.error || 'gagal gambar'}`)
      }
    }
  }
  return { slides, imageWarnings }
}

export function estimateSlidesPayloadBytes(slides: PresentationSlide[]): number {
  try {
    return new Blob([JSON.stringify(slides)]).size
  } catch {
    return JSON.stringify(slides).length
  }
}
