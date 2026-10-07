// TEMP: file being restored - see next commit for full content
export type StimulusMode = 'none' | 'text' | 'image'
export type KompleksitasLevel = 'L1-Pemahaman' | 'L2-Aplikasi' | 'L3-Penalaran' | 'campuran'
export type AiDraftQuestion = { type: any; question: string; options: string[]; correctAnswers: number[]; categoryLabels?: string[]; explanation?: string; stimulus?: string; stimulusImage?: string; imagePrompt?: string; tpCodes?: string[]; kompleksitas?: string }
export type GenerateAiOptions = { subjectName: string; subjectKey: any; topicName: string; tpCodes?: string[]; count: number; types: any[]; stimulusMode?: StimulusMode; stimulusModes?: StimulusMode[]; stimulusCounts?: Partial<Record<StimulusMode, number>>; kompleksitas?: KompleksitasLevel; extraContext?: string; model?: string; generateImages?: boolean }
export type StimulusPlan = Record<StimulusMode, number>
export function resolveStimulusPlan(count: number, modes?: StimulusMode[], single?: StimulusMode, counts?: Partial<Record<StimulusMode, number>>): StimulusPlan {
  const n = Math.max(1, count)
  let selected: StimulusMode[] = modes?.length ? [...new Set(modes)] : single ? [single] : ['none']
  const plan: StimulusPlan = { none: 0, text: 0, image: 0 }
  if (counts) {
    let sum = 0
    for (const m of selected) { const v = Math.max(0, Math.floor(Number(counts[m]) || 0)); plan[m] = v; sum += v }
    if (sum === n) return plan
    if (sum > 0 && sum < n) { plan[selected[0]] += n - sum; return plan }
    if (sum > n) { let excess = sum - n; for (const m of [...selected].sort((a,b)=>plan[b]-plan[a])) { if (excess<=0) break; const cut=Math.min(plan[m],excess); plan[m]-=cut; excess-=cut } return plan }
  }
  const k = selected.length; const base = Math.floor(n/k); const rem = n%k
  selected.forEach((m,i)=>{ plan[m]=base+(i<rem?1:0) })
  return plan
}
export function isOpenAiConfigured() { return Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim()) }
export type GenerateAiResult = { drafts: AiDraftQuestion[]; imageWarnings: string[] }
export async function generateQuestionsWithOpenAI(opts: GenerateAiOptions): Promise<GenerateAiResult> {
  throw new Error('openaiQuestions.ts sedang diperbaiki — commit berikutnya mengembalikan implementasi penuh multi-stimulus. Refresh setelah pull.')
}
export async function generateStimulusImage(): Promise<any> { throw new Error('Sedang diperbaiki') }
export async function rewriteOptionsWithAI(): Promise<any> { throw new Error('Sedang diperbaiki') }
export async function improveStimulusWithAI(): Promise<any> { throw new Error('Sedang diperbaiki') }
