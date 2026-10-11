/**
 * Sumber data halaman Peringkat.
 *
 * Utama  : koleksi `studentStats` (±1 dokumen per siswa, dijaga Cloud Function `syncStudentStats`).
 * Cadangan: seluruh `attempts` + `latihan` (cara lama) — dipakai bila ringkasan belum terisi,
 *           ditolak rules (belum dideploy), error, atau jumlahnya tidak cocok dengan data asli.
 *
 * Pemeriksaan jumlah: total hasil di ringkasan harus sama dengan jumlah dokumen `attempts`
 * (dihitung di server, ±1 bacaan per 1.000 dokumen). Bila beda, ringkasan dianggap belum sinkron
 * dan peringkat dihitung dari data asli supaya angkanya selalu benar.
 */
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import type { LatihanAttempt, LatihanPaket } from '../types/question'
import type { StudentStats } from './ranking'

export type RankingSource =
  | { mode: 'stats'; stats: StudentStats[] }
  | { mode: 'attempts'; attempts: LatihanAttempt[]; pakets: LatihanPaket[] }

export async function loadRankingSource(): Promise<RankingSource> {
  try {
    const snap = await getDocs(collection(db, 'studentStats'))
    if (!snap.empty) {
      const stats = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StudentStats)
      const inStats = stats.reduce((s, st) => s + st.buckets.reduce((x, b) => x + b.n, 0), 0)
      const real = (await getCountFromServer(collection(db, 'attempts'))).data().count
      if (inStats === real) return { mode: 'stats', stats }
      console.warn(`ringkasan peringkat belum sinkron (${inStats} ≠ ${real}), pakai data asli`)
    }
  } catch (err) {
    console.warn('ringkasan peringkat tidak bisa dipakai, pakai data asli', err)
  }
  const [aSnap, pSnap] = await Promise.all([
    getDocs(collection(db, 'attempts')),
    getDocs(collection(db, 'latihan')),
  ])
  return {
    mode: 'attempts',
    attempts: aSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as LatihanAttempt),
    pakets: pSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as LatihanPaket),
  }
}

/** Daftar paket untuk dropdown (tanpa draft). Cadangan: baca semua. */
export async function loadPaketsLite(): Promise<LatihanPaket[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'latihan'),
        where('status', 'in', ['active', 'scheduled', 'finished', 'archived'])
      )
    )
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LatihanPaket)
  } catch (err) {
    console.warn('latihan terfilter gagal, baca semua', err)
  }
  const all = await getDocs(collection(db, 'latihan'))
  return all.docs.map((d) => ({ id: d.id, ...d.data() }) as LatihanPaket)
}

/** Hasil kuis untuk satu paket (peringkat per paket) — dibaca saat dibutuhkan saja. */
export async function loadAttemptsForPaket(latihanId: string): Promise<LatihanAttempt[]> {
  const snap = await getDocs(query(collection(db, 'attempts'), where('latihanId', '==', latihanId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LatihanAttempt)
}
