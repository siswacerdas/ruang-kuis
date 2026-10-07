import type { SubjectKey } from './question'
import type { LearningObjective } from './tp'

/**
 * Urutan alami kode TP (fallback jika field order tidak ada):
 * BIN-7.1 < BIN-8.1 < BIN-10.1 — bukan lexicographic.
 */
export function compareTpCodes(a: string, b: string): number {
  const tokenize = (s: string): (string | number)[] => {
    const parts: (string | number)[] = []
    const str = s || ''
    let i = 0
    while (i < str.length) {
      const ch = str.charCodeAt(i)
      if (ch >= 48 && ch <= 57) {
        let j = i + 1
        while (j < str.length) {
          const cj = str.charCodeAt(j)
          if (cj < 48 || cj > 57) break
          j++
        }
        parts.push(parseInt(str.slice(i, j), 10))
        i = j
      } else {
        let j = i + 1
        while (j < str.length) {
          const cj = str.charCodeAt(j)
          if (cj >= 48 && cj <= 57) break
          j++
        }
        parts.push(str.slice(i, j).toLowerCase())
        i = j
      }
    }
    return parts
  }
  const pa = tokenize(a)
  const pb = tokenize(b)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else {
      const sx = String(x)
      const sy = String(y)
      if (sx !== sy) return sx.localeCompare(sy, 'id')
    }
  }
  return 0
}

/** Urutkan master TP: field `order` dulu, lalu kode alami. */
export function compareTpRecords(
  a: Pick<LearningObjective, 'code' | 'order'>,
  b: Pick<LearningObjective, 'code' | 'order'>
): number {
  const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.POSITIVE_INFINITY
  const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.POSITIVE_INFINITY
  if (oa !== ob) return oa - ob
  return compareTpCodes(a.code || '', b.code || '')
}

/**
 * Prefiks kode TP → mapel (cadangan jika kode belum ada di master).
 * Mencegah IPAS/MAT/dll nyasar ke rekap BIN.
 */
const TP_CODE_PREFIX_SUBJECT: { prefix: string; subjectKey: SubjectKey }[] = [
  { prefix: 'BIN', subjectKey: 'bahasa-indonesia' },
  { prefix: 'BI', subjectKey: 'bahasa-indonesia' },
  { prefix: 'PP', subjectKey: 'pendidikan-pancasila' },
  { prefix: 'IPAS', subjectKey: 'ipas' },
  { prefix: 'IPA', subjectKey: 'ipas' },
  { prefix: 'MAT', subjectKey: 'matematika' },
  { prefix: 'MTK', subjectKey: 'matematika' },
  { prefix: 'ING', subjectKey: 'bahasa-inggris' },
  { prefix: 'BING', subjectKey: 'bahasa-inggris' },
  { prefix: 'AI', subjectKey: 'al-islam' },
  { prefix: 'PAI', subjectKey: 'al-islam' },
  { prefix: 'SM', subjectKey: 'seni-musik' },
  { prefix: 'SR', subjectKey: 'seni-rupa' },
]

export function inferSubjectFromTpCode(code: string): SubjectKey | null {
  const c = (code || '').trim().toUpperCase()
  if (!c) return null
  const sorted = [...TP_CODE_PREFIX_SUBJECT].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const { prefix, subjectKey } of sorted) {
    const p = prefix.toUpperCase()
    if (c === p || c.startsWith(p + '-') || c.startsWith(p + '.') || c.startsWith(p + ' ')) {
      return subjectKey
    }
  }
  return null
}

/** Apakah kode TP boleh tampil di rekap mapel terpilih. */
export function isTpCodeForSubject(
  code: string,
  subjectKey: SubjectKey,
  tpByCode: Map<string, LearningObjective>
): boolean {
  const master = tpByCode.get(code)
  if (master) return master.subjectKey === subjectKey
  const inferred = inferSubjectFromTpCode(code)
  if (!inferred) return false
  return inferred === subjectKey
}
