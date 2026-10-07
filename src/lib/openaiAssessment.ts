/**
 * AI: tautkan aktivitas belajar ke TP terpilih + rumuskan komponen penilaian + rubrik.
 * Hanya TP dari mapel yang dikirim guru — tidak menambah mapel di luar permintaan.
 */

import {
  clampScore,
  type AiAssessmentDraft,
  type AssessmentComponent,
  type RubricBand,
  type RubricLevel,
} from '../types/assessment'
import type { SubjectKey } from '../types/question'
import type { LearningObjective } from '../types/tp'
import { getSubject } from '../types/question'

export type GenerateAssessmentOptions = {
  description: string
  subjectKeys: SubjectKey[]
  availableTps: Pick<LearningObjective, 'code' | 'subjectKey' | 'element' | 'statement'>[]
  titleHint?: string
  model?: string
}

const SYSTEM_PROMPT = `Kamu adalah asisten penilaian formatif untuk guru SD kelas 5 Indonesia (Kurikulum Merdeka, Fase C).

## TUGAS
Dari deskripsi aktivitas belajar yang diberikan guru, dan DAFTAR TUJUAN PEMBELAJARAN (TP) yang disediakan:
1. Pilih hanya kode TP yang benar-benar relevan dengan aktivitas (dari daftar yang diberikan).
2. Rumuskan 3–6 komponen penilaian yang KOMPETENSI-nya dapat diamati/diukur dalam aktivitas tersebut.
3. Setiap komponen harus tertaut minimal satu kode TP dari daftar.
4. Buat rubrik sederhana 4 level untuk setiap komponen.

## ATURAN KETAT
- HANYA gunakan kode TP yang ada di daftar. Jangan mengarang kode baru.
- JANGAN mengaitkan mapel atau TP di luar daftar, meskipun secara umum aktivitas itu bisa relevan dengan mapel lain.
- Kompetensi harus operasional (bisa diamati guru saat aktivitas), bukan abstrak.
- Bahasa Indonesia baku, jelas, untuk guru SD.
- Rubrik level: 1 Belum tampak, 2 Berkembang, 3 Mahir, 4 Sangat mahir — deskripsi singkat (1 kalimat) per level.
- Bobot komponen: angka positif (default 1). Komponen inti boleh 1.5–2.

## OUTPUT — HANYA JSON valid
{
  "title": "Judul penilaian singkat",
  "linkedTpCodes": ["KODE-1", "KODE-2"],
  "aiNotes": "1–2 kalimat alasan pemilihan TP (opsional)",
  "components": [
    {
      "id": "c1",
      "label": "Nama komponen singkat",
      "description": "Kompetensi terukur yang diamati",
      "tpCodes": ["KODE-1"],
      "weight": 1,
      "rubric": [
        { "level": 1, "label": "Belum tampak", "descriptor": "..." },
        { "level": 2, "label": "Berkembang", "descriptor": "..." },
        { "level": 3, "label": "Mahir", "descriptor": "..." },
        { "level": 4, "label": "Sangat mahir", "descriptor": "..." }
      ]
    }
  ]
}`

function buildUserPrompt(opts: GenerateAssessmentOptions): string {
  const subjects = opts.subjectKeys
    .map((k) => getSubject(k)?.name || k)
    .join(', ')

  const tpLines = opts.availableTps.map((t) => {
    const sub = getSubject(t.subjectKey as SubjectKey)?.shortName || t.subjectKey
    return `- ${t.code} [${sub}] (${t.element || '—'}): ${t.statement}`
  })

  const parts = [
    `Deskripsi aktivitas penilaian dari guru:`,
    opts.description.trim(),
    '',
    `Mapel yang DIMINTA guru (batasi hanya ini): ${subjects}`,
    opts.titleHint?.trim() ? `Usulan judul: ${opts.titleHint.trim()}` : '',
    '',
    '=== DAFTAR TP YANG BOLEH DIPILIH (hanya dari sini) ===',
    tpLines.length ? tpLines.join('\n') : '(kosong — jangan mengarang TP)',
    '',
    'Pilih TP relevan, rumuskan komponen + rubrik. Kembalikan JSON sesuai skema.',
  ]
  return parts.filter(Boolean).join('\n')
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
      temperature: 0.35,
      top_p: 0.9,
      max_tokens: 6000,
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

function normalizeRubric(raw: any): RubricBand[] {
  const defaults: RubricBand[] = [
    { level: 1, label: 'Belum tampak', descriptor: 'Belum menunjukkan indikator yang diharapkan.' },
    { level: 2, label: 'Berkembang', descriptor: 'Mulai tampak dengan bimbingan.' },
    { level: 3, label: 'Mahir', descriptor: 'Menunjukkan indikator secara konsisten.' },
    { level: 4, label: 'Sangat mahir', descriptor: 'Menunjukkan indikator secara mandiri dan mendalam.' },
  ]
  if (!Array.isArray(raw) || raw.length === 0) return defaults
  return defaults.map((d) => {
    const found = raw.find((r: any) => Number(r?.level) === d.level)
    if (!found) return d
    return {
      level: d.level as RubricLevel,
      label: String(found.label || d.label).trim().slice(0, 40) || d.label,
      descriptor: String(found.descriptor || found.description || d.descriptor)
        .trim()
        .slice(0, 280),
    }
  })
}

function pickAllowedCodes(raw: unknown, allowedCodes: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const code = String(raw[i] ?? '').trim()
    if (code.length > 0 && allowedCodes.has(code)) out.push(code)
  }
  return out
}

function normalizeComponent(raw: any, index: number, allowedCodes: Set<string>): AssessmentComponent | null {
  if (!raw || typeof raw !== 'object') return null
  const label = String(raw.label || raw.name || '').trim()
  const description = String(raw.description || raw.kompetensi || '').trim()
  if (!label || !description) return null
  const tpCodes = pickAllowedCodes(raw.tpCodes, allowedCodes)
  const weight = Number(raw.weight)
  return {
    id: String(raw.id || `c${index + 1}`)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24) || `c${index + 1}`,
    label: label.slice(0, 80),
    description: description.slice(0, 400),
    tpCodes,
    weight: Number.isFinite(weight) && weight > 0 ? Math.min(5, weight) : 1,
    rubric: normalizeRubric(raw.rubric),
  }
}

export type SimulateScoresOptions = {
  predicate: string
  activityTitle: string
  activityDescription?: string
  components: AssessmentComponent[]
  studentName: string
  subjectPerformanceNotes?: string
  model?: string
}

const SIMULATE_SYSTEM = `Kamu membantu guru SD mengisi skor observasi aktivitas (skala 1–4, boleh 0.25).

Tugas: terjemahkan predikat huruf siswa menjadi skor per komponen penilaian.
Predikat umum: E (sangat rendah), D, C-, C, C+, B-, B, B+, A-, A, A+ (sangat tinggi).
Skala: 1 Belum tampak, 2 Berkembang, 3 Mahir, 4 Sangat mahir (boleh 1.25, 1.5, …, 3.75).

Aturan:
- Skor harus konsisten dengan predikat target (rata tertimbang mendekati target).
- Komponen tidak harus identik; variasikan wajar sesuai bobot & rubrik.
- Pertimbangkan catatan performa mapel lain jika ada (jangan ekstrem bertentangan tanpa alasan).
- Hanya kembalikan JSON: { "scores": { "<componentId>": <number> }, "note": "opsional singkat" }
- Setiap componentId yang diminta harus ada di scores.
- Nilai hanya antara 1 dan 4, kelipatan 0.25.`

export async function simulateScoresWithOpenAI(
  opts: SimulateScoresOptions
): Promise<{ scores: Record<string, number>; note?: string }> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  const predicate = opts.predicate.trim()
  if (!predicate) throw new Error('Predikat wajib diisi (mis. B+ atau A-).')
  if (!opts.components.length) throw new Error('Tidak ada komponen penilaian.')

  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL?.trim() || 'gpt-4.1'

  const compLines = opts.components.map((c) => {
    const rub = (c.rubric || [])
      .map((r) => `L${r.level}:${r.descriptor || r.label}`)
      .join(' | ')
    return `- id=${c.id} | ${c.label} (bobot ${c.weight}) | ${c.description} || rubrik: ${rub}`
  })

  const user = [
    `Siswa: ${opts.studentName}`,
    `Predikat target: ${predicate}`,
    `Aktivitas: ${opts.activityTitle}`,
    opts.activityDescription?.trim()
      ? `Deskripsi: ${opts.activityDescription.trim().slice(0, 400)}`
      : '',
    opts.subjectPerformanceNotes?.trim()
      ? `Performa terkait di mapel yang sama (konteks):\n${opts.subjectPerformanceNotes.trim().slice(0, 600)}`
      : 'Performa terkait: (belum ada data)',
    '',
    'Komponen yang harus diisi skornya:',
    ...compLines,
    '',
    'Kembalikan JSON scores untuk SEMUA id komponen di atas.',
  ]
    .filter(Boolean)
    .join('\n')

  const parsed = await callOpenAI(key, model, SIMULATE_SYSTEM, user)
  const rawScores = parsed?.scores
  if (!rawScores || typeof rawScores !== 'object') {
    throw new Error('AI tidak mengembalikan scores yang valid.')
  }

  const scores: Record<string, number> = {}
  for (const c of opts.components) {
    const v = Number((rawScores as any)[c.id])
    if (Number.isFinite(v)) scores[c.id] = clampScore(v)
  }
  if (Object.keys(scores).length === 0) {
    throw new Error('AI tidak mengisi skor komponen apa pun.')
  }
  const vals = Object.values(scores)
  const mid = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] ?? 3
  for (const c of opts.components) {
    if (scores[c.id] == null) scores[c.id] = clampScore(mid)
  }

  return {
    scores,
    note: parsed.note ? String(parsed.note).trim().slice(0, 300) : undefined,
  }
}

export async function generateAssessmentWithOpenAI(
  opts: GenerateAssessmentOptions
): Promise<AiAssessmentDraft> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'VITE_OPENAI_API_KEY belum diisi. Tambahkan di file .env lalu restart npm run dev.'
    )
  }
  const description = opts.description.trim()
  if (!description) throw new Error('Deskripsi aktivitas wajib diisi.')
  if (!opts.subjectKeys.length) throw new Error('Pilih minimal satu mata pelajaran.')
  if (!opts.availableTps.length) {
    throw new Error(
      'Tidak ada TP aktif untuk mapel terpilih. Isi master Tujuan Pembelajaran terlebih dahulu.'
    )
  }

  const allowedCodes = new Set(opts.availableTps.map((t) => t.code))
  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL?.trim() || 'gpt-4.1'
  const parsed = await callOpenAI(key, model, SYSTEM_PROMPT, buildUserPrompt(opts))

  const title =
    String(parsed.title || opts.titleHint || 'Penilaian aktivitas')
      .trim()
      .slice(0, 120) || 'Penilaian aktivitas'

  const linkedTpCodes: string[] = [...new Set(pickAllowedCodes(parsed.linkedTpCodes, allowedCodes))]

  let components: AssessmentComponent[] = Array.isArray(parsed.components)
    ? (parsed.components
        .map((c: any, i: number) => normalizeComponent(c, i, allowedCodes))
        .filter(Boolean) as AssessmentComponent[])
    : []

  const seen = new Set<string>()
  components = components.map((c, i): AssessmentComponent => {
    let id = c.id
    if (seen.has(id)) id = `${c.id}_${i + 1}`
    seen.add(id)
    const tpCodes: string[] = c.tpCodes.length ? c.tpCodes : linkedTpCodes.slice(0, 2)
    return { ...c, id, tpCodes }
  })

  if (components.length === 0) {
    throw new Error('AI tidak menghasilkan komponen penilaian yang valid. Coba perjelas deskripsi.')
  }

  const fromComponents = new Set<string>()
  components.forEach((c) => c.tpCodes.forEach((t) => fromComponents.add(t)))
  const finalLinked: string[] =
    linkedTpCodes.length > 0 ? linkedTpCodes : [...fromComponents]

  return {
    title,
    linkedTpCodes: finalLinked,
    components,
    aiNotes: parsed.aiNotes ? String(parsed.aiNotes).trim().slice(0, 500) : undefined,
  }
}
