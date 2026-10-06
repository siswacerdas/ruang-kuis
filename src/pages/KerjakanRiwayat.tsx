import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureStudentSession, type StudentSession } from '../lib/studentSession'
import { Link, useNavigate } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
import {
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'
import type { PracticeAttempt } from '../types/practice'

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
type TabKey = 'all' | 'official' | 'practice'

/** Unified row for display */
interface HistoryRow {
  id: string
  title: string
  percent: number
  score: number
  total: number
  durationMs?: number
  finishedAt?: unknown
  tpSummary?: Record<string, { correct: number; total: number }>
  kind: 'official' | 'practice'
  subjectKey?: string
}

export default function KerjakanRiwayat() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [official, setOfficial] = useState<LatihanAttempt[]>([])
  const [practice, setPractice] = useState<PracticeAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [tab, setTab] = useState<TabKey>('all')

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
      loadAll(s)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const loadAll = async (s: StudentSession) => {
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
          console.warn('query attempts studentId', err)
        }
        try {
          const snap = await getDocs(
            query(collection(db, 'practiceAttempts'), where('studentId', '==', s.studentId))
          )
          setPractice(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeAttempt)))
        } catch (err) {
          console.warn('query practiceAttempts', err)
          setPractice([])
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
      setOfficial([...map.values()])

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

  const rows: HistoryRow[] = useMemo(() => {
    const o: HistoryRow[] = official.map((a) => ({
      id: a.id || `o-${a.latihanId}`,
      title: a.latihanTitle || 'Latihan resmi',
      percent: a.percent ?? 0,
      score: a.score ?? 0,
      total: a.total ?? 0,
      durationMs: a.durationMs,
      finishedAt: a.finishedAt,
      tpSummary: a.tpSummary,
      kind: 'official',
      subjectKey: pakets.find((p) => p.id === a.latihanId)?.subjectKey,
    }))
    const p: HistoryRow[] = practice.map((a) => ({
      id: a.id || `p-${Math.random()}`,
      title: a.title || 'Latihan mandiri',
      percent: a.percent ?? 0,
      score: a.score ?? 0,
      total: a.total ?? 0,
      durationMs: a.durationMs,
      finishedAt: a.finishedAt,
      tpSummary: a.tpSummary,
      kind: 'practice',
      subjectKey: a.subjectKey,
    }))
    return [...o, ...p]
  }, [official, practice, pakets])

  const stats = useMemo(() => {
    const list =
      tab === 'official'
        ? rows.filter((r) => r.kind === 'official')
        : tab === 'practice'
          ? rows.filter((r) => r.kind === 'practice')
          : rows
    const n = list.length
    if (!n) return { n: 0, avg: 0, best: 0, totalMs: 0 }
    const avg = Math.round(list.reduce((s, a) => s + a.percent, 0) / n)
    const best = Math.max(...list.map((a) => a.percent))
    const totalMs = list.reduce((s, a) => s + (a.durationMs || 0), 0)
    return { n, avg, best, totalMs }
  }, [rows, tab])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows.filter((r) => {
      if (tab === 'official' && r.kind !== 'official') return false
      if (tab === 'practice' && r.kind !== 'practice') return false
      if (q && !r.title.toLowerCase().includes(q)) return false
      return true
    })
    list.sort((a, b) => {
      if (sort === 'score-high') return b.percent - a.percent
      if (sort === 'score-low') return a.percent - b.percent
      const ta = toMillis(a.finishedAt) || 0
      const tb = toMillis(b.finishedAt) || 0
      return sort === 'oldest' ? ta - tb : tb - ta
    })
    return list
  }, [rows, search, sort, tab])

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'official', label: 'Resmi guru' },
    { key: 'practice', label: 'Mandiri' },
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
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 space-y-6">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white p-6 sm:p-8 shadow-sm">
          <div className="relative z-10 max-w-xl">
            <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wide mb-1">
              Progress belajar
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
              Riwayatmu, {firstName}
            </h1>
            <p className="text-indigo-100 text-sm leading-relaxed">
              Kuis resmi dari guru dan latihan mandiri, dalam satu tempat.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                tab === t.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',
              value: loading ? '…' : String(stats.n),
              tone: 'text-indigo-600',
            },
            {
              label: 'Rata-rata',
              value: loading ? '…' : stats.n ? `${stats.avg}%` : '—',
              tone: 'text-violet-600',
            },
            {
              label: 'Terbaik',
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
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul…"
            className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </section>

        <section>
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-12">Memuat…</p>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-600 font-medium">Belum ada riwayat</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                Kerjakan kuis resmi atau mulai latihan mandiri.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  to="/siswa"
                  className="text-sm font-medium text-white bg-indigo-600 px-4 py-2.5 rounded-xl"
                >
                  Beranda
                </Link>
                <Link
                  to="/siswa/latihan-mandiri"
                  className="text-sm font-medium text-teal-800 bg-teal-50 border border-teal-100 px-4 py-2.5 rounded-xl"
                >
                  Latihan mandiri
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a) => {
                const fin = toMillis(a.finishedAt)
                const pct = a.percent
                const grad =
                  a.kind === 'practice'
                    ? 'from-teal-500 via-emerald-500 to-cyan-600'
                    : gradientFor(a.id)
                const scoreTone =
                  pct >= 70
                    ? 'text-emerald-600 border-emerald-400'
                    : pct >= 40
                      ? 'text-amber-600 border-amber-400'
                      : 'text-rose-600 border-rose-400'
                const sub = a.subjectKey ? getSubject(a.subjectKey as SubjectKey) : null

                return (
                  <article
                    key={a.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
                  >
                    <div
                      className={`h-16 bg-gradient-to-br ${grad} px-4 flex items-center justify-between`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-white/90 text-xs font-medium truncate block">
                          {a.title}
                        </span>
                        <span className="text-[10px] text-white/70">
                          {a.kind === 'practice' ? 'Mandiri' : 'Resmi'}
                          {sub ? ` · ${sub.shortName}` : ''}
                        </span>
                      </div>
                      <div
                        className={`w-12 h-12 rounded-full border-2 bg-white/95 flex items-center justify-center text-sm font-bold tabular-nums shrink-0 ${scoreTone}`}
                      >
                        {pct}%
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{a.title}</h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span>{fin ? formatShort(fin) : '—'}</span>
                        {a.durationMs != null && a.durationMs > 0 && (
                          <span>· {formatDuration(a.durationMs)}</span>
                        )}
                        <span>
                          · {a.score}/{a.total} benar
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

      <StudentNav />
    </div>
  )
}
