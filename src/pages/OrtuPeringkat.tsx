import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import {
  SUBJECTS,
  type LatihanAttempt,
  type LatihanPaket,
} from '../types/question'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = { id: string; fullName: string; className?: string }

function studentKey(a: { studentId?: string | null; studentName?: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${(a.studentName || '').trim().toLowerCase()}`
}

interface RankRow {
  key: string
  name: string
  className?: string
  attempts: number
  avg: number
  rank: number
  isChild: boolean
}

function scoreTone(pct: number) {
  if (pct >= 70) return 'text-emerald-600'
  if (pct >= 40) return 'text-amber-600'
  return 'text-red-600'
}

/**
 * Peringkat anak — privasi-aware: posisi + total peserta.
 * Nama peserta lain disamarkan (kecuali anak sendiri).
 */
export default function OrtuPeringkat() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState<string>('all')
  const [filterLatihan, setFilterLatihan] = useState<string>('all')
  const [scope, setScope] = useState<'class' | 'all'>('class')
  const [showNames, setShowNames] = useState(false)

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
        const [aSnap, pSnap] = await Promise.all([
          getDocs(collection(db, 'attempts')),
          getDocs(collection(db, 'latihan')),
        ])
        if (!cancelled) {
          setAttempts(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt)))
          setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
        }
      } catch (err) {
        console.error(err)
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

  const paketMap = useMemo(() => {
    const m = new Map<string, LatihanPaket>()
    pakets.forEach((p) => {
      if (p.id) m.set(p.id, p)
    })
    return m
  }, [pakets])

  const childKey = useMemo(() => {
    if (!selectedChild) return ''
    return studentKey({ studentId: selectedChild.id, studentName: selectedChild.fullName })
  }, [selectedChild])

  const paketOptions = useMemo(() => {
    return pakets
      .filter((p) => filterSubject === 'all' || p.subjectKey === filterSubject)
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'))
  }, [pakets, filterSubject])

  const ranks: RankRow[] = useMemo(() => {
    if (!selectedChild) return []
    const myClass = (selectedChild.className || '').trim()

    const filtered = attempts.filter((a) => {
      if (scope === 'class' && myClass) {
        if ((a.studentClass || '').trim() !== myClass) return false
      }
      if (filterLatihan !== 'all') {
        if (a.latihanId !== filterLatihan) return false
      } else if (filterSubject !== 'all') {
        const p = paketMap.get(a.latihanId)
        if (!p || p.subjectKey !== filterSubject) return false
      }
      return true
    })

    const map = new Map<
      string,
      { name: string; className?: string; sum: number; n: number; best: number }
    >()

    filtered.forEach((a) => {
      const key = studentKey(a)
      const cur = map.get(key) || {
        name: a.studentName || '—',
        className: a.studentClass || undefined,
        sum: 0,
        n: 0,
        best: 0,
      }
      const pct = a.percent ?? 0
      cur.sum += pct
      cur.n += 1
      cur.best = Math.max(cur.best, pct)
      if (a.studentName) cur.name = a.studentName
      if (a.studentClass) cur.className = a.studentClass
      map.set(key, cur)
    })

    const useBest = filterLatihan !== 'all'

    const rows: RankRow[] = [...map.entries()].map(([key, v]) => ({
      key,
      name: v.name,
      className: v.className,
      attempts: v.n,
      avg: useBest ? v.best : v.n ? Math.round(v.sum / v.n) : 0,
      rank: 0,
      isChild: key === childKey,
    }))

    rows.sort(
      (a, b) => b.avg - a.avg || b.attempts - a.attempts || a.name.localeCompare(b.name, 'id')
    )
    rows.forEach((r, i) => {
      r.rank = i + 1
    })
    return rows
  }, [attempts, paketMap, filterSubject, filterLatihan, scope, selectedChild, childKey])

  const me = ranks.find((r) => r.isChild)

  const displayRows = useMemo(() => {
    if (ranks.length <= 12) return ranks
    const top = ranks.slice(0, 10)
    if (me && me.rank > 10) return [...top, me]
    return top
  }, [ranks, me])

  const displayName = (r: RankRow) => {
    if (r.isChild) return selectedChild?.fullName || 'Anak Ayah/Bunda'
    if (showNames) return r.name
    return `Peserta #${r.rank}`
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const hasClass = !!(selectedChild?.className || '').trim()

  return (
    <OrtuLayout title="Peringkat" subtitle={selectedChild?.fullName} parentName={session.fullName}>
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

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-3.5 py-2.5 text-xs text-indigo-900 leading-relaxed">
          Peringkat dari <strong>rata-rata skor kuis</strong>
          {filterLatihan !== 'all' ? ' (skor terbaik di paket yang dipilih)' : ''}. Nama peserta
          lain disamarkan demi privasi — Ayah/Bunda dapat menampilkannya jika perlu.
        </div>

        <section className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm px-3 py-3.5 text-center">
            <p className="text-[10px] text-gray-400 font-medium uppercase">Peringkat</p>
            <p className="text-2xl font-bold text-indigo-600 mt-0.5 tabular-nums">
              {loading ? '…' : me ? `#${me.rank}` : '—'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {me ? `dari ${ranks.length}` : 'belum ada data'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3.5 text-center">
            <p className="text-[10px] font-medium text-gray-400 font-medium uppercase">
              {filterLatihan !== 'all' ? 'Skor' : 'Rata-rata'}
            </p>
            <p
              className={`text-2xl font-bold mt-0.5 tabular-nums ${
                me ? scoreTone(me.avg) : 'text-gray-300'
              }`}
            >
              {loading ? '…' : me ? `${me.avg}%` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3.5 text-center">
            <p className="text-[10px] text-gray-400 font-medium uppercase">Kuis</p>
            <p className="text-2xl font-bold text-sky-600 mt-0.5 tabular-nums">
              {loading ? '…' : me ? String(me.attempts) : '0'}
            </p>
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setScope('class')}
              disabled={!hasClass}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                scope === 'class'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              } disabled:opacity-40`}
            >
              Kelas {selectedChild?.className || '—'}
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                scope === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Semua siswa
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={filterSubject}
              onChange={(e) => {
                setFilterSubject(e.target.value)
                setFilterLatihan('all')
              }}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="all">Semua mapel</option>
              {SUBJECTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.shortName} — {s.name}
                </option>
              ))}
            </select>
            <select
              value={filterLatihan}
              onChange={(e) => setFilterLatihan(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="all">Semua paket (rata-rata)</option>
              {paketOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showNames}
              onChange={(e) => setShowNames(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Tampilkan nama peserta lain
          </label>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Papan peringkat</h2>
            <span className="text-[11px] text-gray-400">{ranks.length} peserta</span>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-gray-400">Memuat…</p>
          ) : ranks.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              Belum ada data peringkat untuk filter ini.
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {displayRows.map((r) => (
                <li
                  key={r.key}
                  className={`px-4 py-3 flex items-center gap-3 ${
                    r.isChild ? 'bg-indigo-50/70' : ''
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      r.rank === 1
                        ? 'bg-amber-100 text-amber-800'
                        : r.rank === 2
                          ? 'bg-slate-200 text-slate-700'
                          : r.rank === 3
                            ? 'bg-orange-100 text-orange-800'
                            : r.isChild
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm truncate ${
                        r.isChild ? 'font-semibold text-indigo-900' : 'font-medium text-gray-800'
                      }`}
                    >
                      {displayName(r)}
                      {r.isChild && (
                        <span className="ml-1.5 text-[10px] font-medium text-indigo-600 bg-indigo-100/80 px-1.5 py-0.5 rounded">
                          Anak Ayah/Bunda
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {r.attempts} kuis
                      {r.className ? ` · ${r.className}` : ''}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${scoreTone(r.avg)}`}>
                    {r.avg}%
                  </span>
                </li>
              ))}
              {ranks.length > 12 && me && me.rank > 10 && (
                <li className="px-4 py-2 text-center text-[11px] text-gray-400">
                  … {me.rank - 10} peringkat di atas anak Ayah/Bunda disembunyikan
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </OrtuLayout>
  )
}
