/**
 * Hitung dokumen di server (agregasi) tanpa mengunduh isinya.
 *
 * Mengunduh seluruh koleksi `questions` hanya untuk menghitung jumlah memboroskan bacaan dan
 * bandwidth (soal lama membawa gambar base64). `getCountFromServer` hanya menagih ±1 bacaan
 * per 1.000 entri indeks dan tidak mengirim dokumen.
 *
 * Aman: bila agregasi gagal (offline, galat sementara), otomatis jatuh ke cara lama
 * (getDocs lalu size) sehingga angka tetap tampil.
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
    const snap = await getDocs(target)
    return snap.size
  }
}
