import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { useNavigate, Link } from 'react-router-dom'
import { resolveLatihanStatus, type LatihanPaket } from '../types/question'

interface StudentSession {
  studentId: string
  fullName: string
  nickname?: string
  email: string
  className?: string
}

export default function KerjakanEntry() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_student')
    if (!raw) {
      navigate('/kerjakan')
      return
    }
    try {
      setStudent(JSON.parse(raw))
    } catch {
      navigate('/kerjakan')
    }
  }, [navigate])

  const handleLogout = async () => {
    sessionStorage.removeItem('rk_student')
    sessionStorage.removeItem('rk_session')
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    navigate('/kerjakan')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!student) return
    setError('')
    const t = token.trim().toUpperCase()
    if (!t) {
      setError('Masukkan token latihan')
      return
    }

    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'latihan'), where('token', '==', t)))
      if (snap.empty) {
        setError('Token tidak ditemukan. Periksa lagi dengan guru.')
        return
      }
      const docSnap = snap.docs[0]
      const paket = { id: docSnap.id, ...docSnap.data() } as LatihanPaket

      if (paket.status === 'draft' || paket.status === 'archived') {
        setError('Latihan ini belum dibuka atau sudah diarsipkan.')
        return
      }
      const resolved = resolveLatihanStatus(paket)
      if (resolved === 'scheduled') {
        setError('Latihan belum dimulai. Tunggu sesuai jadwal.')
        return
      }
      if (resolved === 'finished') {
        setError('Waktu latihan sudah berakhir.')
        return
      }

      sessionStorage.setItem(
        'rk_session',
        JSON.stringify({
          latihanId: paket.id,
          studentName: student.fullName,
          studentId: student.studentId,
          studentClass: student.className || '5A',
          token: t,
        })
      )
      navigate(`/kerjakan/${paket.id}`)
    } catch (err) {
      console.error(err)
      setError('Gagal memeriksa token. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Masukkan Token</h1>
          <p className="text-sm text-gray-500 mt-1">Token dari guru untuk latihan hari ini</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {student.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{student.fullName}</p>
              <p className="text-xs text-gray-500 truncate">
                {student.nickname ? `${student.nickname} · ` : ''}
                Kelas {student.className || '5A'}
              </p>
            </div>
            <button type="button" onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-600 shrink-0">
              Keluar
            </button>
          </div>

          <Link
            to="/kerjakan/riwayat"
            className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 hover:border-indigo-200 hover:bg-indigo-50/50 transition"
          >
            <span className="font-medium">Riwayat kuis saya</span>
            <span className="text-indigo-600 text-xs font-semibold">Lihat →</span>
          </Link>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Token latihan</label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none font-mono tracking-widest text-center text-lg"
                placeholder="ABC123"
                maxLength={12}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition"
            >
              {loading ? 'Memeriksa...' : 'Mulai Latihan'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/login" className="hover:text-indigo-600">Login admin</Link>
        </p>
      </div>
    </div>
  )
}
