import type { Question, QuestionType } from '../types/question'

export function normalizeKompleksitas(k?: string): string {
  const t = (k || '').trim()
  if (!t) return ''
  const low = t.toLowerCase()
  if (low.startsWith('l1') || low.includes('pemahaman')) return 'L1-Pemahaman'
  if (low.startsWith('l2') || low.includes('aplikasi')) return 'L2-Aplikasi'
  if (low.startsWith('l3') || low.includes('penalaran')) return 'L3-Penalaran'
  return t
}

export type TopicSlot = {
  topicId: string
  count: number
  /** Kosong = semua level; isi = filter level terpilih */
  kompleksitas: string[]
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateQuestions(
  pool: Question[],
  count: number,
  opts: {
    topicIds?: string[]
    types?: QuestionType[]
    balancedByTp?: boolean
    excludeIds?: Set<string>
    fillFromExcluded?: boolean
    slots?: TopicSlot[]
  }
): string[] {
  const excluded = opts.excludeIds
  const fillFromExcluded = opts.fillFromExcluded

  const matchesKompleksitas = (q: Question, levels: string[]) => {
    if (!levels.length) return true
    const nk = normalizeKompleksitas(q.kompleksitas)
    if (!nk) return levels.includes('__none__')
    return levels.includes(nk)
  }

  const pick = (src: Question[], n: number, balancedByTp: boolean): Question[] => {
    if (n <= 0 || src.length === 0) return []
    if (!balancedByTp) return shuffleArray(src).slice(0, n)
    const byTp = new Map<string, Question[]>()
    src.forEach((q) => {
      const key = (q.tpCodes && q.tpCodes[0]) || q.tp || '_'
      if (!byTp.has(key)) byTp.set(key, [])
      byTp.get(key)!.push(q)
    })
    const buckets = [...byTp.values()].map((b) => shuffleArray(b))
    const out: Question[] = []
    let guard = 0
    while (out.length < n && guard < n * 20) {
      guard++
      let added = false
      for (const b of buckets) {
        if (out.length >= n) break
        const q = b.shift()
        if (q) {
          out.push(q)
          added = true
        }
      }
      if (!added) break
    }
    return out
  }

  const pickFromList = (list: Question[], n: number): Question[] => {
    if (list.length === 0 || n <= 0) return []
    let primary = list
    let secondary: Question[] = []
    if (excluded && excluded.size > 0) {
      primary = list.filter((q) => !excluded.has(q.id!))
      if (fillFromExcluded) {
        secondary = list.filter((q) => excluded.has(q.id!))
      }
    }
    let chosen = pick(primary, n, !!opts.balancedByTp)
    if (chosen.length < n && secondary.length) {
      const need = n - chosen.length
      const ids = new Set(chosen.map((q) => q.id))
      chosen = chosen.concat(
        pick(
          secondary.filter((q) => !ids.has(q.id!)),
          need,
          !!opts.balancedByTp
        )
      )
    }
    return chosen
  }

  if (opts.slots && opts.slots.length > 0) {
    const chosen: Question[] = []
    const used = new Set<string>()
    for (const slot of opts.slots) {
      if (slot.count <= 0) continue
      let list = pool.filter((q) => q.id && q.topicId === slot.topicId)
      if (opts.types && opts.types.length > 0) {
        list = list.filter((q) => opts.types!.includes(q.type))
      }
      list = list.filter((q) => matchesKompleksitas(q, slot.kompleksitas))
      list = list.filter((q) => !used.has(q.id!))
      const picked = pickFromList(list, slot.count)
      picked.forEach((q) => used.add(q.id!))
      chosen.push(...picked)
    }
    return shuffleArray(chosen).map((q) => q.id!)
  }

  let list = pool.filter((q) => q.id)
  if (opts.topicIds && opts.topicIds.length > 0) {
    list = list.filter((q) => opts.topicIds!.includes(q.topicId))
  }
  if (opts.types && opts.types.length > 0) {
    list = list.filter((q) => opts.types!.includes(q.type))
  }
  if (list.length === 0) return []
  return pickFromList(list, count).map((q) => q.id!)
}
