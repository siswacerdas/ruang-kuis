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
  createdAt?: any
}

export const DEFAULT_STUDENT_CLASS = '5A'
