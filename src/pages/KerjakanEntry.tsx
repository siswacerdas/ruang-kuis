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
              to="/siswa/materi"
              className="text-xs font-medium text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Materi
            </Link>
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
        {/* REST OF FILE LOADED FROM ORIGINAL - see follow-up if truncated */}
        <p className="text-sm text-red-600">FILE INCOMPLETE - RESTORING</p>
      </main>
    </div>
  )
}
