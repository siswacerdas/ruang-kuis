import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import type { LatihanAttempt } from '../types/question'
import OrtuLayout from '../components/OrtuLayout'
import { getRosterDoc } from '../lib/studentRoster'

type ChildInfo = { id: string; fullName: string; className?: string }

/** Baris riwayat gabungan kuis guru + latihan mandiri / ortu */
type HistoryRow = {
  id: string
  title: string
  finishedAt?: unknown
  durationMs?: number | null
  score?: number
  total?: number
  percent?: number
  source: 'guru' | 'ortu' | 'mandiri'
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
    year: 'numeric',
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

function sourceFromPractice(d: Record<string, unknown>): HistoryRow['source'] {
  if (d.createdByParent === true || d.kind === 'parent_assigned') return 'ortu'
  return 'mandiri'
}

function sourceBadge(source: HistoryRow['source']) {
  if (source === 'guru')
    return {
      label: 'Guru',
      className: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    }
  if (source === 'ortu')
    return {
      label: 'Ortu',
      className: 'bg-violet-50 text-violet-700 border-violet-100',
    }
  return {
    label: 'Mandiri',
    className: 'bg-teal-50 text-teal-700 border-teal-100',
  }
}

async function loadAttemptsForChild(child: ChildInfo): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = []
  const nameKey = child.fullName.trim().toLowerCase()

  const matchStudent = (a: { studentId?: string | null; studentName?: string }) => {
    if (a.studentId && a.studentId === child.id) return true
    return (a.studentName || '').trim().toLowerCase() === nameKey
  }

  try {
    const byId = await getDocs(
      query(collection(db, 'attempts'), where('studentId', '==', child.id))
    )
    byId.docs.forEach((d) => {
      const a = d.data() as LatihanAttempt
      rows.push({
        id: `g-${d.id}`,
        title: a.latihanTitle || 'Latihan guru',
        finishedAt: a.finishedAt,
        durationMs: a.durationMs,
        score: a.score,
        total: a.total,
        percent: a.percent,
        source: 'guru',
      })
    })
  } catch {
    try {
      const all = await getDocs(collection(db, 'attempts'))
      all.docs.forEach((d) => {
        const a = { id: d.id, ...d.data() } as LatihanAttempt
        if (!matchStudent(a)) return
        rows.push({
          id: `g-${d.id}`,
          title: a.latihanTitle || 'Latihan guru',
          finishedAt: a.finishedAt,
          durationMs: a.durationMs,
          score: a.score,
          total: a.total,
          percent: a.percent,
          source: 'guru',
        })
      })
    } catch (err) {
      console.warn('attempts', err)
    }
  }

  try {
    const byId = await getDocs(
      query(collection(db, 'practiceAttempts'), where('studentId', '==', child.id))
    )
    byId.docs.forEach((d) => {
      const a = d.data() as Record<string, unknown>
      rows.push({
        id: `p-${d.id}`,
        title: String(a.title || a.latihanTitle || 'Latihan mandiri'),
        finishedAt: a.finishedAt,
        durationMs: typeof a.durationMs === 'number' ? a.durationMs : null,
        score: typeof a.score === 'number' ? a.score : undefined,
        total: typeof a.total === 'number' ? a.total : undefined,
        percent: typeof a.percent === 'number' ? a.percent : undefined,
        source: sourceFromPractice(a),
      })
    })
  } catch {
    try {
      const all = await getDocs(collection(db, 'practiceAttempts'))
      all.docs.forEach((d) => {
        const a = d.data() as Record<string, unknown>
        if (
          !matchStudent({
            studentId: a.studentId as string | undefined,
            studentName: a.studentName as string | undefined,
          })
        )
          return
        rows.push({
          id: `p-${d.id}`,
          title: String(a.title || a.latihanTitle || 'Latihan mandiri'),
          finishedAt: a.finishedAt,
          durationMs: typeof a.durationMs === 'number' ? a.durationMs : null,
          score: typeof a.score === 'number' ? a.score : undefined,
          total: typeof a.total === 'number' ? a.total : undefined,
          percent: typeof a.percent === 'number' ? a.percent : undefined,
          source: sourceFromPractice(a),
        })
      })
    } catch (err) {
      console.warn('practiceAttempts', err)
    }
  }

  rows.sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0))
  return rows
}

export default function OrtuRiwayat() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [attempts, setAttempts] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

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
          const snap = await getRosterDoc(id)
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
      setLoading(true)
      try {
        const list = await loadAttemptsForChild(selectedChild)
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

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <OrtuLayout title="Riwayat" subtitle={selectedChild?.fullName} parentName={session.fullName}>
      <div className="space-y-4">
        {children.length > 1 && (
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
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

        <p className="text-xs text-gray-500">
          Semua pengerjaan anak: kuis guru, kuis dari orang tua, dan latihan mandiri. Durasi dihitung
          dari mulai sampai selesai (jika tersedia).
        </p>

        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">Memuat…</p>
        ) : attempts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
            Belum ada riwayat pengerjaan.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {attempts.map((a) => {
              const fin = toMillis(a.finishedAt)
              const pct = a.percent ?? 0
              const badge = sourceBadge(a.source)
              return (
                <li
                  key={a.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {fin ? formatShort(fin) : '—'}
                      {' · '}
                      Durasi {formatDuration(a.durationMs)}
                      {' · '}
                      {a.score ?? '—'}/{a.total ?? '—'} benar
                    </p>
                  </div>
                  <span
                    className={`text-base font-bold tabular-nums shrink-0 ${
                      pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}
                  >
                    {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </OrtuLayout>
  )
}
