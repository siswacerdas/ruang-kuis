/**
 * Baca data siswa untuk halaman login / pendaftaran ortu / portal ortu lewat `studentRoster`.
 *
 * Koleksi `students` berisi NISN (= password login) dan email ortu, sehingga hanya admin yang
 * boleh membacanya (lihat firestore.rules). `studentRoster` adalah salinan minimal (nama, kelas,
 * email login) yang dibuat otomatis oleh Cloud Function `syncStudentRoster`.
 *
 * Masa transisi: bila roster belum terisi, jatuh kembali ke `students` supaya login tidak mati
 * sebelum fungsi dideploy / backfill dijalankan. Setelah rules dikunci, fallback itu gagal
 * (ditolak) dan diabaikan — aman.
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

/** Seluruh siswa (urut nama) untuk dropdown login / form pendaftaran. */
export async function getRosterSnapshot(): Promise<QuerySnapshot> {
  let snap: QuerySnapshot
  try {
    snap = await getDocs(query(collection(db, 'studentRoster'), orderBy('fullName', 'asc')))
  } catch {
    snap = await getDocs(collection(db, 'studentRoster'))
  }
  if (snap.empty) {
    try {
      return await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
    } catch {
      /* transisi selesai / ditolak rules */
    }
  }
  return snap
}

/** Cari siswa berdasarkan email login (dipakai deteksi peran & sesi siswa). */
export async function getRosterByEmail(email: string): Promise<QuerySnapshot> {
  const snap = await getDocs(query(collection(db, 'studentRoster'), where('email', '==', email)))
  if (!snap.empty) return snap
  try {
    return await getDocs(query(collection(db, 'students'), where('email', '==', email)))
  } catch {
    return snap
  }
}

/** Satu siswa berdasarkan id dokumen (portal ortu menampilkan nama/kelas anak). */
export async function getRosterDoc(id: string): Promise<DocumentSnapshot> {
  const snap = await getDoc(doc(db, 'studentRoster', id))
  if (snap.exists()) return snap
  try {
    return await getDoc(doc(db, 'students', id))
  } catch {
    return snap
  }
}
