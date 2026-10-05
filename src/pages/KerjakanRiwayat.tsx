import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureStudentSession, type StudentSession } from '../lib/studentSession'
import { Link, useNavigate } from 'react-router-dom'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} mnt ${s} dtk` : `${m} mnt`
}

const CARD_GRADIENTS = [
  'from-indigo-500 via-violet-500 to-purple-600',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-fuchsia-500 via-pink-500 to-rose-500',
  'from-violet-500 via-purple-500 to-indigo-600',
]

function gradientFor(id?: string) {
  let h = 0
  const s = id || 'x'
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % CARD_GRADIENTS.length
  return CARD_GRADIENTS[h]
}

type SortKey = 'newest' | 'oldest' | 'score-high' | 'score-low'

export default function KerjakanRiwayat() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureStudentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login', { replace: true })
        return
      }
      setStudent(s)
      loadAttempts(s)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const loadAttempts = async (s: StudentSession) => {
    setLoading(true)
    try {
      const byId: LatihanAttempt[] = []
      const byName: LatihanAttempt[] = []

      if (s.studentId) {
        try {
          const snap = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', s.studentId))
          )
          snap.docs.forEach((d) => byId.push({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch (err) {
          console.warn('query studentId', err)
        }
      }

      try {
        const snap = await getDocs(
          query(collection(db, 'attempts'), where('studentName', '==', s.fullName))
        )
        snap.docs.forEach((d) => byName.push({ id: d.id, ...d.data() } as LatihanAttempt))
      } catch (err) {
        console.warn('query studentName', err)
      }

      const map = new Map<string, LatihanAttempt>()
      ;[...byId, ...byName].forEach((a) => {
        if (a.id) map.set(a.id, a)
      })
      setAttempts([...map.values()])

      try {
        const pSnap = await getDocs(collection(db, 'latihan'))
        setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
      } catch (err) {
        console.warn('load latihan', err)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const n = attempts.length
    if (!n) return { n: 0, avg: 0, best: 0, totalMs: 0 }
    const avg = Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n)
    const best = Math.max(...attempts.map((a) => a.percent || 0))
    const totalMs = attempts.reduce((s, a) => s + (a.durationMs || 0), 0)
    return { n, avg, best, totalMs }
  }, [attempts])

  const tpAgg = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>()
    attempts.forEach((a) => {
      if (!a.tpSummary) return
      Object.entries(a.tpSummary).forEach(([tp, v]) => {
        const cur = map.get(tp) || { correct: 0, total: 0 }
        cur.correct += v.correct
        cur.total += v.total
        map.set(tp, cur)
      })
    })
    return [...map.entries()]
      .map(([tp, v]) => ({
        tp,
        ...v,
        percent: v.total ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.percent - b.percent || a.tp.localeCompare(b.tp, 'id'))
      .slice(0, 8)
  }, [attempts])

  const subjectGrades = useMemo(() => {
    const paketMap = new Map<string, LatihanPaket>()
    pakets.forEach((p) => {
      if (p.id) paketMap.set(p.id, p)
    })
    const bySub = new Map<string, { sum: number; n: number }>()
    attempts.forEach((a) => {
      const p = paketMap.get(a.latihanId)
      const sk = p?.subjectKey || 'unknown'
      const cur = bySub.get(sk) || { sum: 0, n: 0 }
      cur.sum += a.percent ?? 0
      cur.n += 1
      bySub.set(sk, cur)
    })
    return [...bySub.entries()]
      .map(([key, v]) => {
        const sub = key !== 'unknown' ? getSubject(key as SubjectKey) : undefined
        return {
          key,
          name: sub?.name || 'Tanpa mapel',
          shortName: sub?.shortName || '—',
          icon: sub?.icon || '📝',
          avg: v.n ? Math.round(v.sum / v.n) : 0,
          n: v.n,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [attempts, pakets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...attempts]
    if (q) {
      list = list.filter((a) => (a.latihanTitle || '').toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (sort === 'score-high') return (b.percent || 0) - (a.percent || 0)
      if (sort === 'score-low') return (a.percent || 0) - (b.percent || 0)
      const ta = toMillis(a.finishedAt) || 0
      const tb = toMillis(b.finishedAt) || 0
      return sort === 'oldest' ? ta - tb : tb - ta
    })
    return list
  }, [attempts, search, sort])

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const firstName = student.fullName.split(/\s+/)[0]
  const initial = (student.fullName.trim()[0] || 'S').toUpperCase()

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'newest', label: 'Terbaru' },
    { key: 'oldest', label: 'Terlama' },
    { key: 'score-high', label: 'Skor tertinggi' },
    { key: 'score-low', label: 'Skor terendah' },
  ]

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">Riwayat kuis</p>
              <p className="text-xs text-gray-500 truncate">
                {student.fullName}
                {student.className ? ` · Kelas ${student.className}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              to="/siswa/peringkat"
              className="text-xs font-medium text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Peringkat
            </Link>
            <Link
              to="/siswa"
              className="text-xs font-medium text-indigo-600 px-3 py-2 rounded-xl hover:bg-indigo-50 transition"
            >
              ← Beranda
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white p-6 sm:p-8 shadow-sm">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-10 w-40 h-40 bg-indigo-300 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10 max-w-xl">
            <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wide mb-1">
              Progress belajar
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
              Riwayatmu, {firstName}
            </h1>
            <p className="text-indigo-100 text-sm sm:text-base leading-relaxed">
              Lihat skor, nilai akhir per mapel, dan capaian TP dari kuis yang sudah kamu selesaikan.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total kuis', value: loading ? '…' : String(stats.n), tone: 'text-indigo-600' },
            {
              label: 'Rata-rata skor',
              value: loading ? '…' : stats.n ? `${stats.avg}%` : '—',
              tone: 'text-violet-600',
            },
            {
              label: 'Skor terbaik',
              value: loading ? '…' : stats.n ? `${stats.best}%` : '—',
              tone: 'text-emerald-600',
            },
            {
              label: 'Total waktu',
              value: loading ? '…' : stats.n ? formatDuration(stats.totalMs) : '—',
              tone: 'text-sky-600',
            },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5"
            >
              <p className="text-[11px] text-gray-400 font-medium">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 tabular-nums ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </section>

        {subjectGrades.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Nilai akhir per mata pelajaran</h2>
              <span className="text-[11px] text-gray-400">Rata-rata skor kuis</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjectGrades.map((g) => (
                <div
                  key={g.key}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg shrink-0">
                    {g.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                    <p className="text-[11px] text-gray-400">{g.n} kuis dikerjakan</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xl font-bold tabular-nums ${
                        g.avg >= 70
                          ? 'text-emerald-600'
                          : g.avg >= 40
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {g.avg}
                    </p>
                    <p className="text-[10px] text-gray-400">nilai akhir</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tpAgg.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Capaian TP (akumulasi)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {tpAgg.map((row) => (
                <div key={row.tp} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 w-20 truncate" title={row.tp}>
                    {row.tp}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.percent >= 70
                          ? 'bg-emerald-500'
                          : row.percent >= 40
                            ? 'bg-amber-400'
                            : 'bg-red-400'
                      }`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 w-10 text-right tabular-nums">
                    {row.percent}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-1.5">
            {sortOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setSort(o.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  sort === o.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul kuis…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan</h2>
            <span className="text-[11px] text-gray-400">
              {loading ? 'Memuat…' : `${filtered.length} hasil`}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-40 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-600 font-medium">Belum ada riwayat</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                {search
                  ? 'Tidak ada yang cocok dengan pencarian.'
                  : 'Selesaikan kuis di beranda untuk melihat skor di sini.'}
              </p>
              <Link
                to="/siswa"
                className="inline-flex text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition"
              >
                Ke beranda
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a) => {
                const fin = toMillis(a.finishedAt)
                const pct = a.percent ?? 0
                const grad = gradientFor(a.id || a.latihanId)
                const scoreTone =
                  pct >= 70
                    ? 'text-emerald-600 border-emerald-400'
                    : pct >= 40
                      ? 'text-amber-600 border-amber-400'
                      : 'text-rose-600 border-rose-400'

                return (
                  <article
                    key={a.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:border-indigo-200 hover:shadow-md transition flex flex-col"
                  >
                    <div className={`h-16 bg-gradient-to-br ${grad} px-4 flex items-center justify-between`}>
                      <span className="text-white/90 text-xs font-medium truncate pr-2">
                        {a.latihanTitle || 'Latihan'}
                      </span>
                      <div
                        className={`w-12 h-12 rounded-full border-2 bg-white/95 flex items-center justify-center text-sm font-bold tabular-nums shrink-0 ${scoreTone}`}
                      >
                        {pct}%
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                        {a.latihanTitle || 'Latihan'}
                      </h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span>{fin ? formatShort(fin) : '—'}</span>
                        {a.durationMs != null && a.durationMs > 0 && (
                          <span>· {formatDuration(a.durationMs)}</span>
                        )}
                        <span>
                          · {a.score ?? 0}/{a.total ?? 0} benar
                        </span>
                      </div>
                      {a.tpSummary && Object.keys(a.tpSummary).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(a.tpSummary)
                            .slice(0, 4)
                            .map(([tp, v]) => {
                              const p = v.total ? Math.round((v.correct / v.total) * 100) : 0
                              return (
                                <span
                                  key={tp}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                    p >= 70
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                      : p >= 40
                                        ? 'bg-amber-50 text-amber-800 border-amber-100'
                                        : 'bg-rose-50 text-rose-700 border-rose-100'
                                  }`}
                                  title={`${v.correct}/${v.total}`}
                                >
                                  {tp} {p}%
                                </span>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
