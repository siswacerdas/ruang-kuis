import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Layout from '../components/Layout'
import type { LatihanAttempt } from '../types/question'
import { subscribePendingParentCount } from '../lib/adminNotifications'

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

const QUICK_LINKS = [
  {
    to: '/materi',
    title: 'Materi',
    desc: 'Presentasi PDF per mata pelajaran',
    iconBg: 'bg-indigo-50 text-indigo-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    ),
  },
  {
    to: '/bank-soal',
    title: 'Bank Soal',
    desc: 'Materi, soal, dan import per mapel',
    iconBg: 'bg-violet-50 text-violet-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    ),
  },
  {
    to: '/latihan-soal',
    title: 'Latihan Soal',
    desc: 'Paket, token, jadwal, dan hasil',
    iconBg: 'bg-sky-50 text-sky-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    ),
  },
  {
    to: '/laporan',
    title: 'Laporan',
    desc: 'Skor, capaian TP, progress siswa',
    iconBg: 'bg-emerald-50 text-emerald-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    to: '/tujuan-pembelajaran',
    title: 'Tujuan Pembelajaran',
    desc: 'Master TP per mapel',
    iconBg: 'bg-amber-50 text-amber-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 12h6m-6 4h6M7 4h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
    ),
  },
  {
    to: '/input-nilai',
    title: 'Input Nilai',
    desc: 'Penilaian aktivitas/proyek tertaut TP + AI',
    iconBg: 'bg-fuchsia-50 text-fuchsia-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    ),
  },
  {
    to: '/daftar-siswa',
    title: 'Daftar Siswa',
    desc: 'Data kelas, import, akun login',
    iconBg: 'bg-rose-50 text-rose-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    ),
  },
] as const

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
  const [pendingOrtu, setPendingOrtu] = useState(0)

  useEffect(() => {
    const unsub = subscribePendingParentCount(setPendingOrtu)
    return () => unsub()
  }, [])

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
        const students = new Set(
          attempts.map((a) => (a.studentName || '').trim().toLowerCase()).filter(Boolean)
        ).size
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
          const ordered = await getDocs(
            query(collection(db, 'attempts'), orderBy('finishedAt', 'desc'), limit(8))
          )
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

  const metrics = [
    { label: 'Pengerjaan', value: stats.attempts, to: '/laporan' },
    { label: 'Siswa unik', value: stats.students, to: '/laporan' },
    {
      label: 'Rata-rata skor',
      value: stats.attempts ? `${stats.avgPercent}%` : '—',
      to: '/laporan',
    },
    { label: 'Paket latihan', value: stats.latihan, to: '/latihan-soal' },
    { label: 'Materi bank', value: stats.topics, to: '/bank-soal' },
    { label: 'Soal', value: stats.questions, to: '/bank-soal' },
  ]

  return (
    <Layout title="Dashboard" subtitle="Ringkasan aktivitas dan akses cepat">
      <div className="space-y-6">
        <header className="border-b border-slate-200/80 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight mt-1">
            Ringkasan ruang kuis
          </h2>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Pantau pengerjaan siswa, kelola materi dan paket latihan, lalu tinjau laporan di satu tempat.
          </p>
        </header>

        {pendingOrtu > 0 && (
          <Link
            to="/pengajuan-ortu"
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 hover:bg-amber-100/80 transition"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-200/80 text-amber-900 text-sm font-bold shrink-0">
              {pendingOrtu}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950">
                Pengajuan akun orang tua menunggu persetujuan
              </p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                Buka menu Pengajuan Ortu untuk menyetujui atau menolak.
              </p>
            </div>
            <span className="text-amber-700 text-sm font-medium shrink-0">Tinjau →</span>
          </Link>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {metrics.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-slate-300 hover:shadow-sm transition"
            >
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{c.label}</p>
              <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">
                {loading ? '…' : c.value}
              </p>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Pengerjaan terbaru</h3>
              <Link
                to="/laporan"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
              >
                Lihat laporan
              </Link>
            </div>
            {loading ? (
              <p className="p-10 text-center text-sm text-slate-400">Memuat…</p>
            ) : recent.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-400">
                Belum ada pengerjaan. Data muncul setelah siswa menyelesaikan kuis.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((a) => {
                  const fin = toMillis(a.finishedAt)
                  const pct = a.percent ?? 0
                  return (
                    <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{a.studentName}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {a.latihanTitle || 'Latihan'}
                          {a.studentClass ? ` · ${a.studentClass}` : ''}
                          {fin ? ` · ${formatShort(fin)}` : ''}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums shrink-0 ${
                          pct >= 70
                            ? 'text-emerald-600'
                            : pct >= 40
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {pct}%
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-0.5">
              Akses cepat
            </p>
            {QUICK_LINKS.slice(0, 4).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:shadow-sm transition group"
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{item.desc}</p>
                </div>
                <svg
                  className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Semua modul
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QUICK_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.iconBg}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {item.icon}
                    </svg>
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Alur kerja singkat</h3>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2.5">
              <span className="text-slate-400 font-medium tabular-nums w-4 shrink-0">1</span>
              <span>
                Import siswa di <strong className="font-medium text-slate-800">Daftar Siswa</strong>, lalu buat
                akun login (password = NISN).
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-slate-400 font-medium tabular-nums w-4 shrink-0">2</span>
              <span>
                Siapkan <strong className="font-medium text-slate-800">Bank Soal</strong> dan{' '}
                <strong className="font-medium text-slate-800">Materi</strong> presentasi, lalu buat paket di{' '}
                <strong className="font-medium text-slate-800">Latihan Soal</strong>.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-slate-400 font-medium tabular-nums w-4 shrink-0">3</span>
              <span>
                Siswa masuk lewat <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/siswa</code>{' '}
                → kerjakan kuis → hasil masuk <strong className="font-medium text-slate-800">Laporan</strong>.
              </span>
            </li>
          </ol>
        </section>
      </div>
    </Layout>
  )
}
