/**
 * Generate presentasi materi pelajaran via OpenAI.
 * Target kualitas: mendekati presentasi pengayaan IPAS (padat, terstruktur, multi-kartu, contoh konkret).
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
  | 'cards'
  | 'compare'
  | 'image-focus'
  | 'quote'
  | 'summary'
  | 'activity'
  | 'assessment'

export interface SlideCard {
  title: string
  body?: string
  bullets?: string[]
  badge?: string
}

export interface PresentationSlide {
  id: string
  layout: SlideLayout
  title: string
  /** Definisi / pengantar (boleh 2–5 kalimat) */
  body?: string
  /** Poin utama — boleh 4–8 poin, tiap poin cukup informatif */
  bullets?: string[]
  /** Kartu multi-kolom (individu/populasi, jenis ekosistem, dll.) */
  cards?: SlideCard[]
  /** Contoh konkret (makhluk hidup, situasi) */
  examples?: string[]
  /** Alur langkah berurutan */
  flow?: string[]
  /** Fakta menarik / "Tahukah kamu?" */
  callout?: string
  /** Instruksi aktivitas kelas */
  activity?: string
  /** Kalimat penutup slide (pesan kunci di footer) */
  footer?: string
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

const SYSTEM_PROMPT = `Kamu adalah desainer presentasi pembelajaran IPAS/mapel SD kelas 5 Indonesia (Kurikulum Merdeka).
Target kualitas: presentasi pengayaan yang PADAT, TERSTRUKTUR, dan MENARIK — BUKAN slide kosong 1–3 kalimat.

## STANDAR KUALITAS (wajib)
Setiap slide konten HARUS terasa "penuh" seperti infografis buku ajar:
- Ada definisi/pengantar singkat (body 2–4 kalimat, bahasa ramah anak SD).
- Ada struktur jelas: nomor, kartu, daftar, atau alur.
- Ada CONTOH konkret (nama makhluk hidup, tempat, situasi sehari-hari Indonesia bila relevan).
- Ada 1 kalimat footer/pesan kunci di akhir slide bila cocok.
- JANGAN slide yang hanya judul + 1 kalimat. Itu dianggap GAGAL.

## Format output
Balas HANYA JSON valid (tanpa markdown):
{"slides":[ ... ]}

Setiap slide:
- id: string unik (s1, s2, ...)
- layout: "title" | "section" | "content" | "bullets" | "cards" | "compare" | "image-focus" | "quote" | "summary" | "activity" | "assessment"
- title: string menarik (maks ~10 kata)
- body: string opsional — definisi/pengantar 2–4 kalimat (boleh sampai ~120 kata)
- bullets: string[] — 4–8 poin INFORMAL; tiap poin boleh 8–20 kata (bukan fragmen 3 kata)
- cards: [{title, body?, bullets?, badge?}] — 2–4 kartu sejajar (untuk membandingkan konsep, jenis, contoh)
- examples: string[] — 2–6 contoh konkret
- flow: string[] — 3–6 langkah berurutan (Individu→Populasi→Komunitas, dll.)
- callout: string — 1 kalimat fakta menarik / "Tahukah kamu?"
- activity: string — instruksi aktivitas (untuk layout activity)
- footer: string — 1 kalimat penutup slide (pesan kunci)
- imagePrompt: string|null — prompt Inggris ilustrasi HANYA jika needsImage true
- needsImage: boolean — true maks 4 slide (title, section penting, image-focus)

## Struktur presentasi wajib
1. Slide 1: layout "title" — judul + 1–2 kalimat ajakan + callout singkat.
2. Slide 2: layout "section" atau "bullets" — tujuan pembelajaran (5–7 tujuan konkret).
3. Isi materi: gunakan "cards" / "compare" / "content" / "bullets" bergantian.
   - Konsep hierarki → cards atau flow
   - Jenis/perbandingan → cards atau compare (2 kolom via cards)
   - Ciri + contoh → cards (tiap kartu: nama, ciri, contoh)
4. Minimal 1 slide "activity" (langkah Amati–Bertanya–Diskusi atau sejenis).
5. Akhiri dengan "summary" (poin inti padat) lalu opsional "quote"/refleksi.
6. Jumlah slide: ikuti target user (±2). Materi kaya → lebih banyak slide, JANGAN memadatkan semua jadi 6 slide kosong.

## Aturan konten
- Akurat untuk SD kelas 5; contoh Indonesia (hutan tropis, sungai, sawah, laut) bila relevan.
- Bahasa hangat, boleh pertanyaan retoris, hindari formal kaku.
- Satu tema utama per slide, tetapi TEMA itu diuraikan lengkap (definisi + contoh + ciri).
- Prefer layout "cards" untuk 2–4 konsep sejajar — ini yang membuat slide terasa penuh.
- bullets JANGAN terlalu pendek ("Kelinci", "Pohon") — tulis "Seekor kelinci = individu", "Kumpulan ikan nila di kolam = populasi".
- imagePrompt (English): colorful children's educational illustration, Indonesian elementary context, no text overlays.

## Contoh densitas yang BENAR (ikuti roh ini)
Slide "Individu, Populasi, Komunitas":
- body: definisi singkat ekosistem tersusun dari makhluk hidup yang berhubungan
- cards: 3 kartu (Individu / Populasi / Komunitas) masing-masing body + 2 contoh
- flow: Individu → Populasi → Komunitas → Ekosistem
- footer: "Dari individu hingga ekosistem, semuanya saling terhubung."

Slide kosong (HANYA title + 1 kalimat body) = DILARANG.`

function buildUserPrompt(opts: GeneratePresentationOptions): string {
  const style = opts.style || 'interaktif'
  const target = Math.max(8, Math.min(opts.targetSlides || 14, 22))
  const styleInstr =
    style === 'ringkas'
      ? 'Gaya RINGKAS: tetap padat informasi, kurangi dekorasi verbal, fokus definisi+contoh+bullets.'
      : style === 'cerita'
        ? 'Gaya CERITA: alur naratif, contoh kisah singkat, transisi lembut antar slide, tetap padat fakta.'
        : 'Gaya INTERAKTIF: pertanyaan ke siswa, callout "Tahukah kamu?", minimal 1 slide activity, tetap padat materi.'

  return [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Judul presentasi: ${opts.title}`,
    `Target sekitar ${target} slide (boleh ±2). Prioritas: KEPADATAN + KEJELASAN, bukan slide tipis.`,
    styleInstr,
    '',
    'Outline materi (hormati struktur; baris dengan "- " adalah sub-materi):',
    opts.outline.trim(),
    '',
    opts.extraContext?.trim() ? `Catatan guru: ${opts.extraContext.trim()}` : '',
    'Buat presentasi siap pakai guru di kelas (~30–45 menit). Setiap slide konten harus terasa penuh (definisi + struktur + contoh).',
  ]
    .filter((l) => l !== undefined && l !== '')
    .join('\n')
}

const VALID_LAYOUTS = new Set<SlideLayout>([
  'title',
  'section',
  'content',
  'bullets',
  'cards',
  'compare',
  'image-focus',
  'quote',
  'summary',
  'activity',
  'assessment',
])

function normalizeCard(raw: any): SlideCard | null {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || '').trim()
  if (!title) return null
  let bullets: string[] | undefined
  if (Array.isArray(raw.bullets)) {
    const list = raw.bullets
      .map((b: unknown) => String(b ?? '').trim())
      .filter(Boolean)
      .slice(0, 6) as string[]
    bullets = list.length ? list : undefined
  }
  const body = raw.body ? String(raw.body).trim().slice(0, 400) : undefined
  const badge = raw.badge ? String(raw.badge).trim().slice(0, 40) : undefined
  return {
    title: title.slice(0, 60),
    body: body || undefined,
    bullets,
    badge: badge || undefined,
  }
}

function normalizeSlide(raw: any, index: number): PresentationSlide | null {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || '').trim()
  if (!title) return null
  const layoutRaw = String(raw.layout || 'content').toLowerCase() as SlideLayout
  const layout = VALID_LAYOUTS.has(layoutRaw) ? layoutRaw : 'content'

  let bullets: string[] | undefined
  if (Array.isArray(raw.bullets)) {
    const list = raw.bullets
      .map((b: unknown) => String(b ?? '').trim())
      .filter(Boolean)
      .slice(0, 10) as string[]
    bullets = list.length === 0 ? undefined : list
  }

  let cards: SlideCard[] | undefined
  if (Array.isArray(raw.cards)) {
    const list = raw.cards.map(normalizeCard).filter(Boolean) as SlideCard[]
    cards = list.length ? list.slice(0, 4) : undefined
  }

  let examples: string[] | undefined
  if (Array.isArray(raw.examples)) {
    const list = raw.examples
      .map((e: unknown) => String(e ?? '').trim())
      .filter(Boolean)
      .slice(0, 8) as string[]
    examples = list.length ? list : undefined
  }

  let flow: string[] | undefined
  if (Array.isArray(raw.flow)) {
    const list = raw.flow
      .map((f: unknown) => String(f ?? '').trim())
      .filter(Boolean)
      .slice(0, 8) as string[]
    flow = list.length ? list : undefined
  }

  const body = raw.body ? String(raw.body).trim().slice(0, 900) : undefined
  const callout = raw.callout ? String(raw.callout).trim().slice(0, 280) : undefined
  const activity = raw.activity ? String(raw.activity).trim().slice(0, 320) : undefined
  const footer = raw.footer ? String(raw.footer).trim().slice(0, 220) : undefined
  const imagePrompt = raw.imagePrompt ? String(raw.imagePrompt).trim().slice(0, 500) : undefined
  const needsImage =
    Boolean(raw.needsImage) || layout === 'image-focus' || layout === 'title'

  return {
    id: String(raw.id || `s${index + 1}`).slice(0, 24),
    layout,
    title: title.slice(0, 100),
    body: body || undefined,
    bullets,
    cards,
    examples,
    flow,
    callout: callout || undefined,
    activity: activity || undefined,
    footer: footer || undefined,
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
      temperature: 0.7,
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
