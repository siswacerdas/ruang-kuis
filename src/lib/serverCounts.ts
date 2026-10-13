/**
 * Hitung dokumen di server (agregasi) tanpa mengunduh isinya.
 *
 * Mengunduh seluruh koleksi `questions` hanya untuk menghitung jumlah memboroskan bacaan dan
 * bandwidth (soal lama membawa gambar base64). `getCountFromServer` hanya menagih ±1 bacaan
 * per 1.000 entri indeks dan tidak mengirim dokumen.
 *
 * Aman untuk koleksi ringan: bila agregasi gagal, jatuh ke getDocs lalu size.
 * Koleksi `questions` tidak pernah diunduh utuh — dokumennya sering berisi gambar.
 */
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from './firebase'

export async function countDocs(
  collectionName: string,
  ...constraints: QueryConstraint[]
): Promise<number> {
  const target = constraints.length
    ? query(collection(db, collectionName), ...constraints)
    : collection(db, collectionName)
  try {
    const snap = await getCountFromServer(target)
    return snap.data().count
  } catch (err) {
    console.warn('countDocs fallback', collectionName, err)
    // Soal sering menyimpan gambar. Jangan unduh dokumennya hanya untuk menghitung —
    // itu yang membuat halaman lain ikut berat setelah Bank Soal dibuka.
    if (collectionName === 'questions') throw err
    const snap = await getDocs(target)
    return snap.size
  }
}

/** Jalankan tugas async dengan batas paralel, supaya Firestore tidak kebanjiran. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
