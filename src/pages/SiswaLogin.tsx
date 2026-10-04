import { useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useNavigate, Link } from 'react-router-dom'
import type { Student } from '../types/student'

export default function SiswaLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const em = email.trim().toLowerCase()
      const cred = await signInWithEmailAndPassword(auth, em, password)

      // Pastikan email ini terdaftar sebagai siswa aktif
      const snap = await getDocs(
        query(collection(db, 'students'), where('email', '==', em))
      )
      if (snap.empty) {
        await signOut(auth)
        setError('Akun ini bukan akun siswa. Gunakan login admin di /login.')
        return
      }
      const student = { id: snap.docs[0].id, ...snap.docs[0].data() } as Student
      if (student.active === false) {
        await signOut(auth)
        setError('Akun siswa dinonaktifkan. Hubungi guru.')
        return
      }

      sessionStorage.setItem(
        'rk_student',
        JSON.stringify({
          studentId: student.id,
          fullName: student.fullName,
          nickname: student.nickname || '',
          email: student.email,
          nisn: student.nisn,
          className: student.className || '5A',
          authUid: cred.user.uid,
        })
      )

      navigate('/kerjakan/token')
    } catch (err: any) {
      console.error(err)
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('Email atau password (NISN) salah')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan. Coba lagi nanti.')
      } else {
        setError('Gagal masuk. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Login Siswa</h1>
          <p className="text-sm text-gray-500 mt-1">Kelas 5A · Ruang Kuis</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              placeholder="nama@ruang-kuis.id"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password (NISN)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none font-mono"
              placeholder="NISN kamu"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
          >
            {loading ? 'Memeriksa...' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Guru? <Link to="/login" className="text-indigo-600 hover:underline">Login admin</Link>
        </p>
      </div>
    </div>
  )
}
