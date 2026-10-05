/**
 * Daftar akun non-siswa untuk login berbasis nama (tanpa mengingat email).
 *
 * - STAFF_ACCOUNTS  → tab Guru (admin / guru)
 * - TEST_ACCOUNTS   → tab Tes Sistem (dummy / QA)
 *
 * Email tetap dipakai di balik layar untuk Firebase Auth.
 * Tambah / ubah entri di sini, atau simpan dokumen di koleksi Firestore `staff`
 * (field: displayName, email, role, active) agar muncul otomatis.
 */

export type StaffRole = 'admin' | 'guru' | 'tester'

export interface NamedAccount {
  id: string
  displayName: string
  email: string
  role: StaffRole
  /** Petunjuk singkat di UI (opsional) */
  hint?: string
}

/** Guru & admin produksi — sesuaikan email dengan akun Firebase Auth yang sudah dibuat */
export const STAFF_ACCOUNTS: NamedAccount[] = [
  {
    id: 'admin-arif',
    displayName: 'Arif Azwar Anas',
    email: 'arif.azwar79@gmail.com',
    role: 'admin',
    hint: 'Admin utama',
  },
]

/**
 * Akun uji sistem — tidak dicampur dengan daftar guru.
 * Buat dulu di Firebase Authentication (email + password),
 * lalu sesuaikan email di bawah.
 */
export const TEST_ACCOUNTS: NamedAccount[] = [
  {
    id: 'test-admin',
    displayName: 'Tes Admin',
    email: 'tes.admin@ruang-kuis.id',
    role: 'tester',
    hint: 'Login ke dashboard admin (uji)',
  },
  {
    id: 'test-guru',
    displayName: 'Tes Guru',
    email: 'tes.guru@ruang-kuis.id',
    role: 'tester',
    hint: 'Login ke dashboard admin (uji)',
  },
]

export function roleLabel(role: StaffRole): string {
  if (role === 'admin') return 'Admin'
  if (role === 'guru') return 'Guru'
  return 'Tester'
}
