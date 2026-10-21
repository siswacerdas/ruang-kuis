import { useState } from 'react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import Layout from '../components/Layout'

const MIN_LENGTH = 8

function authErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Password saat ini salah.'
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'
    case 'auth/weak-password':
      return 'Password baru terlalu lemah. Gunakan kombinasi yang lebih kuat.'
    case 'auth/requires-recent-login':
      return 'Sesi sudah lama. Keluar, masuk kembali, lalu ulangi.'
    case 'auth/network-request-failed':
      return 'Koneksi bermasalah. Periksa internet lalu coba lagi.'
    default:
      return 'Gagal mengganti password. Coba lagi.'
  }
}

export default function AdminGantiPassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const email = auth.currentUser?.email || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const user = auth.currentUser
    if (!user || !user.email) {
      setError('Sesi login tidak ditemukan. Silakan masuk kembali.')
      return
    }
    if (!currentPassword) {
      setError('Masukkan password saat ini.')
      return
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Password baru minimal ${MIN_LENGTH} karakter.`)
      return
    }
    if (newPassword === currentPassword) {
      setError('Password baru harus berbeda dari password saat ini.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak sama.')
      return
    }

    setSaving(true)
    try {
      // Verifikasi ulang password lama (wajib oleh Firebase untuk operasi sensitif)
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setSuccess('Password berhasil diganti. Gunakan password baru saat login berikutnya.')
    } catch (err: any) {
      console.error(err)
      setError(authErrorMessage(err?.code))
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm transition'

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH

  return (
    <Layout title="Ganti Password" subtitle="Ubah password akun admin yang sedang login">
      <div className="max-w-lg">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Akun</p>
            <p className="text-sm font-medium text-slate-900 mt-1 break-all">{email || '—'}</p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm px-3.5 py-2.5">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password saat ini</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password baru</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={inputClass}
            />
            <p className={`text-[11px] mt-1.5 ${tooShort ? 'text-red-600' : 'text-gray-400'}`}>
              Minimal {MIN_LENGTH} karakter.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ulangi password baru
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={inputClass}
            />
            {mismatch && <p className="text-[11px] text-red-600 mt-1.5">Password belum sama.</p>}
          </div>

          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            {showPassword ? 'Sembunyikan' : 'Tampilkan'} password
          </button>

          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-xl transition"
          >
            {saving ? 'Menyimpan…' : 'Ganti password'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
