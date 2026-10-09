import { useEffect, useState } from 'react'
import { PARENT_GUIDE_MAX_LOGINS } from '../types/parent'

interface OrtuGuideLightboxProps {
  parentName?: string
  loginCount: number
  onClose: () => void
}

const STEPS = [
  {
    badge: 'Selamat datang',
    title: 'Portal orang tua Ruang Kuis',
    body: 'Pantau belajar anak, lihat nilai kuis, peringkat, dan buat latihan khusus — aman dan hanya untuk anak Ayah/Bunda.',
    points: [
      'Satu akun dapat terhubung ke satu atau beberapa anak',
      'Data nilai berasal dari kuis di aplikasi, bukan rapor sekolah',
      'Panduan ini muncul di beberapa login pertama agar Ayah/Bunda familiar',
    ],
    accent: 'from-indigo-500 to-violet-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    ),
  },
  {
    badge: 'Pantau progress',
    title: 'Riwayat & nilai mapel',
    body: 'Setiap kali anak menyelesaikan kuis guru atau latihan mandiri, hasilnya bisa Ayah/Bunda lihat di sini.',
    points: [
      'Riwayat: skor, waktu selesai, dan durasi pengerjaan',
      'Nilai: rata-rata per mata pelajaran dari kuis saja',
      'Durasi membantu menilai kesungguhan anak dalam mengerjakan',
    ],
    accent: 'from-sky-500 to-cyan-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    badge: 'Kompetisi sehat',
    title: 'Peringkat privasi',
    body: 'Lihat posisi anak dibanding teman sekelas atau seluruh peserta, tanpa memaksa menampilkan nama orang lain.',
    points: [
      'Default: nama peserta lain disamarkan (Peserta #N)',
      'Filter kelas, mapel, atau paket kuis tertentu',
      'Opsional: tampilkan nama jika Ayah/Bunda membutuhkannya',
    ],
    accent: 'from-amber-500 to-orange-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    ),
  },
  {
    badge: 'Dukung di rumah',
    title: 'Buat latihan untuk anak',
    body: 'Susun paket latihan dari bank soal sekolah. Hanya anak Ayah/Bunda yang melihat dan mengerjakannya.',
    points: [
      'Pilih mapel, materi, dan jumlah soal (15/20)',
      'Tidak masuk daftar kuis guru atau siswa lain',
      'Anak mengerjakan lewat login siswa → Latihan Mandiri',
    ],
    accent: 'from-violet-500 to-fuchsia-600',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
    ),
  },
]

/**
 * Lightbox panduan — tampil selama loginCount ≤ PARENT_GUIDE_MAX_LOGINS (3).
 * Tutup hanya menutup sesi ini; login berikutnya tetap muncul sampai batas tercapai.
 */
export default function OrtuGuideLightbox({ parentName, loginCount, onClose }: OrtuGuideLightboxProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const remaining = Math.max(0, PARENT_GUIDE_MAX_LOGINS - loginCount)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !isLast) setStep((s) => s + 1)
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, isLast, onClose])

  const firstName = (parentName || 'Orang tua').split(/\s+/)[0]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ortu-guide-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/70"
        aria-label="Tutup panduan"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-indigo-900/20 overflow-hidden animate-[slideUp_0.28s_ease-out]">
        <div className={`relative bg-gradient-to-br ${current.accent} px-6 pt-6 pb-8 text-white`}>
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                {current.badge}
              </p>
              <p className="text-xs text-white/70 mt-1">
                Halo {firstName} · Login ke-{Math.min(loginCount, PARENT_GUIDE_MAX_LOGINS)} dari{' '}
                {PARENT_GUIDE_MAX_LOGINS}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition shrink-0"
              aria-label="Tutup"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative mt-5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {current.icon}
              </svg>
            </div>
            <h2 id="ortu-guide-title" className="text-xl font-bold leading-snug">
              {current.title}
            </h2>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 leading-relaxed">{current.body}</p>
          <ul className="mt-4 space-y-2.5">
            {current.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="leading-snug">{p}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-indigo-600' : 'w-1.5 bg-gray-200 hover:bg-gray-300'
                }`}
                aria-label={`Langkah ${i + 1}`}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Kembali
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition"
              >
                Nanti saja
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) onClose()
                else setStep((s) => s + 1)
              }}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm shadow-indigo-200"
            >
              {isLast ? 'Mulai jelajahi' : 'Lanjut'}
            </button>
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-4 leading-relaxed">
            {remaining > 0
              ? `Panduan ini masih muncul di ${remaining} login berikutnya.`
              : 'Ini login terakhir panduan otomatis ditampilkan.'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
