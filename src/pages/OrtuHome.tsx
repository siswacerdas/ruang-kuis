import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { ensureParentSession, clearParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import type { LatihanAttempt } from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

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
    soft: 'bg-sky-50 border-sky-100',
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
    soft: 'bg-emerald-50 border-emerald-100',
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
    soft: 'bg-amber-50 border-amber-100',
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
    soft: 'bg-violet-50 border-violet-100',
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
      setShowGuide(!s.guideSeenAt)

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
        let list: LatihanAttempt[] = []
        try {
          const byId = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', selectedChild.id))
          )
          list = byId.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch {
          /* index */
        }
        if (list.length === 0) {
          try {
            const all = await getDocs(collection(db, 'attempts'))
            const nameKey = selectedChild.fullName.trim().toLowerCase()
            list = all.docs
              .map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
              .filter((a) => {
                if (a.studentId && a.studentId === selectedChild.id) return true
                return (a.studentName || '').trim().toLowerCase() === nameKey
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

  const dismissGuide = async () => {
    setShowGuide(false)
    if (!session?.parentId) return
    try {
      await updateDoc(doc(db, 'parents', session.parentId), {
        guideSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('guideSeenAt', err)
    }
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
    <OrtuLayout parentName={session.fullName} hideHeader>
      <div className="space-y-5 -mt-1">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-200/40">
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-6 bottom-0 w-32 h-32 rounded-full bg-fuchsia-400/20 blur-2xl" />
          <div className="relative px-5 pt-5 pb-6 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-indigo-100 text-xs font-medium tracking-wide">
                  Portal orang tua · Ruang Kuis
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">
                  Halo, {firstName}
                </h1>
                <p className="text-indigo-100/90 text-sm mt-1.5 leading-relaxed max-w-sm">
                  Pantau belajar anak, nilai kuis, dan buat latihan khusus — semua di satu tempat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition shrink-0"
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

        {showGuide && (
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 sm:p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-indigo-950">Panduan singkat</p>
                <ul className="mt-2 space-y-1.5 text-xs text-indigo-900/80 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-indigo-400">✓</span>
                    Riwayat kuis guru & latihan mandiri, lengkap dengan durasi pengerjaan.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-400">✓</span>
                    Nilai per mapel dari kuis saja (bukan nilai proyek sekolah).
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-400">✓</span>
                    Peringkat privasi: posisi anak + total peserta.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-400">✓</span>
                    Buat latihan khusus hanya untuk anak Anda.
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={dismissGuide}
                  className="mt-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-xl transition"
                >
                  Mengerti
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4 flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-200/50 shrink-0">
              {childInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider">
                Sedang dipantau
              </p>
              <h2 className="text-lg font-bold text-gray-900 truncate leading-snug">
                {selectedChild?.fullName || '—'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedChild?.className ? `Kelas ${selectedChild.className}` : 'Kelas belum diisi'}
                {selectedChild?.nickname ? ` · ${selectedChild.nickname}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 border-t border-gray-50">
            <div className="px-3 py-4 text-center border-r border-gray-50">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Kuis</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                {loadingAttempts ? '…' : stats.count}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">total</p>
            </div>
            <div className="px-3 py-4 text-center border-r border-gray-50">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Rata-rata</p>
              <p
                className={`text-2xl font-bold tabular-nums mt-1 ${
                  avgTone ? avgTone.text : 'text-gray-300'
                }`}
              >
                {loadingAttempts
                  ? '…'
                  : stats.avgPercent != null
                    ? `${stats.avgPercent}%`
                    : '—'}
              </p>
              {stats.avgPercent != null && (
                <div className="mt-1.5 mx-auto h-1.5 w-12 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${avgTone?.bar || 'bg-gray-300'}`}
                    style={{ width: `${Math.min(100, stats.avgPercent)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="px-3 py-4 text-center">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Minggu ini</p>
              <p className="text-2xl font-bold text-sky-600 tabular-nums mt-1">
                {loadingAttempts ? '…' : stats.thisWeek}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">pengerjaan</p>
            </div>
          </div>

          {stats.lastAt && (
            <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-50 text-[11px] text-gray-500 flex items-center justify-between gap-2">
              <span>Terakhir mengerjakan</span>
              <span className="font-medium text-gray-700">
                {formatShort(stats.lastAt)}
                {stats.lastPercent != null ? ` · ${stats.lastPercent}%` : ''}
              </span>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 px-0.5">
            Menu cepat
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {QUICK.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`group relative rounded-2xl border ${item.soft} p-4 hover:shadow-md transition overflow-hidden`}
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

        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Aktivitas terbaru</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Kuis yang dikerjakan anak</p>
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
                      </p>
                    </div>
                    <div className="shrink-0 w-14">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${tone.bar}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                      />
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
