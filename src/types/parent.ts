/**
 * Tipe data akun orang tua / wali — Ruang Kuis
 * @see docs/PARENT_ACCOUNT.md
 */

export type ParentRequestStatus = 'pending' | 'approved' | 'rejected'
export type PasswordResetStatus = 'pending' | 'done' | 'rejected'
export type AdminNotificationType =
  | 'parent_request'
  | 'parent_password_reset'
  | 'student_attempt'

/** Pengajuan akun orang tua (belum / sudah diproses admin) */
export interface ParentRequest {
  id?: string
  fullName: string
  whatsapp: string
  email: string
  /**
   * Password sementara — HANYA sampai approve.
   * Dihapus dari dokumen saat status → approved / rejected.
   * Jangan log / export field ini.
   */
  tempPassword?: string
  studentIds: string[]
  studentNames: string[]
  status: ParentRequestStatus
  note?: string
  createdAt?: unknown
  reviewedAt?: unknown
  reviewedBy?: string
}

/** Profil orang tua setelah disetujui */
export interface Parent {
  id?: string
  fullName: string
  whatsapp: string
  email: string
  authUid: string
  /** Satu atau lebih anak (students.id) */
  studentIds: string[]
  active: boolean
  mustChangePassword?: boolean
  /** Sudah melihat panduan first-login */
  guideSeenAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export interface ParentPasswordReset {
  id?: string
  parentId?: string
  email: string
  whatsapp: string
  status: PasswordResetStatus
  createdAt?: unknown
  reviewedAt?: unknown
  reviewedBy?: string
}

export interface AdminNotification {
  id?: string
  type: AdminNotificationType
  title: string
  body?: string
  refCollection?: string
  refId?: string
  read: boolean
  createdAt?: unknown
}

/** Sesi client orang tua (localStorage) */
export interface ParentSession {
  parentId: string
  fullName: string
  email: string
  whatsapp: string
  studentIds: string[]
  authUid: string
  mustChangePassword?: boolean
  guideSeenAt?: string | null
}

export const PARENT_SESSION_KEY = 'rk_parent'

/** Normalisasi nomor WA Indonesia → digits only, awalan 62 jika 08… */
export function normalizeWhatsapp(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  if (d.startsWith('8') && d.length >= 9) d = '62' + d
  return d
}

export function isValidWhatsapp(raw: string): boolean {
  const d = normalizeWhatsapp(raw)
  // 62 + 8… total 11–15 digit
  return /^62[0-9]{9,13}$/.test(d)
}

/** Data dummy siswa untuk uji live akun ortu — HAPUS di akhir fitur */
export const DUMMY_PARENT_TEST_STUDENT = {
  fullName: 'Siswa Uji Ortu',
  nickname: 'Uji Ortu',
  email: 'uji.ortu@ruang-kuis.test',
  nisn: '9999000001',
  className: '5A' as const,
  isDummy: true,
  active: true,
} as const
