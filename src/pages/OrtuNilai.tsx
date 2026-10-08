import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = { id: string; fullName: string; className?: string }

type SubjectRow = {
  subjectKey: SubjectKey | 'unknown'
  label: string
  shortName: string
  icon: string
  count: number
  avgPercent: number
  bestPercent: number
  lastAt: number | null
  totalDurationMs: number
  attempts: LatihanAttempt[]
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
  return new Date(ms).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
  if (pct >= 70) return 'text-emerald-600'
  if (pct >= 40) return 'text-amber-600'
  return 'text-red-600'
}

function barColor(pct: number) {
  if (pct >= 70) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-red-400'
}

/**
 * Ringkasan nilai per mapel dari kuis/latihan saja (bukan Input Nilai admin).
 */
export default function OrtuNilai() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [paketMap, setPaketMap] = useState<Map<string, LatihanPaket>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

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
            })
          } else kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        } catch {
          kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        }
      }

      let pMap = new Map<string, LatihanPaket>()
      try {
        const pSnap = await getDocs(collection(db, 'latihan'))
        pSnap.docs.forEach((d) => pMap.set(d.id, { id: d.id, ...d.data() } as LatihanPaket))
      } catch (err) {
        console.warn('latihan', err)
      }

      if (!cancelled) {
        setChildren(kids)
        setSelectedChildId(kids[0]?.id || '')
        setPaketMap(pMap)
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
      setLoading(true)
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
          const all = await getDocs(collection(db, 'attempts'))
          const nameKey = selectedChild.fullName.trim().toLowerCase()
          list = all.docs
            .map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
            .filter((a) => {
              if (a.studentId && a.studentId === selectedChild.id) return true
              return (a.studentName || '').trim().toLowerCase() === nameKey
            })
        }
        list.sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0))
        if (!cancelled) setAttempts(list)
      } catch (err) {
        console.error(err)
        if (!cancelled) setAttempts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedChild?.id, selectedChild?.fullName])

  const rows: SubjectRow[] = useMemo(() => {
    const map = new Map<string, SubjectRow>()

    const ensure = (key: string): SubjectRow => {
      let row = map.get(key)
      if (!row) {
        if (key === 'unknown') {
          row = {
            subjectKey: 'unknown',
            label: 'Mapel belum ditentukan',
            shortName: '—',
            icon: '📋',
            count: 0,
            avgPercent: 0,
            bestPercent: 0,
            lastAt: null,
            totalDurationMs: 0,
            attempts: [],
          }
        } else {
          const sub = getSubject(key)
          row = {
            subjectKey: key as SubjectKey,
            label: sub?.name || key,
            shortName: sub?.shortName || key,
            icon: sub?.icon || '📘',
            count: 0,
            avgPercent: 0,
            bestPercent: 0,
            lastAt: null,
            totalDurationMs: 0,
            attempts: [],
          }
        }
        map.set(key, row)
      }
      return row
    }

    attempts.forEach((a) => {
      const p = paketMap.get(a.latihanId)
      const sk = (p?.subjectKey as string) || 'unknown'
      const row = ensure(sk)
      row.count += 1
      row.avgPercent += a.percent || 0
      row.bestPercent = Math.max(row.bestPercent, a.percent || 0)
      row.totalDurationMs += a.durationMs || 0
      const fin = toMillis(a.finishedAt)
      if (fin && (row.lastAt == null || fin > row.lastAt)) row.lastAt = fin
      row.attempts.push(a)
    })

    return [...map.values()]
      .map((r) => ({
        ...r,
        avgPercent: r.count ? Math.round(r.avgPercent / r.count) : 0,
        attempts: [...r.attempts].sort(
          (a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0)
        ),
      }))
      .sort((a, b) => {
        const ia = SUBJECTS.findIndex((s) => s.key === a.subjectKey)
        const ib = SUBJECTS.findIndex((s) => s.key === b.subjectKey)
        if (a.subjectKey === 'unknown') return 1
        if (b.subjectKey === 'unknown') return -1
        if (ia >= 0 && ib >= 0) return ia - ib
        return a.label.localeCompare(b.label, 'id')
      })
  }, [attempts, paketMap])

  const overall = useMemo(() => {
    const n = attempts.length
    if (!n) return { avg: null as number | null, count: 0 }
    return {
      count: n,
      avg: Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n),
    }
  }, [attempts])

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <OrtuLayout title="Nilai" subtitle={selectedChild?.fullName} parentName={session.fullName}>
      <div className="space-y-4">
        {children.length > 1 && (
          <select
            value={selectedChildId}
            onChange={(e) => {
              setSelectedChildId(e.target.value)
              setExpanded(null)
            }}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
                {c.className ? ` · ${c.className}` : ''}
              </option>
            ))}
          </select>
        )}

        <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-3.5 py-2.5 text-xs text-sky-900 leading-relaxed">
          Nilai di bawah dihitung dari <strong>kuis & latihan</strong> yang dikerjakan anak. Tidak
          termasuk nilai proyek / aktivitas yang diinput guru di sekolah.
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Rata-rata semua mapel</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                overall.avg != null ? scoreTone(overall.avg) : 'text-gray-400'
              }`}
            >
              {loading ? '…' : overall.avg != null ? `${overall.avg}%` : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Total pengerjaan</p>
            <p className="text-lg font-semibold text-gray-900 tabular-nums">
              {loading ? '…' : overall.count}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">Memuat…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
            Belum ada nilai kuis untuk anak ini.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const key = String(r.subjectKey)
              const open = expanded === key
              return (
                <li
                  key={key}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : key)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50/80 transition"
                  >
                    <span className="text-xl shrink-0" aria-hidden>
                      {r.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.label}</p>
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                          {r.shortName}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-[12rem]">
                        <div
                          className={`h-full rounded-full ${barColor(r.avgPercent)}`}
                          style={{ width: `${Math.min(100, r.avgPercent)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {r.count} kali · terbaik {r.bestPercent}%
                        {r.lastAt ? ` · terakhir ${formatShort(r.lastAt)}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold tabular-nums ${scoreTone(r.avgPercent)}`}>
                        {r.avgPercent}%
                      </p>
                      <p className="text-[10px] text-gray-400">{open ? 'Tutup' : 'Detail'}</p>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-gray-50 bg-gray-50/40 px-4 py-3">
                      <p className="text-[11px] text-gray-500 mb-2">
                        Total waktu: {formatDuration(r.totalDurationMs)}
                      </p>
                      <ul className="space-y-2">
                        {r.attempts.map((a) => {
                          const fin = toMillis(a.finishedAt)
                          const pct = a.percent ?? 0
                          return (
                            <li
                              key={a.id}
                              className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-900 truncate">
                                  {a.latihanTitle || 'Latihan'}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {fin ? formatShort(fin) : '—'}
                                  {' · '}
                                  {formatDuration(a.durationMs)}
                                  {' · '}
                                  {a.score}/{a.total}
                                </p>
                              </div>
                              <span className={`text-sm font-semibold tabular-nums ${scoreTone(pct)}`}>
                                {pct}%
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </OrtuLayout>
  )
}
