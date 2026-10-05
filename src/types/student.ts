export interface Student {
  id?: string
  fullName: string
  nickname?: string
  email: string
  nisn: string
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
  if (/siswa uji|akun uji|tes sistem|test student/.test(name.replace(/ /g, ' '))) {
    return true
  }
  // "siswa uji", "akun uji", "tes sistem"
  if (/siswa uji|akun uji|tes sistem|test student/.test(name)) return true

  if (email.includes('dummy')) return true
  if (email.startsWith('tes.') || email.startsWith('test.')) return true
  if (email.includes('@ruang-kuis.test')) return true

  return false
}
