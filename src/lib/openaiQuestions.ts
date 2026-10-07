/** RESTORED PLACEHOLDER - see local FINAL_OQ.ts */
export type StimulusMode = 'none' | 'text' | 'image'
export type KompleksitasLevel = 'L1-Pemahaman' | 'L2-Aplikasi' | 'L3-Penalaran' | 'campuran'
export type AiDraftQuestion = {
  type: any
  question: string
  options: string[]
  correctAnswers: number[]
  categoryLabels?: string[]
  explanation?: string
  stimulus?: string
  stimulusImage?: string
  imagePrompt?: string
  tpCodes?: string[]
  kompleksitas?: string
}
export type GenerateAiOptions = {
  subjectName: string
  subjectKey: any
  topicName: string
  tpCodes?: string[]
  count: number
  types: any[]
  stimulusMode?: StimulusMode
  stimulusModes?: StimulusMode[]
  stimulusCounts?: Partial<Record<StimulusMode, number>>
  kompleksitas?: KompleksitasLevel
  extraContext?: string
  model?: string
  generateImages?: boolean
}
export type StimulusPlan = Record<StimulusMode, number>
export function resolveStimulusPlan(
  count: number,
  modes?: StimulusMode[],
  single?: StimulusMode,
  counts?: Partial<Record<StimulusMode, number>>
): StimulusPlan {
  const n = Math.max(1, count)
  let selected: StimulusMode[] = []
  if (modes && modes.length > 0) selected = [...new Set(modes)]
  else if (single) selected = [single]
  else selected = ['none']
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
export function isOpenAiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim())
}
export type GenerateAiResult = { drafts: AiDraftQuestion[]; imageWarnings: string[] }
export async function generateQuestionsWithOpenAI(
  opts: GenerateAiOptions
): Promise<GenerateAiResult> {
  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) throw new Error('VITE_OPENAI_API_KEY belum diisi.')
  const model = opts.model || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  const count = Math.max(1, Math.min(opts.count || 5, 15))
  const plan = resolveStimulusPlan(count, opts.stimulusModes, opts.stimulusMode, opts.stimulusCounts)
  const parts: string[] = []
  if (plan.none > 0) parts.push(plan.none + ' soal TANPA stimulus (stimulusKind=none)')
  if (plan.text > 0) parts.push(plan.text + ' soal STIMULUS TEKS (stimulusKind=text)')
  if (plan.image > 0) parts.push(plan.image + ' soal STIMULUS GAMBAR (stimulusKind=image)')
  const stimulusInstr = 'Stimulus — bagikan TEPAT sesuai kuota (total ' + count + '):\n- ' + parts.join('\n- ') + '\nTandai setiap soal dengan stimulusKind. Campur urutan.'
  const system = 'Kamu penulis soal SD kelas 5 Indonesia. Balas HANYA JSON {"questions":[...]}. Setiap soal: type, question, options, correctAnswers, explanation, stimulusKind (none|text|image), stimulus, imagePrompt, kompleksitas.'
  const user = ['Mapel: ' + opts.subjectName, 'Materi: ' + opts.topicName, 'Jumlah: ' + count, 'Tipe: ' + (opts.types||[]).join(','), stimulusInstr, opts.extraContext || '', 'Buat soal berbeda.'].filter(Boolean).join('\n')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error('OpenAI error ' + res.status)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Respons kosong')
  const parsed = JSON.parse(content)
  const arr = Array.isArray(parsed?.questions) ? parsed.questions : []
  let drafts: AiDraftQuestion[] = arr.map((r: any) => ({
    type: r.type || 'single',
    question: String(r.question || ''),
    options: Array.isArray(r.options) ? r.options.map(String) : [],
    correctAnswers: Array.isArray(r.correctAnswers) ? r.correctAnswers.map(Number) : [0],
    explanation: r.explanation ? String(r.explanation) : undefined,
    stimulus: r.stimulus ? String(r.stimulus) : undefined,
    imagePrompt: r.imagePrompt ? String(r.imagePrompt) : undefined,
    kompleksitas: r.kompleksitas ? String(r.kompleksitas) : undefined,
    tpCodes: Array.isArray(r.tpCodes) ? r.tpCodes.map(String) : undefined,
  })).filter((d: AiDraftQuestion) => d.question && d.options.length >= 2)
  if (!drafts.length) throw new Error('Tidak ada soal valid')
  drafts = enforceStimulusPlan(drafts, plan)
  const imageWarnings: string[] = []
  if (plan.image > 0 && opts.generateImages !== false) {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      let p = (d.imagePrompt || '').trim()
      if (!p && d.stimulus) p = 'Educational scene for elementary school: ' + d.stimulus
      if (!p) continue
      try {
        const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: 'gpt-image-1-mini', prompt: p + ' Children educational illustration, simple, colorful. No text overlays.', n: 1, size: '1024x1024', quality: 'low' }),
        })
        const imgData = await imgRes.json()
        const item = imgData?.data?.[0]
        if (item?.b64_json) drafts[i] = { ...drafts[i], stimulusImage: 'data:image/png;base64,' + item.b64_json, imagePrompt: p }
        else if (item?.url) drafts[i] = { ...drafts[i], stimulusImage: item.url, imagePrompt: p }
        else imageWarnings.push('Soal ' + (i+1) + ': gagal gambar')
      } catch (e: any) {
        imageWarnings.push('Soal ' + (i+1) + ': ' + (e?.message || 'error'))
      }
    }
  }
  return { drafts, imageWarnings }
}
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
    if (kind === 'none') return { ...d, stimulus: undefined, imagePrompt: undefined, stimulusImage: undefined }
    if (kind === 'text') return { ...d, stimulus: (d.stimulus || '').trim() || 'Bacalah informasi berikut dengan saksama sebelum menjawab.', imagePrompt: undefined, stimulusImage: undefined }
    let prompt = (d.imagePrompt || '').trim()
    let stim = (d.stimulus || '').trim()
    if (!prompt && stim) prompt = 'Educational scene for elementary school: ' + stim
    if (!stim) stim = 'Perhatikan ilustrasi pada soal, lalu jawab pertanyaan berikut.'
    return { ...d, stimulus: stim, imagePrompt: prompt || undefined }
  })
}
export async function generateStimulusImage(): Promise<any> {
  throw new Error('generateStimulusImage: gunakan versi penuh — sementara nonaktif saat restore')
}
export async function rewriteOptionsWithAI(): Promise<any> {
  throw new Error('rewriteOptionsWithAI: gunakan versi penuh — sementara nonaktif saat restore')
}
export async function improveStimulusWithAI(): Promise<any> {
  throw new Error('improveStimulusWithAI: gunakan versi penuh — sementara nonaktif saat restore')
}
