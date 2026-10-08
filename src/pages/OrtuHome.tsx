import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { clearParentSession, ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'

/**
 * Beranda orang tua — placeholder Fase A.
 * Fase B: panduan first-login, pengumuman, ringkasan, riwayat.
 */
export default function OrtuHome() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureParentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login?tab=ortu', { replace: true })
        return
      }
      setSession(s)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleLogout = async () => {
    clearParentSession()
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    navigate('/login?tab=ortu', { replace: true })
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              RK
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">Ruang Kuis · Orang Tua</p>
              <p className="text-[11px] text-gray-400 truncate">{session.fullName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 shrink-0"
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h1 className="text-lg font-bold text-gray-900">Selamat datang, {session.fullName}</h1>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Akun orang tua sudah aktif. Fitur lengkap (riwayat anak, nilai, peringkat, buat kuis)
            sedang disiapkan. Sementara ini pastikan login dan tautan anak sudah benar.
          </p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <dt className="text-[11px] text-gray-400">Email</dt>
              <dd className="font-medium text-gray-800 break-all">{session.email}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <dt className="text-[11px] text-gray-400">WhatsApp</dt>
              <dd className="font-medium text-gray-800">{session.whatsapp || '—'}</dd>
            </div>
            <div className="rounded-xl bg-indigo-50 px-3 py-2 sm:col-span-2">
              <dt className="text-[11px] text-indigo-600/80">Anak terhubung</dt>
              <dd className="font-medium text-indigo-900">
                {session.studentIds.length} siswa (ID: {session.studentIds.join(', ') || '—'})
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
          <p className="font-medium mb-1">Tahap pengembangan</p>
          <p>
            Beranda ini adalah placeholder Fase A. Berikutnya: panduan penggunaan, riwayat
            pengerjaan + durasi, ringkasan nilai, dan peringkat.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Halaman login
          </Link>
        </p>
      </main>
    </div>
  )
}
