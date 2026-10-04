import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useNavigate } from 'react-router-dom'
import type { LatihanAttempt } from '../types/question'

interface StudentSession {
  studentId: string
  fullName: string
  nickname?: string
  email: string
  className?: string
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

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} mnt ${s} dtk` : `${m} mnt`
}

export default function KerjakanRiwayat() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_student')
    if (!raw) {
      navigate('/kerjakan')
      return
    }
    try {
      const s = JSON.parse(raw) as StudentSession
      setStudent(s)
      loadAttempts(s)
    } catch {
      navigate('/kerjakan')
    }
  }, [navigate])

  const loadAttempts = async (s: StudentSession) => {
    setLoading(true)
    try {
      const byId: LatihanAttempt[] = []
      const byName: LatihanAttempt[] = []

      if (s.studentId) {
        try {
          const snap = await getDocs(
            query(collection(db, 'attempts'), where('studentId', '==', s.studentId))
          )
          snap.docs.forEach((d) => byId.push({ id: d.id, ...d.data() } as LatihanAttempt))
        } catch (err) {
          console.warn('query studentId', err)
        }
      }

      // Fallback data lama (tanpa studentId) — cocokkan nama
      try {
        const snap = await getDocs(
          query(collection(db, 'attempts'), where('studentName', '==', s.fullName))
        )
        snap.docs.forEach((d) => byName.push({ id: d.id, ...d.data() } as LatihanAttempt))
      } catch (err) {
        console.warn('query studentName', err)
      }

      const map = new Map<string, LatihanAttempt>()
      ;[...byId, ...byName].forEach((a) => {
        if (a.id) map.set(a.id, a)
      })
      const list = [...map.values()].sort((a, b) => {
        const ta = toMillis(a.finishedAt) || 0
        const tb = toMillis(b.finishedAt) || 0
        return tb - ta
      })
      setAttempts(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const n = attempts.length
    if (!n) return { n: 0, avg: 0, best: 0, totalMs: 0 }
    const avg = Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / n)
    const best = Math.max(...attempts.map((a) => a.percent || 0))
    const totalMs = attempts.reduce((s, a) => s + (a.durationMs || 0), 0)
    return { n, avg, best, totalMs }
  }, [attempts])

  const tpAgg = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>()
    attempts.forEach((a) => {
      if (!a.tpSummary) return
      Object.entries(a.tpSummary).forEach(([tp, v]) => {
        const cur = map.get(tp) || { correct: 0, total: 0 }
        cur.correct += v.correct
        cur.total += v.total
        map.set(tp, cur)
      })
    })
    return [...map.entries()]
      .map(([tp, v]) => ({
        tp,
        ...v,
        percent: v.total ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.percent - b.percent || a.tp.localeCompare(b.tp, 'id'))
  }, [attempts])

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-4 pb-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Riwayat kuis</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {student.fullName}
              {student.className ? ` · Kelas ${student.className}` : ''}
            </p>
          </div>
          <Link
            to="/kerjakan/token"
            className="text-sm text-indigo-600 hover:underline font-medium"
          >
            ← Token
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-[10px] text-gray-400">Kuis</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{loading ? '…' : stats.n}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-[10px] text-gray-400">Rata-rata</p>
            <p className="text-xl font-bold text-indigo-600 tabular-nums">
              {loading ? '…' : stats.n ? `${stats.avg}%` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-[10px] text-gray-400">Terbaik</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">
              {loading ? '…' : stats.n ? `${stats.best}%` : '—'}
            </p>
          </div>
        </div>

        {tpAgg.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Capaian TP (akumulasi)
            </h2>
            <ul className="space-y-2">
              {tpAgg.map((row) => (
                <li key={row.tp} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 w-24 truncate" title={row.tp}>
                    {row.tp}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.percent >= 70
                          ? 'bg-emerald-500'
                          : row.percent >= 40
                            ? 'bg-amber-400'
                            : 'bg-red-400'
                      }`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 w-12 text-right tabular-nums">
                    {row.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan</h2>
            {stats.totalMs > 0 && (
              <p className="text-[11px] text-gray-400">Total waktu: {formatDuration(stats.totalMs)}</p>
            )}
          </div>
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-400">Memuat riwayat...</p>
          ) : attempts.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              Belum ada kuis yang dikerjakan. Masukkan token dari guru untuk mulai.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {attempts.map((a) => {
                const fin = toMillis(a.finishedAt)
                return (
                  <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.latihanTitle || 'Latihan'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {fin ? formatShort(fin) : '—'}
                        {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        (a.percent || 0) >= 70
                          ? 'text-emerald-600'
                          : (a.percent || 0) >= 40
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {a.percent ?? 0}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
