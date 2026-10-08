import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import OrtuLayout from '../components/OrtuLayout'

const META: Record<string, { title: string; body: string }> = {
  '/ortu/nilai': {
    title: 'Nilai',
    body: 'Ringkasan skor per mata pelajaran dari kuis dan latihan (bukan nilai proyek Input Nilai admin) akan tampil di sini.',
  },
  '/ortu/peringkat': {
    title: 'Peringkat',
    body: 'Posisi anak di paket kuis (peringkat + total peserta, tanpa wajib menampilkan nama siswa lain) sedang disiapkan.',
  },
  '/ortu/buat-kuis': {
    title: 'Buat kuis',
    body: 'Orang tua akan bisa membuat paket latihan untuk anak dengan generator soal yang sama seperti guru. Menyusul di fase berikutnya.',
  },
}

export default function OrtuPlaceholder() {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState<ParentSession | null>(null)
  const meta = META[location.pathname] || { title: 'Portal', body: 'Fitur menyusul.' }

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
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <OrtuLayout title={meta.title} parentName={session.fullName}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-900">{meta.title}</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{meta.body}</p>
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          Halaman ini masih placeholder. Beranda dan Riwayat sudah aktif.
        </div>
      </div>
    </OrtuLayout>
  )
}
