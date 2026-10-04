import { useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useNavigate, Link } from 'react-router-dom'
import {
  resolveLatihanStatus,
  type LatihanPaket,
} from '../types/question'

export default function KerjakanEntry() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [studentClass, setStudentClass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const t = token.trim().toUpperCase()
    if (!t) {
      setError('Masukkan token latihan')
      return
    }
    if (!name.trim()) {
      setError('Masukkan nama lengkap')
      return
    }

    setLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'latihan'), where('token', '==', t))
      )
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

      // Simpan identitas sesi di sessionStorage
      sessionStorage.setItem(
        'rk_session',
        JSON.stringify({
          latihanId: paket.id,
          studentName: name.trim(),
          studentClass: studentClass.trim() || undefined,
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

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ruang Kuis</h1>
          <p className="text-sm text-gray-500 mt-1">Masuk dengan token dari guru</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama lengkap</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              placeholder="Nama kamu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Kelas <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={studentClass}
              onChange={(e) => setStudentClass(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              placeholder="Contoh: 5A"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 rounded-xl transition shadow-sm shadow-indigo-200"
          >
            {loading ? 'Memeriksa...' : 'Mulai Latihan'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/login" className="hover:text-indigo-600">Login admin</Link>
        </p>
      </div>
    </div>
  )
}
