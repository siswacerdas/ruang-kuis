import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import {
  SUBJECTS,
  getSubject,
  type SubjectKey,
  type LatihanAttempt,
  type LatihanPaket,
} from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = { id: string; fullName: string; className?: string }

type SubjectRow = {
  subjectKey: string
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
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OrtuNilai() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [paketMap, setPaketMap] = useState<Map<string, LatihanPaket>>(new Map())
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
      try {
        const pSnap = await getDocs(collection(db, 'latihan'))
        const map = new Map<string, LatihanPaket>()
        pSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as LatihanPaket))
        if (!cancelled) setPaketMap(map)
      } catch (err) {
        console.warn(err)
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
        const list: LatihanAttempt[] = []
        const nameKey = selectedChild.fullName.trim().toLowerCase()
        const match = (a: { studentId?: string | null; studentName?: string }) => {
          if (a.studentId && a.studentId === selectedChild.id) return true
          return (a.studentName || '').trim().toLowerCase() === nameKey
        }
        try {
          const byId = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', selectedChild.id))
          )
          byId.docs.forEach((d) => list.push({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch {
          try {
            const all = await getDocs(collection(db, 'attempts'))
            all.docs.forEach((d) => {
              const a = { id: d.id, ...d.data() } as LatihanAttempt
              if (match(a)) list.push(a)
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
            list.push({
              id: d.id,
              ...raw,
              latihanId: `practice:${d.id}`,
              latihanTitle: String(raw.title || raw.latihanTitle || 'Latihan mandiri'),
              subjectKey: raw.subjectKey,
            } as LatihanAttempt & { subjectKey?: string })
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
              list.push({
                id: d.id,
                ...raw,
                latihanId: `practice:${d.id}`,
                latihanTitle: String(raw.title || raw.latihanTitle || 'Latihan mandiri'),
                subjectKey: raw.subjectKey,
              } as LatihanAttempt & { subjectKey?: string })
            })
          } catch (err) {
            console.warn(err)
          }
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
          const sub = getSubject(key as SubjectKey)
          row = {
            subjectKey: key,
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
      const p = a.latihanId ? paketMap.get(a.latihanId) : undefined
      const fromPractice = (a as { subjectKey?: string }).subjectKey
      const sk = (p?.subjectKey as string) || fromPractice || 'unknown'
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
      avg: Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n),
      count: n,
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
    <OrtuLayout title="Nilai mapel" subtitle={selectedChild?.fullName} parentName={session.fullName}>
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

        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
          <div>
            <p className="text-[11px] text-gray-400 uppercase">Total</p>
            <p className="text-xl font-bold">{loading ? '…' : overall.count}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase">Rata-rata</p>
            <p className="text-xl font-bold">
              {loading ? '…' : overall.avg != null ? `${overall.avg}%` : '—'}
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500">Termasuk kuis guru dan latihan mandiri / ortu.</p>

        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">Memuat…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
            Belum ada nilai.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.subjectKey} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{r.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900">{r.label}</p>
                    <p className="text-[11px] text-gray-400">
                      {r.count} pengerjaan · terbaik {r.bestPercent}%
                      {r.lastAt ? ` · terakhir ${formatShort(r.lastAt)}` : ''}
                    </p>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-indigo-600">{r.avgPercent}%</span>
                </div>
                <ul className="space-y-1.5 border-t border-gray-50 pt-2">
                  {r.attempts.slice(0, 5).map((a) => {
                    const fin = toMillis(a.finishedAt)
                    return (
                      <li key={a.id} className="flex justify-between text-xs text-gray-600 gap-2">
                        <span className="truncate">{a.latihanTitle || 'Latihan'}</span>
                        <span className="shrink-0 tabular-nums">
                          {a.percent ?? 0}%{fin ? ` · ${formatShort(fin)}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OrtuLayout>
  )
}
