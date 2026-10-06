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
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
    return () => { cancelled = true }
  }, [navigate])

  const loadAttempts = async (s: StudentSession) => {
    setLoading(true)
    try {
      const byId: LatihanAttempt[] = []
      const byName: LatihanAttempt[] = []
      if (s.studentId) {
        try {
          const snap = await getDocs(query(collection(db, 'attempts'), where('studentId', '==', s.studentId)))
          snap.docs.forEach((d) => byId.push({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch (err) { console.warn(err) }
      }
      try {
        const snap = await getDocs(query(collection(db, 'attempts'), where('studentName', '==', s.fullName)))
        snap.docs.forEach((d) => byName.push({ id: d.id, ...d.data() } as LatihanAttempt))
      } catch (err) { console.warn(err) }
      const map = new Map<string, LatihanAttempt>()
      ;[...byId, ...byName].forEach((a) => { if (a.id) map.set(a.id, a) })
      setAttempts([...map.values()])
      try {
        const pSnap = await getDocs(collection(db, 'latihan'))
        setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
      } catch (err) { console.warn(err) }
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

  const subjectGrades = useMemo(() => {
    const paketMap = new Map<string, LatihanPaket>()
    pakets.forEach((p) => { if (p.id) paketMap.set(p.id, p) })
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
    if (q) list = list.filter((a) => (a.latihanTitle || '').toLowerCase().includes(q))
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

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">{initial}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">Riwayat kuis</p>
            <p className="text-xs text-gray-500 truncate">{student.fullName}{student.className ? ` · Kelas ${student.className}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 space-y-6">
        <section className="rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white p-6 sm:p-8">
          <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wide mb-1">Progress belajar</p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Riwayatmu, {firstName}</h1>
          <p className="text-indigo-100 text-sm">Skor, nilai per mapel, dan capaian dari kuis yang sudah selesai.</p>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total kuis', value: loading ? '…' : String(stats.n), tone: 'text-indigo-600' },
            { label: 'Rata-rata skor', value: loading ? '…' : stats.n ? `${stats.avg}%` : '—', tone: 'text-violet-600' },
            { label: 'Skor terbaik', value: loading ? '…' : stats.n ? `${stats.best}%` : '—', tone: 'text-emerald-600' },
            { label: 'Total waktu', value: loading ? '…' : stats.n ? formatDuration(stats.totalMs) : '—', tone: 'text-sky-600' },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-[11px] text-gray-400 font-medium">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 tabular-nums ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </section>

        {subjectGrades.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Nilai akhir per mata pelajaran</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjectGrades.map((g) => (
                <div key={g.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg shrink-0">{g.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                    <p className="text-[11px] text-gray-400">{g.n} kuis</p>
                  </div>
                  <p className={`text-xl font-bold tabular-nums ${g.avg >= 70 ? 'text-emerald-600' : g.avg >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{g.avg}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {([ ['newest','Terbaru'], ['oldest','Terlama'], ['score-high','Skor tertinggi'], ['score-low','Skor terendah'] ] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSort(k)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  sort === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>{label}</button>
            ))}
          </div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari judul kuis…"
            className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none" />
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan</h2>
            <span className="text-[11px] text-gray-400">{loading ? 'Memuat…' : `${filtered.length} hasil`}</span>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-40 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-600 font-medium">Belum ada riwayat</p>
              <Link to="/siswa" className="inline-flex mt-4 text-sm font-medium text-white bg-indigo-600 px-4 py-2.5 rounded-xl">Ke beranda</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a) => {
                const fin = toMillis(a.finishedAt)
                const pct = a.percent ?? 0
                return (
                  <article key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{a.latihanTitle || 'Latihan'}</h3>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${
                        pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'
                      }`}>{pct}%</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      {fin ? formatShort(fin) : '—'} · {a.score ?? 0}/{a.total ?? 0} benar
                      {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}
                    </p>
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
