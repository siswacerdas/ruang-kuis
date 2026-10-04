import { useEffect, useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useNavigate, Link } from 'react-router-dom'
import type { Student } from '../types/student'

export default function SiswaLogin() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadStudents()
  }, [])

  const loadStudents = async () => {
    setLoadingList(true)
    setError('')
    try {
      let snap
      try {
        snap = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')))
      } catch {
        snap = await getDocs(collection(db, 'students'))
      }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Student))
        .filter((s) => s.active !== false)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
      setStudents(list)
      if (list.length === 0) {
        setError('Daftar siswa masih kosong. Minta guru mengimpor data di Daftar Siswa.')
      }
    } catch (err) {
      console.error(err)
      setError('Gagal memuat daftar siswa. Coba refresh halaman.')
    } finally {
      setLoadingList(false)
    }
  }

  const selected = students.find((s) => s.id === selectedId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selected) {
      setError('Pilih nama kamu dari daftar')
      return
    }
    if (!password.trim()) {
      setError('Masukkan NISN sebagai password')
      return
    }

    setLoading(true)
    try {
      const em = selected.email.trim().toLowerCase()
      const cred = await signInWithEmailAndPassword(auth, em, password.trim())

      sessionStorage.setItem(
        'rk_student',
        JSON.stringify({
          studentId: selected.id,
          fullName: selected.fullName,
          nickname: selected.nickname || '',
          email: selected.email,
          nisn: selected.nisn,
          className: selected.className || '5A',
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
        setError('NISN salah, atau akun login belum dibuat guru. Coba lagi / hubungi guru.')
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama kamu</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loadingList || students.length === 0}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
              required
            >
              <option value="">
                {loadingList ? 'Memuat daftar...' : '— Pilih nama —'}
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.nickname ? ` (${s.nickname})` : ''}
                </option>
              ))}
            </select>
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
            <p className="text-[11px] text-gray-400 mt-1.5">
              Password = nomor NISN (bukan email).
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || loadingList || !selectedId}
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
