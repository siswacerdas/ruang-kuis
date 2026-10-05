import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Layout from '../components/Layout'
import type { LatihanAttempt } from '../types/question'

function toMillis(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return isNaN(t) ? null : t
  }
  const any = v as { toDate?: () => Date; seconds?: number }
  if (any?.toDate) return any.toDate().getTime()
  if (any?.seconds) return any.seconds * 1000
  return null
}

function formatShort(ms: number) {
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    attempts: 0,
    students: 0,
    avgPercent: 0,
    questions: 0,
    latihan: 0,
    topics: 0,
  })
  const [recent, setRecent] = useState<LatihanAttempt[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [aSnap, qSnap, lSnap, tSnap] = await Promise.all([
          getDocs(collection(db, 'attempts')).catch(() => null),
          getDocs(collection(db, 'questions')).catch(() => null),
          getDocs(collection(db, 'latihan')).catch(() => null),
          getDocs(collection(db, 'topics')).catch(() => null),
        ])

        const attempts = aSnap?.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt)) || []
        const n = attempts.length
        const students = new Set(attempts.map((a) => (a.studentName || '').trim().toLowerCase()).filter(Boolean)).size
        const avgPercent = n
          ? Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n)
          : 0

        let recentList = [...attempts]
        recentList.sort((a, b) => {
          const ta = toMillis(a.finishedAt) || 0
          const tb = toMillis(b.finishedAt) || 0
          return tb - ta
        })
        recentList = recentList.slice(0, 8)

        try {
          const ordered = await getDocs(query(collection(db, 'attempts'), orderBy('finishedAt', 'desc'), limit(8)))
          if (!ordered.empty) {
            recentList = ordered.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
          }
        } catch {
          /* keep client sort */
        }

        setStats({
          attempts: n,
          students,
          avgPercent,
          questions: qSnap?.size || 0,
          latihan: lSnap?.size || 0,
          topics: tSnap?.size || 0,
        })
        setRecent(recentList)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <Layout title="Dashboard" subtitle="Ringkasan progress kuis dan akses cepat fitur admin">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 md:p-8 text-white mb-6 shadow-sm">
        <h2 className="text-xl md:text-2xl font-semibold mb-1">Selamat datang, Admin!</h2>
        <p className="text-indigo-100 text-sm md:text-base">
          Pantau progress siswa dari hasil kuis, kelola soal, paket latihan, dan laporan di satu tempat.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Pengerjaan kuis', value: stats.attempts, to: '/laporan', tint: 'text-indigo-600' },
          { label: 'Siswa unik', value: stats.students, to: '/laporan', tint: 'text-sky-600' },
          {
            label: 'Rata-rata skor',
            value: stats.attempts ? `${stats.avgPercent}%` : '—',
            to: '/laporan',
            tint: 'text-emerald-600',
          },
          { label: 'Paket latihan', value: stats.latihan, to: '/latihan-soal', tint: 'text-violet-600' },
          { label: 'Materi bank', value: stats.topics, to: '/bank-soal', tint: 'text-amber-600' },
          { label: 'Soal', value: stats.questions, to: '/bank-soal', tint: 'text-rose-600' },
        ].map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-indigo-200 hover:shadow-md transition"
          >
            <p className="text-xs text-gray-400">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${c.tint}`}>
              {loading ? '…' : c.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Pengerjaan terbaru</h3>
            <Link to="/laporan" className="text-xs font-medium text-indigo-600 hover:underline">
              Buka laporan →
            </Link>
          </div>
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-400">Memuat...</p>
          ) : recent.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              Belum ada attempt. Setelah siswa mengerjakan kuis, data muncul di sini.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((a) => {
                const fin = toMillis(a.finishedAt)
                return (
                  <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.studentName}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {a.latihanTitle || 'Latihan'}
                        {a.studentClass ? ` · ${a.studentClass}` : ''}
                        {fin ? ` · ${formatShort(fin)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        (a.percent || 0) >= 70
                          ? 'text-emerald-600'
                          : (a.percent || 0) >= 40
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {a.percent ?? 0}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-3">
          <Link
            to="/laporan"
            className="block bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:border-emerald-200 hover:shadow-md transition"
          >
            <p className="text-sm font-semibold text-gray-900">Laporan & progress</p>
            <p className="text-xs text-gray-500 mt-1">
              Tren skor, waktu pengerjaan, capaian TP, dan profil per siswa
            </p>
          </Link>
          <Link
            to="/latihan-soal"
            className="block bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:border-violet-200 hover:shadow-md transition"
          >
            <p className="text-sm font-semibold text-gray-900">Paket latihan</p>
            <p className="text-xs text-gray-500 mt-1">Buat paket, token, jadwal, dan lihat hasil per paket</p>
          </Link>
          <Link
            to="/bank-soal"
            className="block bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <p className="text-sm font-semibold text-gray-900">Bank soal</p>
            <p className="text-xs text-gray-500 mt-1">Materi, TP, stimulus, dan import soal</p>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <Link
          to="/bank-soal"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Bank Soal</h3>
          <p className="mt-1 text-sm text-gray-500">Kelola materi & soal per mata pelajaran (pool untuk ATS/AS)</p>
        </Link>

        <Link
          to="/latihan-soal"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Latihan Soal</h3>
          <p className="mt-1 text-sm text-gray-500">Buat paket manual/otomatis, atur token & jadwal</p>
        </Link>

        <Link
          to="/daftar-siswa"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Daftar Siswa</h3>
          <p className="mt-1 text-sm text-gray-500">Data kelas 5A, import CSV, dan buat akun login (email + NISN)</p>
        </Link>

        <Link
          to="/tujuan-pembelajaran"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M9 12h6m-6 4h6M7 4h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Tujuan Pembelajaran</h3>
          <p className="mt-1 text-sm text-gray-500">Master TP per mapel, impor JSON, dan ubah rumusan secara manual</p>
        </Link>

        <Link
          to="/laporan"
          className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Laporan</h3>
          <p className="mt-1 text-sm text-gray-500">Rekap skor, capaian TP, dan progress siswa</p>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Tips cepat
        </h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">1.</span>
            Import siswa di <strong>Daftar Siswa</strong>, lalu klik <strong>Buat akun login</strong> (password =
            NISN).
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">2.</span>
            Isi <strong>Bank Soal</strong> (materi + TP), lalu buat paket di <strong>Latihan Soal</strong>.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-500 font-medium">3.</span>
            Siswa buka <code className="bg-gray-100 px-1 rounded text-xs">/siswa</code> setelah login → kerjakan kuis
            → hasil masuk <strong>Laporan</strong>.
          </li>
        </ul>
      </div>
    </Layout>
  )
}
