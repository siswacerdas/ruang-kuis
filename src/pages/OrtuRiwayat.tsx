import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import type { LatihanAttempt } from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = { id: string; fullName: string; className?: string }

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

export default function OrtuRiwayat() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
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
        let list: LatihanAttempt[] = []
        try {
          const byId = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', selectedChild.id))
          )
          list = byId.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch {
          /* */
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
          Kuis dari guru. Durasi dihitung dari waktu mulai sampai selesai (jika tersedia).
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
              return (
                <li
                  key={a.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{a.latihanTitle || 'Latihan'}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {fin ? formatShort(fin) : '—'}
                      {' · '}
                      Durasi {formatDuration(a.durationMs)}
                      {' · '}
                      {a.score}/{a.total} benar
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
