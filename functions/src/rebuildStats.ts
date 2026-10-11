import type { Firestore } from 'firebase-admin/firestore'
import { buildStudentStats, statsDocId, statsKey, type AttemptLike } from './studentStats'

/**
 * Hitung ulang SEMUA ringkasan peringkat dari seluruh `attempts` (idempoten, aman diulang).
 * Dipakai skrip scripts/backfill-student-stats.mjs setelah deploy fungsi, dan bila ringkasan
 * perlu disegarkan penuh (mis. setelah koreksi data massal).
 */
export async function rebuildAll(db: Firestore, apply: boolean) {
  const [attSnap, latSnap, oldSnap] = await Promise.all([
    db.collection('attempts').get(),
    db.collection('latihan').get(),
    db.collection('studentStats').get(),
  ])
  const subj = new Map<string, string>()
  latSnap.docs.forEach((d) => {
    const s = d.data().subjectKey
    if (s) subj.set(d.id, String(s))
  })
  const docs = buildStudentStats(
    attSnap.docs.map((d) => d.data() as AttemptLike),
    (id) => (id ? subj.get(id) : undefined)
  )
  const keep = new Set(docs.map((d) => statsDocId(d.key)))
  const stale = oldSnap.docs.filter((d) => !keep.has(d.id))
  const result = { attempts: attSnap.size, students: docs.length, staleRemoved: stale.length }
  if (!apply) return { ...result, written: 0 }

  const now = Date.now()
  let batch = db.batch()
  let n = 0
  const flush = async () => {
    if (n > 0) await batch.commit()
    batch = db.batch()
    n = 0
  }
  for (const d of docs) {
    batch.set(db.collection('studentStats').doc(statsDocId(d.key)), {
      ...d,
      computedAtMs: now,
      updatedAt: new Date(),
    })
    if (++n >= 400) await flush()
  }
  for (const d of stale) {
    batch.delete(d.ref)
    if (++n >= 400) await flush()
  }
  await flush()
  return { ...result, written: docs.length }
}

/**
 * Hitung ulang ringkasan SATU siswa dari hasil kuisnya (idempoten).
 * Perhitungan yang MULAI lebih belakangan menang, sehingga pemicu yang datang terlambat / ganda
 * tidak menimpa hasil yang lebih baru.
 */
export async function recomputeStudentStats(db: Firestore, target: AttemptLike): Promise<void> {
  const startedMs = Date.now()
  const key = statsKey(target)
  const col = db.collection('attempts')
  const snap = target.studentId
    ? await col.where('studentId', '==', String(target.studentId).trim()).get()
    : await col.where('studentName', '==', String(target.studentName || '')).get()
  const attempts = snap.docs.map((d) => d.data() as AttemptLike).filter((a) => statsKey(a) === key)

  const ref = db.collection('studentStats').doc(statsDocId(key))
  let payload: Record<string, unknown> | null = null
  if (attempts.length > 0) {
    const ids = [...new Set(attempts.map((a) => a.latihanId).filter((x): x is string => !!x))]
    const subj = new Map<string, string>()
    if (ids.length > 0) {
      const docs = await db.getAll(...ids.map((id) => db.collection('latihan').doc(id)))
      docs.forEach((d) => {
        const s = d.exists ? d.data()?.subjectKey : undefined
        if (s) subj.set(d.id, String(s))
      })
    }
    const [doc] = buildStudentStats(attempts, (id) => (id ? subj.get(id) : undefined))
    payload = { ...doc, computedAtMs: startedMs, updatedAt: new Date() }
  }

  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    if (cur.exists && Number(cur.data()?.computedAtMs || 0) > startedMs) return
    if (payload) tx.set(ref, payload)
    else if (cur.exists) tx.delete(ref)
  })
}
