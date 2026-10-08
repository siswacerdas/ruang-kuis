/**
 * Akun guru/admin untuk login berbasis nama (tanpa mengingat email).
 *
 * Akun dummy / uji sistem TIDAK didefinisikan di sini.
 * Mereka adalah dokumen di koleksi `students` dengan `isDummy: true`
 * (atau nama/email mengandung "dummy") dan hanya muncul di tab Tes Sistem.
 */

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

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

export function normalizeStaffEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

/**
 * Cek cepat (sinkron) terhadap daftar staff di kode.
 * Dipakai form publik (OrtuDaftar) yang belum punya akses baca koleksi staff.
 */
export function isConfiguredStaffEmail(email: string): boolean {
  const e = normalizeStaffEmail(email)
  if (!e.includes('@')) return false
  return STAFF_ACCOUNTS.some((a) => a.email.toLowerCase() === e)
}

/**
 * Apakah email ini akun guru/admin?
 * - STAFF_ACCOUNTS (kode), atau
 * - dokumen aktif di koleksi `staff` (Firestore)
 *
 * Staff menang atas parents/students agar email bentrok tidak mengunci portal guru.
 */
export async function isStaffEmail(email: string): Promise<boolean> {
  const e = normalizeStaffEmail(email)
  if (!e.includes('@')) return false
  if (isConfiguredStaffEmail(e)) return true

  try {
    const snap = await getDocs(query(collection(db, 'staff'), where('email', '==', e)))
    return snap.docs.some((d) => {
      const data = d.data()
      return data.active !== false
    })
  } catch {
    // Rules / koleksi belum ada — andalkan STAFF_ACCOUNTS saja
    return false
  }
}
