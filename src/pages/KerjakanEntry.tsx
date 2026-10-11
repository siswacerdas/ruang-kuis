import { useEffect, useMemo, useRef, useState } from 'react'
import {
  average,
  collection,
  count,
  getAggregateFromServer,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import {
  ensureStudentSession,
  clearStudentSession,
  type StudentSession,
} from '../lib/studentSession'
import { useNavigate } from 'react-router-dom'
import type { PracticeSession } from '../types/practice'
import { buildAllMine, capFinished, visiblePakets, FINISHED_CAP } from '../lib/studentDashboard'
import { dedupeDocs, getAttemptsForPakets } from '../lib/historyQueries'
import StudentNav, { StudentQuickLinks } from '../components/StudentNav'
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

type FilterKey = 'all' | 'active' | 'scheduled' | 'finished'

/** Kuis mandiri yang dibuat orang tua untuk anak ini (sesi sementara di practiceSessions). */
interface ParentQuizCard {
  id: string
  title: string
  subjectKey?: string
  questionCount: number
  parentName?: string
  createdMs: number
}

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

/** Paket yang mungkin tampil (bukan draft/arsip) — difilter di server; cadangan: baca semua. */
async function fetchVisibleLatihan(): Promise<QueryDocumentSnapshot[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'latihan'), where('status', 'in', ['active', 'scheduled', 'finished']))
    )
    if (!snap.empty) return snap.docs
  } catch (err) {
    console.warn('latihan terfilter gagal, baca semua', err)
  }
  const all = await getDocs(collection(db, 'latihan')).catch(() => null)
  return all?.docs || []
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
  const [parentQuizzes, setParentQuizzes] = useState<ParentQuizCard[]>([])
  const [overall, setOverall] = useState<{ n: number; avg: number } | null>(null)
  const [showAllFinished, setShowAllFinished] = useState(false)
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
      // 1) Paket + kuis mandiri ortu, paralel. Paket diurai di server (tanpa draft/arsip) agar
      //    biaya dashboard mengikuti jumlah paket AKTIF, bukan seluruh paket yang pernah dibuat.
      const [pDocs, parentSnap] = await Promise.all([
        fetchVisibleLatihan(),
        // Kuis mandiri buatan orang tua yang belum dikerjakan (sesi dihapus setelah selesai)
        s.studentId
          ? getDocs(
              query(
                collection(db, 'practiceSessions'),
                where('studentId', '==', s.studentId),
                where('status', '==', 'in_progress')
              )
            ).catch(() => null)
          : Promise.resolve(null),
      ])

      const list = pDocs
        .map((d) => ({ id: d.id, ...d.data() } as LatihanPaket))
        .filter((p) => p.status !== 'draft' && p.status !== 'archived')

      // 2) Hasil siswa HANYA untuk paket yang ditampilkan (bukan seluruh riwayat).
      //    Cadangan: cara lama (semua hasil siswa) bila query terarah gagal.
      const ids = list.map((p) => p.id).filter((x): x is string => !!x)
      let attDocs: QueryDocumentSnapshot[] = []
      try {
        const jobs = [getAttemptsForPakets('studentName', s.fullName, ids)]
        if (s.studentId) jobs.push(getAttemptsForPakets('studentId', s.studentId, ids))
        attDocs = (await Promise.all(jobs)).flat()
      } catch (err) {
        console.warn('attempts terarah gagal, pakai cara lama', err)
        const [aById, aByName] = await Promise.all([
          s.studentId
            ? getDocs(
                query(collection(db, 'attempts'), where('studentId', '==', s.studentId))
              ).catch(() => null)
            : Promise.resolve(null),
          getDocs(query(collection(db, 'attempts'), where('studentName', '==', s.fullName))).catch(
            () => null
          ),
        ])
        attDocs = [...(aById?.docs || []), ...(aByName?.docs || [])]
      }

      const done = new Set<string>()
      const best: Record<string, number> = {}
      const attList = dedupeDocs(
        attDocs.map((d) => ({ ...(d.data() as LatihanAttempt), id: d.id }) as LatihanAttempt & {
          id: string
        })
      )
      attList.forEach((a) => {
        if (a.latihanId) {
          done.add(a.latihanId)
          const pct = a.percent ?? 0
          if (best[a.latihanId] == null || pct > best[a.latihanId]) {
            best[a.latihanId] = pct
          }
        }
      })

      const fromParent: ParentQuizCard[] = (parentSnap?.docs || [])
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PracticeSession, 'id'>) }))
        .filter((x) => x.createdByParent === true)
        .map((x) => ({
          id: x.id,
          title: x.title || 'Kuis dari orang tua',
          subjectKey: x.subjectKey,
          questionCount: x.questionCount || x.questionIds?.length || 0,
          parentName: x.parentName,
          createdMs: toMillis(x.createdAt) || 0,
        }))
        .sort((a, b) => b.createdMs - a.createdMs)

      setPakets(list)
      setParentQuizzes(fromParent)
      setDoneIds(done)
      setBestByLatihan(best)
      setAttempts(attList)
      setLoadingList(false)

      // 3) Ringkasan keseluruhan (jumlah & rata-rata) dihitung di server — tidak mengunduh riwayat.
      try {
        const agg = async (field: 'studentId' | 'studentName', value: string) => {
          const r = await getAggregateFromServer(
            query(collection(db, 'attempts'), where(field, '==', value)),
            { n: count(), avg: average('percent') }
          )
          return { n: r.data().n, avg: Math.round(r.data().avg || 0) }
        }
        let overall = s.studentId ? await agg('studentId', s.studentId) : { n: 0, avg: 0 }
        if (overall.n === 0) overall = await agg('studentName', s.fullName)
        setOverall(overall)
      } catch (err) {
        console.warn('ringkasan server gagal, pakai data terunduh', err)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingList(false)
    }
  }

  // Semua paket guru untuk siswa ini (termasuk yang sudah dikerjakan) — dasar statistik.
  const allMine = useMemo(
    () => buildAllMine(pakets, student, doneIds),
    [pakets, student, doneIds]
  )

  // Daftar di dashboard: paket yang sudah dikerjakan (dan tidak boleh diulang) disembunyikan.
  // Bila guru mereset hasilnya (dokumen attempts dihapus), `done` kembali false → paket muncul lagi.
  const myPakets = useMemo(() => visiblePakets(allMine), [allMine])

  const subjectOptions = useMemo(() => {
    const keys = new Set<string>()
    myPakets.forEach((r) => {
      if (r.paket.subjectKey) keys.add(r.paket.subjectKey)
    })
    return SUBJECTS.filter((s) => keys.has(s.key))
  }, [myPakets])

  const { filtered, hiddenFinished } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = myPakets.filter((r) => {
      if (filter === 'active' && r.resolved !== 'active') return false
      if (filter === 'scheduled' && r.resolved !== 'scheduled') return false
      if (filter === 'finished' && r.resolved !== 'finished') return false
      if (subjectFilter !== 'all' && r.paket.subjectKey !== subjectFilter) return false
      if (q) {
        const title = (r.paket.title || '').toLowerCase()
        const sub = r.paket.subjectKey ? getSubject(r.paket.subjectKey)?.shortName || '' : ''
        if (!title.includes(q) && !sub.toLowerCase().includes(q)) return false
      }
      return true
    })
    // Tampilan "Semua" tanpa pencarian: batasi paket berakhir agar daftar tidak makin panjang.
    if (filter === 'all' && !q && !showAllFinished) {
      const capped = capFinished(list, FINISHED_CAP)
      return { filtered: capped.rows, hiddenFinished: capped.hidden }
    }
    return { filtered: list, hiddenFinished: 0 }
  }, [myPakets, filter, subjectFilter, search, showAllFinished])

  const stats = useMemo(() => {
    const local = attempts.length
    const localAvg = local
      ? Math.round(attempts.reduce((sum, a) => sum + (a.percent || 0), 0) / local)
      : 0
    const n = overall && overall.n > 0 ? overall.n : local
    const avg = overall && overall.n > 0 ? overall.avg : localAvg
    const active = myPakets.filter((r) => r.resolved === 'active' && !r.blocked).length
    const doneCount = allMine.filter((r) => r.done).length
    return { n, avg, active, doneCount, total: myPakets.length + parentQuizzes.length }
  }, [attempts, overall, myPakets, allMine, parentQuizzes])

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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 space-y-6">
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

        <StudentQuickLinks />

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
          <div>
            <h2 className="text-base font-bold text-gray-900">Kuis wajib dari guru</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Kuis yang sudah kamu kerjakan tidak ditampilkan lagi di sini — lihat nilainya di Riwayat.
            </p>
          </div>
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
                  {s.shortName}
                </button>
              ))}
            </div>
          )}

          {loadingList ? (
            <p className="text-center text-sm text-gray-400 py-12">Memuat jadwal…</p>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-5 py-14 text-center">
              {allMine.length > 0 && myPakets.length === 0 ? (
                <>
                  <p className="text-sm text-gray-500">Semua kuis dari guru sudah kamu kerjakan. Hebat!</p>
                  <p className="text-xs text-gray-400 mt-1">Kuis baru akan muncul di sini sesuai jadwal guru.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Tidak ada kuis untuk filter ini.</p>
                  <p className="text-xs text-gray-400 mt-1">Coba ubah filter atau tunggu jadwal dari guru.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(({ paket: p, resolved, done, blocked }) => {
                const sub = p.subjectKey ? getSubject(p.subjectKey) : undefined
                const best = p.id ? bestByLatihan[p.id] : undefined
                const canEnter = resolved === 'active' && !blocked
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPaket(p)}
                    disabled={!canEnter && resolved !== 'active'}
                    className={`text-left group rounded-2xl border bg-white shadow-sm overflow-hidden transition ${
                      canEnter
                        ? 'border-gray-100 hover:border-indigo-200 hover:shadow-md'
                        : 'border-gray-100 opacity-90'
                    }`}
                  >
                    <div className={`h-2 bg-gradient-to-r ${gradientFor(p.id)}`} />
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {sub && (
                            <span className="text-[11px] font-medium text-indigo-600">
                              {sub.shortName}
                            </span>
                          )}
                          <h3 className="font-semibold text-gray-900 leading-snug mt-0.5 group-hover:text-indigo-700 transition">
                            {p.title}
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusPill(
                            resolved
                          )}`}
                        >
                          {LATIHAN_STATUS_LABELS[resolved]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{formatRange(p.startAt, p.endAt)}</p>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-400">
                          {p.questionCount || 0} soal
                          {p.timeLimitMinutes ? ` · ${p.timeLimitMinutes} mnt` : ''}
                        </span>
                        {done && (
                          <span className="font-medium text-emerald-600">
                            {best != null ? `Skor terbaik ${best}%` : 'Sudah dikerjakan'}
                          </span>
                        )}
                      </div>
                      {blocked && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                          Sudah dikerjakan · ulang tidak diizinkan
                        </p>
                      )}
                      {canEnter && (
                        <p className="text-xs font-medium text-indigo-600">Ketuk untuk mulai →</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {!loadingList && hiddenFinished > 0 && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowAllFinished(true)}
                className="text-xs font-medium text-indigo-600 bg-white border border-indigo-100 hover:border-indigo-300 px-4 py-2 rounded-xl transition"
              >
                Tampilkan {hiddenFinished} kuis berakhir lainnya
              </button>
            </div>
          )}
        </section>

        {!loadingList && parentQuizzes.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Kuis mandiri dari orang tua</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Latihan tambahan yang disiapkan orang tuamu. Tidak ada batas waktu dari guru.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {parentQuizzes.map((q) => {
                const sub = q.subjectKey ? getSubject(q.subjectKey as never) : undefined
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => navigate(`/siswa/latihan-mandiri/${q.id}`)}
                    className="text-left group rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden transition hover:border-amber-200 hover:shadow-md"
                  >
                    <div className="h-2 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {sub && (
                            <span className="text-[11px] font-medium text-amber-700">{sub.shortName}</span>
                          )}
                          <h3 className="font-semibold text-gray-900 leading-snug mt-0.5 group-hover:text-amber-800 transition">
                            {q.title}
                          </h3>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-100">
                          Mandiri
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {q.questionCount} soal
                        {q.parentName ? ` · dari ${q.parentName}` : ''}
                      </p>
                      <p className="text-xs font-medium text-amber-700">Ketuk untuk mulai →</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </main>

      {showTokenModal && selected && (
        <div className="fixed inset-0 z-40 bg-gray-900/40 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{selected.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {needsToken(selected)
                    ? 'Masukkan token dari guru untuk memulai'
                    : error || 'Tidak dapat membuka paket ini'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTokenModal(false)
                  setError('')
                  setToken('')
                }}
                className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
              >
                Tutup
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>
            )}
            {needsToken(selected) && !error?.includes('sudah mengerjakan') && (
              <form onSubmit={confirmToken} className="space-y-3">
                <input
                  ref={tokenRef}
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="TOKEN"
                  className="w-full text-center tracking-[0.3em] font-semibold text-lg border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/30 outline-none uppercase"
                  autoComplete="off"
                  maxLength={12}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition"
                >
                  {loading ? 'Memulai…' : 'Mulai mengerjakan'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <StudentNav />
    </div>
  )
}
