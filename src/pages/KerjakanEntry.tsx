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

/**
 * Beranda siswa setelah login:
 * - Jadwal kuis (aktif / terjadwal) dalam garis waktu
 * - Status sudah/belum dikerjakan
 * - Klik kartu → langsung mulai (atau token bila requireToken)
 */

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

function formatDayLabel(ms: number) {
  const d = new Date(ms)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (sameDay) return 'Hari ini'
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

function statusStyle(st: LatihanStatus): string {
  if (st === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (st === 'scheduled') return 'bg-amber-50 text-amber-800 border-amber-100'
  if (st === 'finished') return 'bg-gray-100 text-gray-500 border-gray-200'
  return 'bg-gray-50 text-gray-400 border-gray-100'
}

function cardAccent(st: LatihanStatus): string {
  if (st === 'active') return 'border-l-emerald-500'
  if (st === 'scheduled') return 'border-l-amber-400'
  return 'border-l-gray-300'
}

export default function KerjakanEntry() {
  const navigate = useNavigate()
  const tokenRef = useRef<HTMLInputElement>(null)

  const [student, setStudent] = useState<StudentSession | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureStudentSession()
      if (cancelled) return
      if (!s) {
        navigate('/kerjakan', { replace: true })
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
      ;[...(aById?.docs || []), ...(aByName?.docs || [])].forEach((d) => {
        const a = d.data() as LatihanAttempt
        if (a.latihanId) done.add(a.latihanId)
      })

      setPakets(list)
      setDoneIds(done)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingList(false)
    }
  }

  const urgentPakets = useMemo(() => {
    if (!student) return []
    return pakets.filter((p) => {
      if (!isPaketForStudent(p, student)) return false
      if (resolveLatihanStatus(p) !== 'active') return false
      const h = hoursUntilEnd(p)
      return h != null && h > 0 && h <= 24
    })
  }, [pakets, student])

  const schedule = useMemo(() => {
    if (!student) return []
    const rows = pakets
      .filter((p) => isPaketForStudent(p, student))
      .map((p) => {
        const resolved = resolveLatihanStatus(p)
        const start = toMillis(p.startAt) || 0
        const done = p.id ? doneIds.has(p.id) : false
        const blocked = done && !canRetryPaket(p)
        return { paket: p, resolved, start, done, blocked }
      })
      .filter((r) => r.resolved === 'active' || r.resolved === 'scheduled' || r.resolved === 'finished')
      .sort((a, b) => {
        const order = { active: 0, scheduled: 1, finished: 2, draft: 3, archived: 4 } as Record<
          string,
          number
        >
        const d = (order[a.resolved] ?? 9) - (order[b.resolved] ?? 9)
        if (d !== 0) return d
        return a.start - b.start
      })

    const groups: { dayKey: string; label: string; items: typeof rows }[] = []
    const map = new Map<string, typeof rows>()
    rows.forEach((r) => {
      const ms = r.start || toMillis(r.paket.endAt) || Date.now()
      const d = new Date(ms)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    ;[...map.entries()]
      .sort((a, b) => {
        const sa = a[1][0]?.start || 0
        const sb = b[1][0]?.start || 0
        return sa - sb
      })
      .forEach(([key, items]) => {
        const ms = items[0]?.start || Date.now()
        groups.push({ dayKey: key, label: formatDayLabel(ms), items })
      })
    return groups
  }, [pakets, student, doneIds])

  const selected = selectedId ? pakets.find((p) => p.id === selectedId) : null

  const handleLogout = async () => {
    clearStudentSession()
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    navigate('/kerjakan', { replace: true })
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

  /** Klik kartu jadwal: langsung masuk jika tidak wajib token; jika wajib → fokus form token */
  const selectPaket = async (p: LatihanPaket) => {
    setSelectedId(p.id || null)
    setError('')
    const err = assertCanEnter(p)
    if (err) {
      setError(err)
      return
    }
    if (needsToken(p)) {
      setTimeout(() => tokenRef.current?.focus(), 50)
      return
    }
    // Tanpa token: login + jadwal aktif + penugasan
    setLoading(true)
    try {
      beginSession(p)
    } finally {
      setLoading(false)
    }
  }

  const startWithToken = async (tRaw: string) => {
    if (!student) return
    setError('')
    const t = tRaw.trim().toUpperCase()
    if (!t) {
      setError('Masukkan token latihan dari guru')
      return
    }

    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'latihan'), where('token', '==', t)))
      if (snap.empty) {
        setError('Token tidak ditemukan. Periksa lagi dengan guru.')
        return
      }
      const docSnap = snap.docs[0]
      const paket = { id: docSnap.id, ...docSnap.data() } as LatihanPaket

      const err = assertCanEnter(paket)
      if (err) {
        setError(err)
        return
      }
      if (!needsToken(paket)) {
        // Token diisi tapi paket tidak mewajibkannya — tetap izinkan masuk
      }
      beginSession(paket, t)
    } catch (err) {
      console.error(err)
      setError('Gagal memeriksa token. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Jika paket terpilih wajib token, validasi token cocok ke paket itu
    if (selected && needsToken(selected)) {
      const t = token.trim().toUpperCase()
      if (!t) {
        setError('Paket ini mewajibkan token dari guru')
        return
      }
      if (selected.token && t !== selected.token.toUpperCase()) {
        setError('Token tidak cocok untuk paket yang dipilih')
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
      return
    }
    await startWithToken(token)
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const firstName = student.fullName.split(/\s+/)[0]

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-4 pb-12">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Ruang Kuis</p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">Halo, {firstName}!</h1>
            <p className="text-sm text-gray-500">
              {student.className ? `Kelas ${student.className}` : 'Siswa'}
              {student.nickname ? ` · ${student.nickname}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/kerjakan/riwayat"
              className="text-xs font-medium text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              Riwayat
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-600 px-2.5 py-1.5"
            >
              Keluar
            </button>
          </div>
        </div>

        {urgentPakets.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
              Segera berakhir
            </p>
            {urgentPakets.map((p) => {
              const h = hoursUntilEnd(p)
              const label =
                h == null
                  ? ''
                  : h < 1
                    ? `${Math.max(1, Math.round(h * 60))} menit lagi`
                    : `${Math.round(h)} jam lagi`
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPaket(p)}
                  className="block w-full text-left text-sm text-amber-950 hover:underline"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-amber-800/80"> · {label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            {selected && needsToken(selected) ? 'Token diperlukan' : 'Token (opsional)'}
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            {selected && needsToken(selected)
              ? 'Guru mewajibkan token untuk paket ini.'
              : 'Sebagian besar kuis cukup diklik dari jadwal. Token hanya jika guru mengaktifkannya.'}
            {selected && (
              <span className="block mt-1 text-indigo-600 font-medium">
                Dipilih: {selected.title}
                {needsToken(selected) ? ' · wajib token' : ' · tanpa token'}
              </span>
            )}
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
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
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition"
            >
              {loading ? 'Memeriksa...' : 'Mulai latihan'}
            </button>
          </form>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Jadwal kuis</h2>
            <span className="text-[11px] text-gray-400">
              {loadingList ? 'Memuat…' : `${pakets.length} paket`}
            </span>
          </div>

          {loadingList ? (
            <p className="text-sm text-gray-400 text-center py-8">Memuat jadwal...</p>
          ) : schedule.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Belum ada jadwal latihan. Tunggu guru membuka paket.
            </div>
          ) : (
            <div className="space-y-5">
              {schedule.map((group) => (
                <div key={group.dayKey}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="relative space-y-2 pl-3 border-l-2 border-gray-100">
                    {group.items.map(({ paket: p, resolved, done, blocked }) => {
                      const sub = p.subjectKey ? getSubject(p.subjectKey) : null
                      const subMeta = SUBJECTS.find((s) => s.key === p.subjectKey)
                      const isSel = selectedId === p.id
                      const canStart = resolved === 'active' && !blocked

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPaket(p)}
                          className={`w-full text-left bg-white rounded-xl border shadow-sm pl-3 pr-3 py-3 border-l-4 transition ${cardAccent(
                            resolved
                          )} ${
                            isSel
                              ? 'border-indigo-300 ring-2 ring-indigo-100'
                              : 'border-gray-100 hover:border-indigo-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusStyle(
                                    resolved
                                  )}`}
                                >
                                  {LATIHAN_STATUS_LABELS[resolved]}
                                </span>
                                {done && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                                    Sudah dikerjakan
                                  </span>
                                )}
                                {blocked && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                                    Tidak bisa diulang
                                  </span>
                                )}
                                {sub && (
                                  <span className="text-[10px] text-gray-500">
                                    {subMeta?.icon} {sub.shortName}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {formatRange(p.startAt, p.endAt)}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {p.questionCount || p.questionIds?.length || 0} soal
                                {p.timeLimitMinutes
                                  ? ` · batas ${p.timeLimitMinutes} mnt`
                                  : ''}
                                {canStart && !done
                                  ? needsToken(p)
                                    ? ' · ketuk lalu masukkan token'
                                    : ' · ketuk untuk mulai'
                                  : ''}
                                {blocked ? ' · sudah dikerjakan' : ''}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
