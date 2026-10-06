export interface Student {
  id?: string
  fullName: string
  nickname?: string
  /** Email fiktif untuk login Firebase Auth (bukan email orang tua) */
  email: string
  nisn: string
  /**
   * Email orang tua / wali — dipakai untuk mengirim ringkasan hasil kuis.
   * Opsional; jika kosong, notifikasi email dilewati.
   */
  parentEmail?: string
  /** Kelas tetap 5A untuk fase ini */
  className: string
  /** UID Firebase Auth setelah akun dibuat */
  authUid?: string
  active: boolean
  /**
   * Akun uji / dummy — muncul di tab Tes Sistem, tidak di daftar siswa login.
   * Bisa juga dideteksi otomatis lewat nama/email (lihat isDummyStudent).
   */
  isDummy?: boolean
  createdAt?: any
}

export const DEFAULT_STUDENT_CLASS = '5A'

/** Validasi format email sederhana (untuk parentEmail). */
export function isValidEmail(value: string | undefined | null): boolean {
  if (!value) return false
  const e = value.trim().toLowerCase()
  return e.includes('@') && e.includes('.') && e.length >= 5 && e.length <= 120 && !e.includes(' ')
}

/**
 * Apakah data siswa ini akun dummy / uji sistem?
 * - Flag eksplisit `isDummy: true`, atau
 * - Nama / email mengandung pola dummy / tes / uji
 */
export function isDummyStudent(s: {
  fullName?: string
  nickname?: string
  email?: string
  isDummy?: boolean
}): boolean {
  if (s.isDummy === true) return true

  const name = `${s.fullName || ''} ${s.nickname || ''}`.toLowerCase().trim()
  const email = (s.email || '').toLowerCase().trim()

  if (name.includes('dummy')) return true
  if (/\bsiswa uji\b|\bakun uji\b|\btes sistem\b|\btest student\b/.test(name.replace(/\s+/g, ' '))) {
    return true
  }
  if (/\bsiswa uji\b|\bakun uji\b|\btes sistem\b|\btest student\b/.test(name)) return true

  if (email.includes('dummy')) return true
  if (email.startsWith('tes.') || email.startsWith('test.')) return true
  if (email.includes('@ruang-kuis.test')) return true

  return false
}
