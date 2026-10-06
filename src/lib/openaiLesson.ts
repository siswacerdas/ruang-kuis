/**
 * Generate materi belajar mandiri (HTML lengkap) via OpenAI.
 * Bukan slide presentasi — konten self-contained untuk siswa SD kelas 5.
 */

import { compressImageSrc } from './imageCompress'
import type { SubjectKey } from '../types/question'

export type LessonStyle = 'penjelasan' | 'ringkas' | 'latihan'

export type LessonSection = {
  id: string
  heading: string
  bodyHtml: string
  callout?: string
  needsImage?: boolean
  imagePrompt?: string
  imageUrl?: string
  imageCaption?: string
}

export type GeneratedLesson = {
  title: string
  introHtml: string
  objectives: string[]
  sections: LessonSection[]
  summaryHtml: string
  checkQuestions?: { q: string; a: string }[]
  htmlContent: string
}

export type GenerateLessonOptions = {
  subjectName: string
  subjectKey: SubjectKey
  title: string
  outline: string
  style?: LessonStyle
  generateImages?: boolean
  extraContext?: string
  model?: string
}

export type GenerateLessonResult = {
  lesson: GeneratedLesson
  imageWarnings: string[]
}

const SYSTEM_PROMPT = `Kamu adalah penulis materi belajar mandiri untuk siswa SD kelas 5 Indonesia (Kurikulum Merdeka).
Tugas: buat materi LENGKAP, MENDALAM, dan BERISI — siswa harus bisa memahami topik tanpa guru di samping.

## PRIORITAS MUTLAK
1. Jika ada "Instruksi / catatan guru" di pesan user, itu WAJIB dipatuhi lebih dulu daripada aturan umum di bawah. Jangan mengabaikan atau meringkas permintaan guru.
2. Informasi esensial (tokoh, rumusan, peristiwa, sebab-akibat, perbandingan, tanggal/periode penting) HARUS masuk. Jangan hanya definisi dangkal.
3. JANGAN mengulang isi yang sama di banyak bagian. Setiap section punya fokus unik.
4. Bukan slide presentasi. Bukan ringkasan bullet kosong. Ini artikel belajar yang utuh.

## KEDALAMAN PER BAGIAN (WAJIB)
Untuk SETIAP sub-materi / section:
- Minimal 3 paragraf <p> yang berisi (bukan 1–2 kalimat pendek).
- Alur: pengantar konsep → penjelasan rinci → contoh konkret / kisah / perbandingan → makna atau hubungan dengan kehidupan siswa (bila relevan).
- Jika topik sejarah/PPKn (mis. tokoh, sidang, piagam, rumusan sila): sebutkan tokoh, gagasan utama, perbedaan antar tokoh, urutan peristiwa, dan mengapa penting bagi Pancasila — jangan digabung jadi satu paragraf generik.
- Jika guru meminta "versi lengkap" suatu rumusan/usulan: tuliskan isinya secara eksplisit (bukan hanya menyebut namanya).
- Jika guru meminta pembahasan detail satu peristiwa (mis. BPUPKI / Piagam Jakarta / perubahan sila pertama): buat section khusus yang lebih panjang (4–6 paragraf + list bila perlu).

## LARANGAN
- Jangan materi yang terasa "template" atau generik tanpa fakta.
- Jangan mengulang definisi yang sama di intro, body, dan summary.
- Jangan mengorbankan kedalaman demi jumlah section yang sedikit.
- Jangan menjawab seolah slide (judul + 1 kalimat).

## OUTPUT — HANYA JSON valid
{
  "title": "string",
  "introHtml": "<p>...</p><p>...</p>",
  "objectives": ["tujuan 1", "..."],
  "sections": [
    {
      "id": "s1",
      "heading": "Judul bagian",
      "bodyHtml": "<p>...</p><p>...</p><ul><li>...</li></ul>",
      "callout": "opsional: 1 kalimat kunci",
      "needsImage": true,
      "imagePrompt": "English only if needsImage"
    }
  ],
  "summaryHtml": "<p>...</p><ul>...</ul>",
  "checkQuestions": [
    { "q": "pertanyaan", "a": "jawaban singkat" }
  ]
}

## ATURAN HTML
Tag diizinkan: p, ul, ol, li, strong, em, b, i, br, span
- Jangan h1–h6 di bodyHtml (heading pakai field heading).
- Jangan script, style, iframe, a, img.
- introHtml: 2–3 paragraf pengantar yang mengarahkan, bukan mengulang seluruh isi.
- sections: 5–12 bagian sesuai outline + instruksi guru (pecah sub-topik yang padat).
- summaryHtml: ringkas poin kunci SAJA (tidak menyalin ulang paragraf panjang).
- checkQuestions: 3–5 soal yang menguji pemahaman esensial, bukan hafalan trivial.

## needsImage
- Maksimal 3 section needsImage true.
- Pilih bagian yang terbantu visual (perbandingan, proses, tokoh/konteks sejarah sederhana).
- imagePrompt: bahasa Inggris, ilustrasi edukatif anak, TANPA teks/label di gambar.`

function buildUserPrompt(opts: GenerateLessonOptions): string {
  const style = opts.style || 'penjelasan'
  const styleInstr =
    style === 'ringkas'
      ? 'Gaya RINGKAS: tetap lengkap fakta esensial, bahasa padat, hindari pengulangan — BUKAN berarti dangkal.'
      : style === 'latihan'
        ? 'Gaya LATIHAN: penjelasan lengkap + di akhir beberapa section beri pertanyaan berpikir singkat untuk siswa.'
        : 'Gaya PENJELASAN: mendalam, runtut, kaya contoh dan fakta esensial.'

  const extra = opts.extraContext?.trim()
  const parts: string[] = [
    `Mapel: ${opts.subjectName} (${opts.subjectKey})`,
    `Judul materi: ${opts.title}`,
    '',
    styleInstr,
    '',
    '=== OUTLINE MATERI & SUB-MATERI ===',
    opts.outline.trim(),
  ]

  if (extra) {
    parts.push(
      '',
      '=== INSTRUKSI / CATATAN GURU (PRIORITAS TERTINGGI — WAJIB DIPATUHI) ===',
      extra,
      '',
      'Patuhi instruksi guru di atas secara penuh: kembangkan section yang diminta secara DETAIL,',
      'lengkapi fakta esensial, jangan meringkas berlebihan, dan jangan mengulang isi antar section.',
    )
  } else {
    parts.push(
      '',
      'Kembangkan setiap butir outline menjadi section yang jelas dan berisi.',
      'Jangan merangkum berlebihan; pastikan informasi esensial tidak terlewat.',
    )
  }

  parts.push(
    '',
    'Kembalikan JSON materi belajar mandiri sesuai skema.',
    'Target: materi terasa ditulis ahli (bukan template singkat).',
  )

  return parts.join('\n')
}

export function sanitizeLessonHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  let s = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')

  s = s.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tag: string) => {
    const t = tag.toLowerCase()
    const allowed = new Set([
      'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'span',
      'figure', 'figcaption', 'img', 'blockquote', 'div',
    ])
    if (!allowed.has(t)) return ''
    if (t === 'br') return '<br/>'
    if (t === 'img') {
      const srcM = full.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i)
      const altM = full.match(/\salt\s*=\s*("([^"]*)"|'([^']*)')/i)
      const src = (srcM?.[2] || srcM?.[3] || '').trim()
      const alt = (altM?.[2] || altM?.[3] || '').trim()
      if (!src) return ''
      if (!/^(data:image\/|https:\/\/)/i.test(src)) return ''
      return `<img src="${src.replace(/"/g, '')}" alt="${alt.replace(/"/g, '')}" />`
    }
    if (full.startsWith('</')) return `</${t}>`
    if (t === 'div' || t === 'span') {
      const classM = full.match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i)
      const cls = (classM?.[2] || classM?.[3] || '').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim()
      if (cls) return `<${t} class="${cls}">`
    }
    return `<${t}>`
  })
  return s.trim()
}

function normalizeSection(raw: any, index: number): LessonSection | null {
  if (!raw || typeof raw !== 'object') return null
  const heading = String(raw.heading || raw.title || '').trim()
  if (!heading) return null
  const bodyHtml = sanitizeLessonHtml(String(raw.bodyHtml || raw.body || ''))
  if (!bodyHtml) return null
  const section: LessonSection = {
    id: String(raw.id || `s${index + 1}`).slice(0, 24),
    heading: heading.slice(0, 120),
    bodyHtml,
  }
  if (raw.callout) section.callout = String(raw.callout).trim().slice(0, 400)
  const needsImage = Boolean(raw.needsImage)
  if (needsImage) {
    section.needsImage = true
    if (raw.imagePrompt) section.imagePrompt = String(raw.imagePrompt).trim().slice(0, 500)
  }
  return section
}

function buildHtmlContent(lesson: Omit<GeneratedLesson, 'htmlContent'>): string {
  const parts: string[] = []
  parts.push(`<article class="rk-lesson">`)
  parts.push(`<header class="rk-lesson-header">`)
  parts.push(`<h1>${escapeText(lesson.title)}</h1>`)
  if (lesson.introHtml) parts.push(`<div class="rk-intro">${lesson.introHtml}</div>`)
  if (lesson.objectives?.length) {
    parts.push(`<div class="rk-objectives"><p><strong>Setelah belajar, kamu bisa:</strong></p><ul>`)
    for (const o of lesson.objectives) {
      parts.push(`<li>${escapeText(o)}</li>`)
    }
    parts.push(`</ul></div>`)
  }
  parts.push(`</header>`)

  for (const s of lesson.sections) {
    parts.push(`<section class="rk-section" id="${escapeText(s.id)}">`)
    parts.push(`<h2>${escapeText(s.heading)}</h2>`)
    if (s.imageUrl) {
      parts.push(`<figure class="rk-figure">`)
      parts.push(`<img src="${s.imageUrl}" alt="${escapeText(s.imageCaption || s.heading)}" />`)
      if (s.imageCaption) parts.push(`<figcaption>${escapeText(s.imageCaption)}</figcaption>`)
      parts.push(`</figure>`)
    }
    parts.push(`<div class="rk-body">${s.bodyHtml}</div>`)
    if (s.callout) {
      parts.push(`<div class="rk-callout"><strong>Ingat!</strong> ${escapeText(s.callout)}</div>`)
    }
    parts.push(`</section>`)
  }

  if (lesson.summaryHtml) {
    parts.push(
      `<section class="rk-summary"><h2>Ringkasan</h2><div class="rk-body">${lesson.summaryHtml}</div></section>`,
    )
  }

  if (lesson.checkQuestions?.length) {
    parts.push(`<section class="rk-check"><h2>Cek pemahaman</h2><ol>`)
    for (const cq of lesson.checkQuestions) {
      parts.push(
        `<li><p class="rk-q">${escapeText(cq.q)}</p><p class="rk-a"><em>Jawaban:</em> ${escapeText(cq.a)}</p></li>`,
      )
    }
    parts.push(`</ol></section>`)
  }

  parts.push(`</article>`)
  return parts.join('\n')
}

function escapeText(t: string): string {
  return String(t || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      max_tokens: 14000,
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

function resolveImageModel(): string {
  return import.meta.env.VITE_OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1-mini'
}

async function generateLessonImage(
  prompt: string,
  apiKey: string,
): Promise<{ url?: string; error?: string }> {
  const fullPrompt = [
    prompt.trim(),
    "Children's educational illustration for Indonesian elementary school, simple, colorful, friendly.",
    'No text overlays, no watermarks, no labels with written answers.',
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

export async function generateLessonWithOpenAI(
  opts: GenerateLessonOptions,
): Promise<GenerateLessonResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.',
    )
  }
  const outline = opts.outline.trim()
  if (!outline) throw new Error('Outline materi wajib diisi.')
  if (!opts.title.trim()) throw new Error('Judul materi wajib diisi.')

  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  const parsed = await callOpenAI(key, model, SYSTEM_PROMPT, buildUserPrompt(opts))

  const title = String(parsed.title || opts.title).trim().slice(0, 160)
  const introHtml = sanitizeLessonHtml(String(parsed.introHtml || ''))
  const summaryHtml = sanitizeLessonHtml(String(parsed.summaryHtml || ''))
  const objectives = Array.isArray(parsed.objectives)
    ? parsed.objectives.map((o: unknown) => String(o ?? '').trim()).filter(Boolean).slice(0, 8)
    : []
  let sections = Array.isArray(parsed.sections)
    ? (parsed.sections.map(normalizeSection).filter(Boolean) as LessonSection[])
    : []
  if (sections.length === 0) {
    throw new Error('AI tidak menghasilkan bagian materi yang valid. Coba perjelas outline.')
  }

  const checkQuestions = Array.isArray(parsed.checkQuestions)
    ? parsed.checkQuestions
        .map((c: any) => ({
          q: String(c?.q || c?.question || '').trim(),
          a: String(c?.a || c?.answer || '').trim(),
        }))
        .filter((c: { q: string; a: string }) => c.q && c.a)
        .slice(0, 6)
    : []

  let imageSlots = 0
  sections = sections.map((s) => {
    if (s.needsImage && imageSlots < 3) {
      imageSlots += 1
      return s
    }
    const next = { ...s, needsImage: false }
    delete next.imagePrompt
    return next
  })

  const imageWarnings: string[] = []
  if (opts.generateImages) {
    for (let i = 0; i < sections.length; i++) {
      if (!sections[i].needsImage) continue
      let p = (sections[i].imagePrompt || '').trim()
      if (!p) {
        p = `Educational illustration about: ${sections[i].heading}. Simple, colorful, for elementary school.`
        sections[i] = { ...sections[i], imagePrompt: p }
      }
      const result = await generateLessonImage(p, key)
      if (result.url) {
        try {
          const compressed = await compressImageSrc(result.url, {
            maxSide: 560,
            targetChars: 90_000,
            minSide: 320,
          })
          sections[i] = {
            ...sections[i],
            imageUrl: compressed.dataUrl,
            imageCaption: sections[i].imageCaption || sections[i].heading,
          }
        } catch (e: any) {
          imageWarnings.push(`Bagian "${sections[i].heading}": kompres gagal — ${e?.message || 'error'}`)
        }
      } else {
        imageWarnings.push(`Bagian "${sections[i].heading}": ${result.error || 'gagal gambar'}`)
      }
    }
  }

  const base = {
    title,
    introHtml,
    objectives,
    sections,
    summaryHtml,
    checkQuestions: checkQuestions.length ? checkQuestions : undefined,
  }
  const htmlContent = buildHtmlContent(base)

  return {
    lesson: { ...base, htmlContent },
    imageWarnings,
  }
}

/** Ukuran yang benar-benar disimpan ke Firestore (bukan double-count sections+html). */
export function estimateLessonPayloadBytes(lesson: GeneratedLesson): number {
  const payload = {
    title: lesson.title || '',
    htmlContent: lesson.htmlContent || '',
    sectionsCount: lesson.sections?.length || 0,
  }
  try {
    return new Blob([JSON.stringify(payload)]).size
  } catch {
    return JSON.stringify(payload).length
  }
}

/** Batas aman di bawah limit dokumen Firestore 1 MiB. */
export const LESSON_FIRESTORE_MAX_BYTES = 980_000

/** Buang gambar dari lesson lalu bangun ulang htmlContent (teks tetap utuh). */
export function stripLessonImages(lesson: GeneratedLesson): GeneratedLesson {
  const sections = lesson.sections.map((s) => {
    const next = { ...s }
    delete next.imageUrl
    delete next.imagePrompt
    delete next.needsImage
    return next
  })
  const base = {
    title: lesson.title,
    introHtml: lesson.introHtml,
    objectives: lesson.objectives,
    sections,
    summaryHtml: lesson.summaryHtml,
    checkQuestions: lesson.checkQuestions,
  }
  return { ...base, htmlContent: buildHtmlContent(base) }
}
