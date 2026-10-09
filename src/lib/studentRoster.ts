/**
 * Baca data siswa untuk halaman login / pendaftaran ortu / portal ortu lewat `studentRoster`.
 *
 * Koleksi `students` berisi NISN (= password login) dan email ortu, sehingga hanya admin yang
 * boleh membacanya (lihat firestore.rules). `studentRoster` adalah salinan minimal (nama, kelas,
 * email login) yang dibuat otomatis oleh Cloud Function `syncStudentRoster`.
 *
 * Aman di semua tahap deploy:
 *  - rules lama (roster belum diizinkan)  -> roster DITOLAK  -> jatuh ke `students`
 *  - roster belum terisi                  -> roster KOSONG   -> jatuh ke `students`
 *  - rules baru + roster terisi           -> roster dipakai; `students` tidak disentuh
 * Bila keduanya gagal, galat roster dilempar agar UI menampilkan pesan gagal yang jelas.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore'
import { db } from './firebase'

async function rosterThenStudents(
  fromRoster: () => Promise<QuerySnapshot>,
  fromStudents: () => Promise<QuerySnapshot>
): Promise<QuerySnapshot> {
  let rosterSnap: QuerySnapshot | null = null
  let rosterErr: unknown = null
  try {
    rosterSnap = await fromRoster()
    if (!rosterSnap.empty) return rosterSnap
  } catch (err) {
    rosterErr = err
  }
  try {
    return await fromStudents()
  } catch (err) {
    if (rosterSnap) return rosterSnap // roster terbaca tapi kosong; `students` sudah dikunci
    throw rosterErr ?? err
  }
}

/** Seluruh siswa (urut nama) untuk dropdown login / form pendaftaran. */
export function getRosterSnapshot(): Promise<QuerySnapshot> {
  return rosterThenStudents(
    async () => {
      try {
        return await getDocs(query(collection(db, 'studentRoster'), orderBy('fullName', 'asc')))
      } catch {
        return await getDocs(collection(db, 'studentRoster'))
      }
    },
    async () => {
      try {
        return await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
      } catch {
        return await getDocs(collection(db, 'students'))
      }
    }
  )
}

/** Cari siswa berdasarkan email login (dipakai deteksi peran & sesi siswa). */
export function getRosterByEmail(email: string): Promise<QuerySnapshot> {
  return rosterThenStudents(
    () => getDocs(query(collection(db, 'studentRoster'), where('email', '==', email))),
    () => getDocs(query(collection(db, 'students'), where('email', '==', email)))
  )
}

/** Satu siswa berdasarkan id dokumen (portal ortu menampilkan nama/kelas anak). */
export async function getRosterDoc(id: string): Promise<DocumentSnapshot> {
  let rosterSnap: DocumentSnapshot | null = null
  let rosterErr: unknown = null
  try {
    rosterSnap = await getDoc(doc(db, 'studentRoster', id))
    if (rosterSnap.exists()) return rosterSnap
  } catch (err) {
    rosterErr = err
  }
  try {
    return await getDoc(doc(db, 'students', id))
  } catch (err) {
    if (rosterSnap) return rosterSnap
    throw rosterErr ?? err
  }
}
