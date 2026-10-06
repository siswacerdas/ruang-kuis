/**
 * Generate presentasi materi pelajaran via OpenAI.
 * Target: densitas visual + jumlah slide sesuai target user.
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
  body?: string
  bullets?: string[]
  cards?: SlideCard[]
  examples?: string[]
  flow?: string[]
  callout?: string
  activity?: string
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

const SYSTEM_PROMPT = `Kamu adalah desainer presentasi pembelajaran SD kelas 5 Indonesia (Kurikulum Merdeka).
Tugas: buat presentasi HTML-ready dengan densitas VISUAL (kartu, poin bernomor, alur, contoh).

## JUMLAH SLIDE — WAJIB DIPATUHI
- User memberi TARGET jumlah slide. Kamu HARUS menghasilkan antara (target-2) sampai (target+2) slide.
- Contoh: target 14 → minimal 12, ideal 14, maksimal 16.
- Jika outline pendek, PECAH tiap topik jadi beberapa slide (definisi / ciri / contoh / latihan).
- JANGAN pernah mengembalikan hanya 2–4 slide jika target ≥ 10. Itu GAGAL total.

## STANDAR KUALITAS — densitas VISUAL
Setiap slide konten:
- body: 1–2 kalimat definisi (maks ~40 kata). Bukan esai.
- WAJIB struktur: cards (2–4) ATAU bullets 4–6 poin ATAU flow + examples.
- Bullet 8–16 kata, informatif.
- cards: title + body singkat ATAU 2 bullets contoh.
- examples: 3–5 contoh konkret.
- footer: 1 kalimat kunci (opsional).
- LARANGAN: slide hanya judul + 1 kalimat.
- LARANGAN: body > 3 kalimat.

## Format output
HANYA JSON valid:
{"slides":[ ... ]}

Field tiap slide:
- id, layout, title (wajib)
- body, bullets, cards, examples, flow, callout, activity, footer (sesuai kebutuhan)
- needsImage (boolean, maks 4 true), imagePrompt (English, hanya jika needsImage)

layout: title | section | content | bullets | cards | compare | image-focus | quote | summary | activity | assessment

## Struktur wajib (sesuaikan jumlah dengan TARGET)
1. title — judul + ajakan + callout
2. bullets — 5–7 tujuan pembelajaran
3. Beberapa slide isi (cards/compare/bullets) — 1 sub-topik per slide
4. activity — minimal 1
5. summary — ringkasan poin
6. quote (opsional) — pesan penutup

## Contoh pemecahan outline pendek
Outline "Teks eksplanasi" saja → tetap 12–14 slide:
title, tujuan, pengertian, ciri-ciri, struktur (per bagian), fakta vs opini, contoh teks, langkah menulis, activity, kesalahan umum, tips, summary, quote.

Bahasa hangat SD. Contoh Indonesia. Prefer cards untuk konsep sejajar.`

function buildUserPrompt(opts: GeneratePresentationOptions, target: number): string {
  const style = opts.style || 'interaktif'
  const styleInstr =
    style === 'ringkas'
      ? 'Gaya RINGKAS: padat struktur (kartu/poin), minim narasi.'
      : style === 'cerita'
        ? 'Gaya CERITA: alur lembut, tetap kartu/contoh, bukan paragraf panjang.'
        : 'Gaya INTERAKTIF: callout + activity, konten utama via kartu/poin bernomor.'

  return [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Judul: ${opts.title}`,
    '',
    `=== TARGET SLIDE: ${target} ===`,
    `WAJIB hasilkan ${target - 2} sampai ${target + 2} slide. Ideal: tepat ${target}.`,
    `Jika outline singkat, PECAH menjadi banyak slide (satu konsep per slide).`,
    `Jangan berhenti di 2–5 slide.`,
    '',
    styleInstr,
    '',
    'Outline materi:',
    opts.outline.trim(),
    '',
    opts.extraContext?.trim() ? `Catatan guru: ${opts.extraContext.trim()}` : '',
    '',
    `Kembalikan JSON {"slides":[...]} berisi sekitar ${target} slide.`,
    'Setiap slide konten: 1–2 kalimat definisi + struktur visual (cards/bullets/flow/examples).',
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
  const card: SlideCard = { title: title.slice(0, 60) }
  if (Array.isArray(raw.bullets)) {
    const list = raw.bullets
      .map((b: unknown) => String(b ?? '').trim())
      .filter(Boolean)
      .slice(0, 6) as string[]
    if (list.length) card.bullets = list
  }
  if (raw.body) card.body = String(raw.body).trim().slice(0, 400)
  if (raw.badge) card.badge = String(raw.badge).trim().slice(0, 40)
  return card
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
    if (list.length) bullets = list
  }

  let cards: SlideCard[] | undefined
  if (Array.isArray(raw.cards)) {
    const list = raw.cards.map(normalizeCard).filter(Boolean) as SlideCard[]
    if (list.length) cards = list.slice(0, 4)
  }

  let examples: string[] | undefined
  if (Array.isArray(raw.examples)) {
    const list = raw.examples
      .map((e: unknown) => String(e ?? '').trim())
      .filter(Boolean)
      .slice(0, 8) as string[]
    if (list.length) examples = list
  }

  let flow: string[] | undefined
  if (Array.isArray(raw.flow)) {
    const list = raw.flow
      .map((f: unknown) => String(f ?? '').trim())
      .filter(Boolean)
      .slice(0, 8) as string[]
    if (list.length) flow = list
  }

  const body = raw.body ? String(raw.body).trim().slice(0, 500) : ''
  const callout = raw.callout ? String(raw.callout).trim().slice(0, 280) : ''
  const activity = raw.activity ? String(raw.activity).trim().slice(0, 320) : ''
  const footer = raw.footer ? String(raw.footer).trim().slice(0, 220) : ''
  const imagePrompt = raw.imagePrompt ? String(raw.imagePrompt).trim().slice(0, 500) : ''
  const needsImage = Boolean(raw.needsImage) || layout === 'image-focus' || layout === 'title'

  const slide: PresentationSlide = {
    id: String(raw.id || `s${index + 1}`).slice(0, 24),
    layout,
    title: title.slice(0, 100),
    needsImage,
  }
  if (body) slide.body = body
  if (bullets) slide.bullets = bullets
  if (cards) slide.cards = cards
  if (examples) slide.examples = examples
  if (flow) slide.flow = flow
  if (callout) slide.callout = callout
  if (activity) slide.activity = activity
  if (footer) slide.footer = footer
  if (needsImage && imagePrompt) slide.imagePrompt = imagePrompt
  return slide
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

async function callOpenAI(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_tokens: 8000,
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
  if (!content || typeof content !== 'string') {
    throw new Error('Respons OpenAI kosong.')
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Respons OpenAI bukan JSON valid.')
  }
}

function parseSlides(parsed: any): PresentationSlide[] {
  const arr = Array.isArray(parsed?.slides) ? parsed.slides : Array.isArray(parsed) ? parsed : []
  return arr.map((r: any, i: number) => normalizeSlide(r, i)).filter(Boolean) as PresentationSlide[]
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
  const target = Math.max(8, Math.min(opts.targetSlides || 14, 22))
  const minAccept = Math.max(6, target - 3)

  let slides = parseSlides(await callOpenAI(key, model, SYSTEM_PROMPT, buildUserPrompt(opts, target)))

  // Auto-retry sekali jika terlalu sedikit slide
  if (slides.length < minAccept) {
    const retryUser =
      buildUserPrompt(opts, target) +
      `\n\nPERINGATAN: respons sebelumnya hanya ${slides.length} slide. Itu TIDAK CUKUP.\n` +
      `Sekarang WAJIB hasilkan minimal ${minAccept} slide (ideal ${target}).\n` +
      `Pecah setiap sub-topik outline menjadi slide terpisah. Tambah: ciri, contoh, struktur, latihan, tips, kesalahan umum.`
    try {
      const retry = parseSlides(await callOpenAI(key, model, SYSTEM_PROMPT, retryUser))
      if (retry.length > slides.length) slides = retry
    } catch {
      // keep first result
    }
  }

  if (slides.length === 0) {
    throw new Error('AI tidak menghasilkan slide valid. Coba perjelas outline.')
  }
  if (slides.length < minAccept) {
    throw new Error(
      `AI hanya menghasilkan ${slides.length} slide (target ${target}). ` +
        `Coba outline lebih rinci (beberapa baris sub-materi dengan "- "), atau generate ulang.`
    )
  }

  let imageSlots = 0
  slides = slides.map((s) => {
    if (s.needsImage && imageSlots < 4) {
      imageSlots += 1
      return s
    }
    const next = { ...s, needsImage: false }
    if (s.needsImage) delete next.imagePrompt
    return next
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
