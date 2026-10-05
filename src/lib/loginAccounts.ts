/**
 * Akun guru/admin untuk login berbasis nama (tanpa mengingat email).
 *
 * Akun dummy / uji sistem TIDAK didefinisikan di sini.
 * Mereka adalah dokumen di koleksi `students` dengan `isDummy: true`
 * (atau nama/email mengandung "dummy") dan hanya muncul di tab Tes Sistem.
 */

export type StaffRole = 'admin' | 'guru'

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

export function roleLabel(role: StaffRole): string {
  if (role === 'admin') return 'Admin'
  return 'Guru'
}
