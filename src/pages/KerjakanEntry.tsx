import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import {
  ensureStudentSession,
  clearStudentSession,
  type StudentSession,
} from '../lib/studentSession'
import { useNavigate, Link } from 'react-router-dom'
import {
  SUBJECTS,
  getSubject,
  resolveLatihanStatus,
  LATIHAN_STATUS_LABELS,
  isPaketForStudent,
  canRetryPaket,
  hoursUntilEnd,
  needsToken,
  type LatihanPaket,
  type LatihanAttempt,
  type LatihanStatus,
} from '../types/question'

/** Beranda / dashboard siswa */

type FilterKey = 'all' | 'active' | 'scheduled' | 'finished' | 'done'

const CARD_GRADIENTS = [
  'from-indigo-500 via-violet-500 to-purple-600',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-fuchsia-500 via-pink-500 to-rose-500',
  'from-violet-500 via-purple-500 to-indigo-600',
]

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

function formatRange(start: unknown, end: unknown): string {
  const s = toMillis(start)
  const e = toMillis(end)
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  if (s && e) return `${fmt(s)} – ${fmt(e)}`
  if (s) return `Mulai ${fmt(s)}`
  if (e) return `Sampai ${fmt(e)}`
  return 'Jadwal belum diatur'
}

function statusPill(st: LatihanStatus): string {
  if (st === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (st === 'scheduled') return 'bg-amber-50 text-amber-800 border-amber-100'
  if (st === 'finished') return 'bg-gray-100 text-gray-500 border-gray-200'
  return 'bg-gray-50 text-gray-400 border-gray-100'
}

function gradientFor(id?: string) {
  let h = 0
  const s = id || 'x'
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % CARD_GRADIENTS.length
  return CARD_GRADIENTS[h]
}

export default function KerjakanEntry() {
  const navigate = useNavigate()
  const tokenRef = useRef<HTMLInputElement>(null)

  const [student, setStudent] = useState<StudentSession | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [bestByLatihan, setBestByLatihan] = useState<Record<string, number>>({})
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

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
      loadData(s)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const loadData = async (s: StudentSession) => {
    setLoadingList(true)
    try {
      const [pSnap, aById, aByName] = await Promise.all([
        getDocs(collection(db, 'latihan')).catch(() => null),
        s.studentId
          ? getDocs(query(collection(db, 'attempts'), where('studentId', '==', s.studentId))).catch(
              () => null
            )
          : Promise.resolve(null),
        getDocs(query(collection(db, 'attempts'), where('studentName', '==', s.fullName))).catch(
          () => null
        ),
      ])

      const list = (pSnap?.docs || [])
        .map((d) => ({ id: d.id, ...d.data() } as LatihanPaket))
        .filter((p) => p.status !== 'draft' && p.status !== 'archived')

      const done = new Set<string>()
      const best: Record<string, number> = {}
      const attList: LatihanAttempt[] = []
      ;[...(aById?.docs || []), ...(aByName?.docs || [])].forEach((d) => {
        const a = { id: d.id, ...d.data() } as LatihanAttempt
        attList.push(a)
        if (a.latihanId) {
          done.add(a.latihanId)
          const pct = a.percent ?? 0
          if (best[a.latihanId] == null || pct > best[a.latihanId]) {
            best[a.latihanId] = pct
          }
        }
      })

      setPakets(list)
      setDoneIds(done)
      setBestByLatihan(best)
      setAttempts(attList)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingList(false)
    }
  }

  const myPakets = useMemo(() => {
    if (!student) return []
    return pakets
      .filter((p) => isPaketForStudent(p, student))
      .map((p) => {
        const resolved = resolveLatihanStatus(p)
        const done = p.id ? doneIds.has(p.id) : false
        const blocked = done && !canRetryPaket(p)
        const start = toMillis(p.startAt) || 0
        return { paket: p, resolved, done, blocked, start }
      })
      .filter((r) => r.resolved === 'active' || r.resolved === 'scheduled' || r.resolved === 'finished')
      .sort((a, b) => {
        const order = { active: 0, scheduled: 1, finished: 2 } as Record<string, number>
        const d = (order[a.resolved] ?? 9) - (order[b.resolved] ?? 9)
        if (d !== 0) return d
        return a.start - b.start
      })
  }, [pakets, student, doneIds])

  const subjectOptions = useMemo(() => {
    const keys = new Set<string>()
    myPakets.forEach((r) => {
      if (r.paket.subjectKey) keys.add(r.paket.subjectKey)
    })
    return SUBJECTS.filter((s) => keys.has(s.key))
  }, [myPakets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return myPakets.filter((r) => {
      if (filter === 'active' && r.resolved !== 'active') return false
      if (filter === 'scheduled' && r.resolved !== 'scheduled') return false
      if (filter === 'finished' && r.resolved !== 'finished') return false
      if (filter === 'done' && !r.done) return false
      if (subjectFilter !== 'all' && r.paket.subjectKey !== subjectFilter) return false
      if (q) {
        const title = (r.paket.title || '').toLowerCase()
        const sub = r.paket.subjectKey ? getSubject(r.paket.subjectKey)?.shortName || '' : ''
        if (!title.includes(q) && !sub.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [myPakets, filter, subjectFilter, search])

  const stats = useMemo(() => {
    const n = attempts.length
    const avg = n ? Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n) : 0
    const active = myPakets.filter((r) => r.resolved === 'active' && !r.blocked).length
    const doneCount = myPakets.filter((r) => r.done).length
    return { n, avg, active, doneCount, total: myPakets.length }
  }, [attempts, myPakets])

  const urgentPakets = useMemo(() => {
    return myPakets.filter((r) => {
      if (r.resolved !== 'active' || r.blocked) return false
      const h = hoursUntilEnd(r.paket)
      return h != null && h > 0 && h <= 24
    })
  }, [myPakets])

  const selected = selectedId ? pakets.find((p) => p.id === selectedId) : null

  const handleLogout = async () => {
    clearStudentSession()
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    navigate('/login', { replace: true })
  }

  const beginSession = (paket: LatihanPaket, tokenUsed?: string) => {
    if (!student || !paket.id) return
    sessionStorage.setItem(
      'rk_session',
      JSON.stringify({
        latihanId: paket.id,
        studentName: student.fullName,
        studentId: student.studentId,
        studentClass: student.className || '5A',
        token: tokenUsed || null,
      })
    )
    navigate(`/kerjakan/${paket.id}`)
  }

  const assertCanEnter = (paket: LatihanPaket): string | null => {
    if (!student) return 'Sesi siswa tidak valid'
    if (paket.status === 'draft' || paket.status === 'archived') {
      return 'Latihan ini belum dibuka atau sudah diarsipkan.'
    }
    const resolved = resolveLatihanStatus(paket)
    if (resolved === 'scheduled') return 'Latihan belum dimulai. Tunggu sesuai jadwal.'
    if (resolved === 'finished') return 'Waktu latihan sudah berakhir.'
    if (!isPaketForStudent(paket, student)) {
      return 'Paket ini tidak ditugaskan untuk kelas/akun kamu.'
    }
    if (paket.id && doneIds.has(paket.id) && !canRetryPaket(paket)) {
      return 'Kamu sudah mengerjakan paket ini. Pengerjaan ulang tidak diizinkan.'
    }
    return null
  }

  const selectPaket = async (p: LatihanPaket) => {
    setSelectedId(p.id || null)
    setError('')
    setToken('')
    const err = assertCanEnter(p)
    if (err) {
      setError(err)
      setShowTokenModal(true)
      return
    }
    if (needsToken(p)) {
      setShowTokenModal(true)
      setTimeout(() => tokenRef.current?.focus(), 80)
      return
    }
    setLoading(true)
    try {
      beginSession(p)
    } finally {
      setLoading(false)
    }
  }

  const confirmToken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setError('')
    const t = token.trim().toUpperCase()
    if (!t) {
      setError('Masukkan token dari guru')
      return
    }
    if (selected.token && t !== selected.token.toUpperCase()) {
      setError('Token tidak cocok untuk paket ini')
      return
    }
    const err = assertCanEnter(selected)
    if (err) {
      setError(err)
      return
    }
    setLoading(true)
    try {
      beginSession(selected, t)
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

  const firstName = student.fullName.split(/\s+/)[0]
  const initial = (student.fullName.trim()[0] || 'S').toUpperCase()

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'active', label: 'Aktif' },
    { key: 'scheduled', label: 'Terjadwal' },
    { key: 'done', label: 'Sudah dikerjakan' },
    { key: 'finished', label: 'Berakhir' },
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
              <p className="text-sm font-semibold text-gray-900 truncate">Halo, {firstName}!</p>
              <p className="text-xs text-gray-500 truncate">
                {student.className ? `Kelas ${student.className}` : 'Siswa'}
                {student.nickname ? ` · ${student.nickname}` : ''}
                {' · '}
                <span className="text-indigo-600 font-medium">Ruang Kuis</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/siswa/peringkat"
              className="text-xs font-medium text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Peringkat
            </Link>
            <Link
              to="/kerjakan/riwayat"
              className="text-xs font-medium text-indigo-600 px-3 py-2 rounded-xl hover:bg-indigo-50 transition"
            >
              Riwayat
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-600 px-3 py-2 rounded-xl hover:bg-red-50 transition"
            >
              Keluar
            </button>
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
              Beranda siswa
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
              Siap belajar hari ini, {firstName}?
            </h1>
            <p className="text-indigo-100 text-sm sm:text-base leading-relaxed">
              Lihat jadwal kuis, cek progressmu, lalu mulai saat kamu siap. Tidak perlu buru-buru.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Kuis tersedia', value: loadingList ? '…' : String(stats.total), tone: 'text-indigo-600' },
            { label: 'Sedang aktif', value: loadingList ? '…' : String(stats.active), tone: 'text-emerald-600' },
            { label: 'Sudah dikerjakan', value: loadingList ? '…' : String(stats.doneCount), tone: 'text-sky-600' },
            {
              label: 'Rata-rata skor',
              value: loadingList ? '…' : stats.n ? `${stats.avg}%` : '—',
              tone: 'text-violet-600',
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

        {urgentPakets.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">
              Segera berakhir
            </p>
            <div className="flex flex-wrap gap-2">
              {urgentPakets.map(({ paket: p }) => {
                const h = hoursUntilEnd(p)
                const label =
                  h == null
                    ? ''
                    : h < 1
                      ? `${Math.max(1, Math.round(h * 60))} mnt lagi`
                      : `${Math.round(h)} jam lagi`
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPaket(p)}
                    className="inline-flex items-center gap-1.5 text-sm bg-white border border-amber-200 text-amber-950 px-3 py-1.5 rounded-xl hover:border-amber-300 transition"
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-amber-700/80 text-xs">· {label}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                    filter === f.key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-200'
                  }`}
                >
                  {f.label}
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
                placeholder="Cari kuis…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              />
            </div>
          </div>

          {subjectOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium mr-1">Mapel:</span>
              <button
                type="button"
                onClick={() => setSubjectFilter('all')}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  subjectFilter === 'all'
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-violet-200'
                }`}
              >
                Semua mapel
              </button>
              {subjectOptions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSubjectFilter(s.key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                    subjectFilter === s.key
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-200'
                  }`}
                >
                  {s.icon} {s.shortName}
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Kuis untukmu</h2>
            <span className="text-[11px] text-gray-400">
              {loadingList ? 'Memuat…' : `${filtered.length} paket`}
            </span>
          </div>

          {loadingList ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-56 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-600 font-medium">Belum ada kuis di sini</p>
              <p className="text-sm text-gray-400 mt-1">
                {filter === 'all' && subjectFilter === 'all'
                  ? 'Tunggu guru membuka paket latihan.'
                  : 'Coba filter status, mapel, atau pencarian lain.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(({ paket: p, resolved, done, blocked }) => {
                const sub = p.subjectKey ? getSubject(p.subjectKey) : null
                const subMeta = SUBJECTS.find((s) => s.key === p.subjectKey)
                const qCount = p.questionCount || p.questionIds?.length || 0
                const best = p.id ? bestByLatihan[p.id] : undefined
                const canStart = resolved === 'active' && !blocked
                const grad = gradientFor(p.id)

                return (
                  <article
                    key={p.id}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:border-indigo-200 hover:shadow-md transition flex flex-col"
                  >
                    <div
                      className={`relative h-28 bg-gradient-to-br ${grad} px-4 pt-3 pb-2 flex flex-col justify-between`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-white/90 ${statusPill(
                            resolved
                          )}`}
                        >
                          {LATIHAN_STATUS_LABELS[resolved]}
                        </span>
                        {done && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                            Selesai
                          </span>
                        )}
                      </div>
                      <div className="text-white/90 text-3xl opacity-80 select-none leading-none">
                        {subMeta?.icon || '📝'}
                      </div>
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition">
                        {p.title}
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-1">{formatRange(p.startAt, p.endAt)}</p>

                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold tabular-nums ${
                              best != null
                                ? best >= 70
                                  ? 'border-emerald-400 text-emerald-600'
                                  : best >= 40
                                    ? 'border-amber-400 text-amber-600'
                                    : 'border-rose-400 text-rose-600'
                                : 'border-gray-200 text-gray-400'
                            }`}
                          >
                            {best != null ? `${best}` : '—'}
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 leading-none">Skor</p>
                            <p className="text-[11px] font-medium text-gray-700 leading-tight">
                              {best != null ? `${best}%` : 'Belum'}
                            </p>
                          </div>
                        </div>
                        <div className="h-8 w-px bg-gray-100" />
                        <div>
                          <p className="text-[10px] text-gray-400 leading-none">Soal</p>
                          <p className="text-[11px] font-medium text-gray-700 leading-tight">
                            {qCount}
                            {p.timeLimitMinutes ? ` · ${p.timeLimitMinutes} mnt` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1">
                        {sub && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-100">
                            {subMeta?.icon} {sub.shortName}
                          </span>
                        )}
                        {blocked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100">
                            Tidak bisa diulang
                          </span>
                        )}
                        {canStart && needsToken(p) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100">
                            Perlu token
                          </span>
                        )}
                      </div>

                      <div className="mt-auto pt-4">
                        <button
                          type="button"
                          disabled={!canStart || loading}
                          onClick={() => selectPaket(p)}
                          className={`w-full text-sm font-medium py-2.5 rounded-xl transition ${
                            canStart
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-100'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {!canStart
                            ? resolved === 'scheduled'
                              ? 'Belum dimulai'
                              : blocked
                                ? 'Sudah dikerjakan'
                                : 'Tidak tersedia'
                            : needsToken(p)
                              ? 'Mulai dengan token'
                              : done
                                ? 'Kerjakan ulang'
                                : 'Mulai kuis'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {showTokenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900">
              {selected && needsToken(selected) ? 'Token diperlukan' : 'Info'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {error && !needsToken(selected || ({} as LatihanPaket))
                ? error
                : selected
                  ? `Masukkan token dari guru untuk “${selected.title}”.`
                  : 'Masukkan token.'}
            </p>
            {selected && needsToken(selected) && (
              <form onSubmit={confirmToken} className="mt-4 space-y-3">
                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-xl">
                    {error}
                  </div>
                )}
                <input
                  ref={tokenRef}
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="Contoh: AB12CD"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-center text-lg font-mono tracking-widest uppercase"
                  maxLength={12}
                  autoComplete="off"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTokenModal(false)
                      setError('')
                      setSelectedId(null)
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {loading ? 'Memeriksa…' : 'Mulai'}
                  </button>
                </div>
              </form>
            )}
            {selected && !needsToken(selected) && (
              <button
                type="button"
                onClick={() => {
                  setShowTokenModal(false)
                  setError('')
                  setSelectedId(null)
                }}
                className="mt-4 w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
