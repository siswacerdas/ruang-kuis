import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { ensureParentSession, clearParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import type { LatihanAttempt } from '../types/question'
import OrtuLayout from '../components/OrtuLayout'
import OrtuGuideLightbox from '../components/OrtuGuideLightbox'
import { PARENT_GUIDE_MAX_LOGINS } from '../types/parent'

type ChildInfo = {
  id: string
  fullName: string
  className?: string
  nickname?: string
}

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

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m} mnt ${s} dtk` : `${m} mnt`
  const h = Math.floor(m / 60)
  return `${h} jam ${m % 60} mnt`
}

function scoreTone(pct: number) {
  if (pct >= 70) return { text: 'text-emerald-600', bar: 'bg-emerald-500', soft: 'bg-emerald-50' }
  if (pct >= 40) return { text: 'text-amber-600', bar: 'bg-amber-500', soft: 'bg-amber-50' }
  return { text: 'text-rose-600', bar: 'bg-rose-500', soft: 'bg-rose-50' }
}

const QUICK = [
  {
    to: '/ortu/riwayat',
    title: 'Riwayat',
    desc: 'Kuis & durasi',
    gradient: 'from-sky-500 to-cyan-500',
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
    to: '/ortu/nilai',
    title: 'Nilai mapel',
    desc: 'Rata-rata kuis',
    gradient: 'from-emerald-500 to-teal-500',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
  {
    to: '/ortu/peringkat',
    title: 'Peringkat',
    desc: 'Posisi anak',
    gradient: 'from-amber-500 to-orange-500',
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
    to: '/ortu/buat-kuis',
    title: 'Buat kuis',
    desc: 'Latihan anak',
    gradient: 'from-violet-500 to-fuchsia-500',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
    ),
  },
]

export default function OrtuHome() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState<string>('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureParentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login?tab=ortu', { replace: true })
        return
      }
      setSession(s)
      setShowGuide((s.loginCount ?? 0) <= PARENT_GUIDE_MAX_LOGINS)

      const kids: ChildInfo[] = []
      for (const id of s.studentIds || []) {
        try {
          const snap = await getDoc(doc(db, 'students', id))
          if (snap.exists()) {
            const d = snap.data()
            kids.push({
              id: snap.id,
              fullName: String(d.fullName || 'Siswa'),
              className: d.className ? String(d.className) : undefined,
              nickname: d.nickname ? String(d.nickname) : undefined,
            })
          } else {
            kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
          }
        } catch {
          kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        }
      }
      if (!cancelled) {
        setChildren(kids)
        setSelectedChildId(kids[0]?.id || '')
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0]

  useEffect(() => {
    if (!selectedChild) return
    let cancelled = false
    ;(async () => {
      setLoadingAttempts(true)
      try {
        const list: (LatihanAttempt & {
          _source?: 'guru' | 'ortu' | 'mandiri'
          title?: string
        })[] = []
        const nameKey = selectedChild.fullName.trim().toLowerCase()
        const match = (a: { studentId?: string | null; studentName?: string }) => {
          if (a.studentId && a.studentId === selectedChild.id) return true
          return (a.studentName || '').trim().toLowerCase() === nameKey
        }

        try {
          const byId = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', selectedChild.id))
          )
          byId.docs.forEach((d) => {
            list.push({ id: d.id, ...d.data(), _source: 'guru' } as LatihanAttempt & {
              _source: 'guru'
            })
          })
        } catch {
          try {
            const all = await getDocs(collection(db, 'attempts'))
            all.docs.forEach((d) => {
              const a = { id: d.id, ...d.data() } as LatihanAttempt
              if (!match(a)) return
              list.push({ ...a, _source: 'guru' })
            })
          } catch (err) {
            console.warn(err)
          }
        }

        try {
          const byId = await getDocs(
            query(collection(db, 'practiceAttempts'), where('studentId', '==', selectedChild.id))
          )
          byId.docs.forEach((d) => {
            const raw = d.data()
            const source =
              raw.createdByParent === true || raw.kind === 'parent_assigned' ? 'ortu' : 'mandiri'
            list.push({
              id: d.id,
              ...raw,
              latihanTitle: String(raw.title || raw.latihanTitle || 'Latihan mandiri'),
              _source: source,
            } as LatihanAttempt & { _source: 'ortu' | 'mandiri' })
          })
        } catch {
          try {
            const all = await getDocs(collection(db, 'practiceAttempts'))
            all.docs.forEach((d) => {
              const raw = d.data()
              if (
                !match({
                  studentId: raw.studentId as string | undefined,
                  studentName: raw.studentName as string | undefined,
                })
              )
                return
              const source =
                raw.createdByParent === true || raw.kind === 'parent_assigned' ? 'ortu' : 'mandiri'
              list.push({
                id: d.id,
                ...raw,
                latihanTitle: String(raw.title || raw.latihanTitle || 'Latihan mandiri'),
                _source: source,
              } as LatihanAttempt & { _source: 'ortu' | 'mandiri' })
            })
          } catch (err) {
            console.warn(err)
          }
        }

        list.sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0))
        if (!cancelled) setAttempts(list)
      } finally {
        if (!cancelled) setLoadingAttempts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedChild?.id, selectedChild?.fullName])

  const stats = useMemo(() => {
    const n = attempts.length
    const avg = n ? Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n) : null
    const last = attempts[0]
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = attempts.filter((a) => (toMillis(a.finishedAt) || 0) >= weekAgo).length
    return {
      count: n,
      avgPercent: avg,
      lastAt: last ? toMillis(last.finishedAt) : null,
      lastPercent: last?.percent ?? null,
      thisWeek,
    }
  }, [attempts])

  const dismissGuide = () => {
    setShowGuide(false)
  }

  const handleLogout = async () => {
    clearParentSession()
    try {
      await signOut(auth)
    } catch {
      /* */
    }
    navigate('/login?tab=ortu', { replace: true })
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <div className="text-center">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-400 text-sm">Memuat portal…</p>
        </div>
      </div>
    )
  }

  const recent = attempts.slice(0, 5)
  const firstName = (session.fullName || 'Orang tua').split(/\s+/)[0]
  const childInitial = ((selectedChild?.fullName || 'A').trim()[0] || 'A').toUpperCase()
  const avgTone = stats.avgPercent != null ? scoreTone(stats.avgPercent) : null

  return (
    <OrtuLayout
      parentName={session.fullName}
      title="Beranda"
      subtitle={selectedChild?.fullName || session.fullName}
      hideHeader
    >
      <div className="space-y-5 md:space-y-6">
        {showGuide && session && (
          <OrtuGuideLightbox
            parentName={session.fullName}
            loginCount={session.loginCount ?? 1}
            onClose={dismissGuide}
          />
        )}

        <section className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-200/40">
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-6 bottom-0 w-32 h-32 rounded-full bg-fuchsia-400/20 blur-2xl" />
          <div className="relative px-5 pt-5 pb-6 sm:px-6 md:px-8 md:py-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-indigo-100 text-xs font-medium tracking-wide">
                  Portal orang tua · Ruang Kuis
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">
                  Halo, {firstName}
                </h1>
                <p className="text-indigo-100/90 text-sm mt-1.5 leading-relaxed max-w-xl">
                  Pantau belajar anak, nilai kuis, dan buat latihan khusus — semua di satu tempat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="md:hidden text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition shrink-0"
              >
                Keluar
              </button>
            </div>

            {children.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {children.map((c) => {
                  const on = c.id === selectedChildId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedChildId(c.id)}
                      className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-semibold transition ${
                        on
                          ? 'bg-white text-indigo-700 shadow-md'
                          : 'bg-white/15 text-white hover:bg-white/25'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                          on ? 'bg-indigo-100 text-indigo-700' : 'bg-white/20 text-white'
                        }`}
                      >
                        {(c.fullName.trim()[0] || 'A').toUpperCase()}
                      </span>
                      <span className="truncate max-w-[9rem]">{c.fullName.split(/\s+/)[0]}</span>
                      {c.className && (
                        <span className={on ? 'text-indigo-400 font-medium' : 'text-white/60'}>
                          {c.className}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 flex items-center gap-3.5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-lg md:text-xl font-bold shadow-sm shrink-0">
              {childInitial}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider">
                Dipantau
              </p>
              <h2 className="text-base md:text-lg font-bold text-gray-900 truncate">
                {selectedChild?.fullName || '—'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {selectedChild?.className ? `Kelas ${selectedChild.className}` : 'Kelas —'}
                {selectedChild?.nickname ? ` · ${selectedChild.nickname}` : ''}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 md:px-5 text-center md:text-left">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Total kuis</p>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums mt-1">
              {loadingAttempts ? '…' : stats.count}
            </p>
            {stats.lastAt && (
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                Terakhir {formatShort(stats.lastAt)}
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 md:px-5 text-center md:text-left">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Rata-rata skor</p>
            <p
              className={`text-2xl md:text-3xl font-bold tabular-nums mt-1 ${
                avgTone ? avgTone.text : 'text-gray-300'
              }`}
            >
              {loadingAttempts ? '…' : stats.avgPercent != null ? `${stats.avgPercent}%` : '—'}
            </p>
            {stats.avgPercent != null && (
              <div className="mt-2 h-1.5 w-full max-w-[8rem] mx-auto md:mx-0 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${avgTone?.bar || 'bg-gray-300'}`}
                  style={{ width: `${Math.min(100, stats.avgPercent)}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 md:px-5 text-center md:text-left">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Minggu ini</p>
            <p className="text-2xl md:text-3xl font-bold text-sky-600 tabular-nums mt-1">
              {loadingAttempts ? '…' : stats.thisWeek}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">pengerjaan kuis</p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 px-0.5">
            Menu cepat
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {QUICK.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group relative rounded-2xl border border-gray-100 bg-white p-4 md:p-5 hover:shadow-md hover:border-gray-200 transition overflow-hidden"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} text-white flex items-center justify-center shadow-sm mb-3`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-900">{item.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{item.desc}</p>
                <span className="absolute top-3.5 right-3 text-gray-300 group-hover:text-gray-500 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Aktivitas terbaru</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Kuis guru, ortu, dan latihan mandiri</p>
            </div>
            <Link
              to="/ortu/riwayat"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
            >
              Semua
            </Link>
          </div>

          {loadingAttempts ? (
            <div className="p-10 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
              <p className="text-xs text-gray-400 mt-3">Memuat aktivitas…</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-300 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">Belum ada pengerjaan</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px] mx-auto">
                Saat anak menyelesaikan kuis, hasilnya akan muncul di sini.
              </p>
              <Link
                to="/ortu/buat-kuis"
                className="inline-flex mt-4 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-3.5 py-2 rounded-xl transition"
              >
                Buat latihan untuk anak
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recent.map((a) => {
                const fin = toMillis(a.finishedAt)
                const pct = a.percent ?? 0
                const tone = scoreTone(pct)
                const src = (a as { _source?: string })._source || 'guru'
                const srcLabel =
                  src === 'ortu' ? 'Ortu' : src === 'mandiri' ? 'Mandiri' : 'Guru'
                const srcClass =
                  src === 'ortu'
                    ? 'bg-violet-50 text-violet-700'
                    : src === 'mandiri'
                      ? 'bg-teal-50 text-teal-700'
                      : 'bg-indigo-50 text-indigo-700'
                return (
                  <li
                    key={a.id}
                    className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-gray-50/50 transition"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl ${tone.soft} flex items-center justify-center shrink-0`}
                    >
                      <span className={`text-sm font-bold tabular-nums ${tone.text}`}>{pct}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${srcClass}`}
                        >
                          {srcLabel}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {a.latihanTitle || 'Latihan'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-1.5">
                        <span>{fin ? formatShort(fin) : '—'}</span>
                        {a.durationMs ? (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>{formatDuration(a.durationMs)}</span>
                          </>
                        ) : null}
                        <span className="text-gray-300">·</span>
                        <span>
                          {a.score ?? '—'}/{a.total ?? '—'} benar
                        </span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <p className="text-center text-[11px] text-gray-400 pb-2">
          {session.email}
          {session.whatsapp ? ` · WA ${session.whatsapp}` : ''}
        </p>
      </div>
    </OrtuLayout>
  )
}
