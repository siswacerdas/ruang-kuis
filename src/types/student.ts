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
 * - Nama / email mengandung pola dummy|tes|uji (bukan nama siswa asli)
 */
export function isDummyStudent(s: {
  fullName?: string
  nickname?: string
  email?: string
  isDummy?: boolean
}): boolean {
  if (s.isDummy === true) return true

  const name = `${s.fullName || ''} ${s.nickname || ''}`.toLowerCase()
  const email = (s.email || '').toLowerCase()

  // Pola nama yang jelas akun uji (hindari false positive pada nama asli)
  if (/(dummy|siswa dummy|akun dummy|siswa uji|akun uji|tes sistem|test student)/.test(name.replace(/ /g, ' '))) {
    return true
  }
  if (/dummy/.test(name) || /^dummy[ ]/.test(name) || name.startsWith('dummy')) {
    return true
  }

  // Email uji: dummy@…, tes.xxx@…, test.xxx@…
  if (/^dummy[@.]/.test(email) || email.includes('dummy@') || email.startsWith('dummy')) {
    return true
  }
  if (/^(tes|test)[.+]/.test(email) || email.includes('@ruang-kuis.test')) {
    return true
  }

  return false
}
