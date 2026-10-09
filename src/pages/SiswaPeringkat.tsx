import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureStudentSession, type StudentSession } from '../lib/studentSession'
import { Link, useNavigate } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

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
  isMe: boolean
}

export default function SiswaPeringkat() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState<string>('all')
  const [scope, setScope] = useState<'class' | 'all'>('class')

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
      try {
        const [aSnap, pSnap] = await Promise.all([
          getDocs(collection(db, 'attempts')),
          getDocs(collection(db, 'latihan')),
        ])
        if (cancelled) return
        setAttempts(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt)))
        setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const paketMap = useMemo(() => {
    const m = new Map<string, LatihanPaket>()
    pakets.forEach((p) => {
      if (p.id) m.set(p.id, p)
    })
    return m
  }, [pakets])

  const myKey = useMemo(() => {
    if (!student) return ''
    return studentKey({ studentId: student.studentId, studentName: student.fullName })
  }, [student])

  const ranks: RankRow[] = useMemo(() => {
    if (!student) return []
    const myClass = (student.className || '').trim()

    const filtered = attempts.filter((a) => {
      if (scope === 'class' && myClass) {
        if ((a.studentClass || '').trim() !== myClass) return false
      }
      if (filterSubject !== 'all') {
        const p = paketMap.get(a.latihanId)
        if (!p || p.subjectKey !== filterSubject) return false
      }
      return true
    })

    const map = new Map<string, { name: string; className?: string; sum: number; n: number }>()
    filtered.forEach((a) => {
      const key = studentKey(a)
      const cur = map.get(key) || {
        name: a.studentName || '—',
        className: a.studentClass || undefined,
        sum: 0,
        n: 0,
      }
      cur.sum += a.percent ?? 0
      cur.n += 1
      if (a.studentName) cur.name = a.studentName
      if (a.studentClass) cur.className = a.studentClass
      map.set(key, cur)
    })

    const rows = [...map.entries()].map(([key, v]) => ({
      key,
      name: v.name,
      className: v.className,
      attempts: v.n,
      avg: v.n ? Math.round(v.sum / v.n) : 0,
      rank: 0,
      isMe: key === myKey,
    }))

    rows.sort((a, b) => b.avg - a.avg || b.attempts - a.attempts || a.name.localeCompare(b.name, 'id'))
    rows.forEach((r, i) => {
      r.rank = i + 1
    })
    return rows
  }, [attempts, paketMap, filterSubject, scope, student, myKey])

  const me = ranks.find((r) => r.isMe)

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const firstName = student.fullName.split(/\s+/)[0]
  const initial = (student.fullName.trim()[0] || 'S').toUpperCase()

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">Peringkat</p>
              <p className="text-xs text-gray-500 truncate">
                {student.fullName}
                {student.className ? ` · Kelas ${student.className}` : ''}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 space-y-6">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white p-6 sm:p-8 shadow-sm">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 100% 0%, rgba(255,255,255,0.28), transparent 42%)',
            }}
          />
          <div className="relative z-10 max-w-xl">
            <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wide mb-1">
              Kompetisi sehat
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
              Halo {firstName}, di mana posisimu?
            </h1>
            <p className="text-indigo-100 text-sm leading-relaxed">
              Peringkat dihitung dari rata-rata skor kuis.
              {student.className
                ? ` Default: kelas ${student.className}.`
                : ' Belum ada kelas di profil — menampilkan semua peserta.'}
            </p>
          </div>
        </section>

        {/* Posisi saya */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm px-5 py-4 sm:col-span-1">
            <p className="text-[11px] text-gray-400 font-medium">Peringkatmu</p>
            <p className="text-3xl font-bold text-indigo-600 mt-1 tabular-nums">
              {loading ? '…' : me ? `#${me.rank}` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {me ? `dari ${ranks.length} peserta` : 'Belum ada attempt di filter ini'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] text-gray-400 font-medium">Rata-rata skor</p>
            <p className="text-3xl font-bold text-violet-600 mt-1 tabular-nums">
              {loading ? '…' : me ? `${me.avg}%` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-[11px] text-gray-400 font-medium">Kuis dikerjakan</p>
            <p className="text-3xl font-bold text-sky-600 mt-1 tabular-nums">
              {loading ? '…' : me ? String(me.attempts) : '0'}
            </p>
          </div>
        </section>

        {/* Filter */}
        <section className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setScope('class')}
              disabled={!student.className}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                scope === 'class'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              } disabled:opacity-40`}
            >
              Kelas{student.className ? ` ${student.className}` : ''}
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
              Semua peserta
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilterSubject('all')}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                filterSubject === 'all'
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Semua mapel
            </button>
            {SUBJECTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilterSubject(s.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  filterSubject === s.key
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {s.icon} {s.shortName}
              </button>
            ))}
          </div>
        </section>

        {/* Board */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Papan peringkat</h2>
            <span className="text-[11px] text-gray-400">
              {loading ? 'Memuat…' : `${ranks.length} peserta`}
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-white rounded-2xl border border-gray-100 animate-pulse" />
              ))}
            </div>
          ) : ranks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <p className="text-gray-600 font-medium">Belum ada data</p>
              <p className="text-sm text-gray-400 mt-1">Kerjakan kuis dulu untuk masuk peringkat.</p>
              <Link
                to="/siswa"
                className="inline-flex mt-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl"
              >
                Ke beranda
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {ranks.map((r) => (
                <li
                  key={r.key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-sm ${
                    r.isMe
                      ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-100'
                      : r.rank <= 3
                        ? 'bg-amber-50/50 border-amber-100'
                        : 'bg-white border-gray-100'
                  }`}
                >
                  <span
                    className={`w-9 text-center font-bold tabular-nums shrink-0 ${
                      r.rank <= 3 ? 'text-lg' : 'text-sm text-gray-500'
                    }`}
                  >
                    {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {r.name}
                      {r.isMe && (
                        <span className="ml-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-md">
                          Kamu
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {r.className ? `Kelas ${r.className}` : '—'}
                      {' · '}
                      {r.attempts} kuis
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums shrink-0 ${
                      r.avg >= 70
                        ? 'text-emerald-600'
                        : r.avg >= 40
                          ? 'text-amber-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {r.avg}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {filterSubject !== 'all' && (
          <p className="text-[11px] text-gray-400 text-center">
            Menampilkan peringkat mapel{' '}
            <strong>{getSubject(filterSubject as SubjectKey)?.name || filterSubject}</strong>
          </p>
        )}
      </main>

      <StudentNav />
    </div>
  )
}
