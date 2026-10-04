import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  formatDateTime,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

type TabKey = 'ringkasan' | 'siswa' | 'tp' | 'latihan'

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

const colors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

export default function Laporan() {
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('ringkasan')
  const [filterSubject, setFilterSubject] = useState<SubjectKey | ''>('')
  const [filterLatihan, setFilterLatihan] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      let aSnap, pSnap
      try {
        aSnap = await getDocs(query(collection(db, 'attempts'), orderBy('finishedAt', 'desc')))
      } catch {
        aSnap = await getDocs(collection(db, 'attempts'))
      }
      try {
        pSnap = await getDocs(query(collection(db, 'latihan'), orderBy('createdAt', 'desc')))
      } catch {
        pSnap = await getDocs(collection(db, 'latihan'))
      }
      setAttempts(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt)))
      setPakets(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanPaket)))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const paketMap = useMemo(() => {
    const m = new Map<string, LatihanPaket>()
    pakets.forEach((p) => m.set(p.id!, p))
    return m
  }, [pakets])

  const filteredAttempts = useMemo(() => {
    return attempts.filter((a) => {
      if (filterLatihan && a.latihanId !== filterLatihan) return false
      if (filterSubject) {
        const p = paketMap.get(a.latihanId)
        if (!p || p.subjectKey !== filterSubject) return false
      }
      return true
    })
  }, [attempts, filterLatihan, filterSubject, paketMap])

  const stats = useMemo(() => {
    const list = filteredAttempts
    const n = list.length
    const avg = n ? Math.round(list.reduce((s, a) => s + (a.percent || 0), 0) / n) : 0
    const uniqueStudents = new Set(list.map((a) => a.studentName.toLowerCase())).size
    const uniqueLatihan = new Set(list.map((a) => a.latihanId)).size
    return { n, avg, uniqueStudents, uniqueLatihan }
  }, [filteredAttempts])

  /** Agregasi per siswa (nama) */
  const byStudent = useMemo(() => {
    const map = new Map<
      string,
      { name: string; class?: string; attempts: number; avgPercent: number; totalScore: number; totalQ: number }
    >()
    filteredAttempts.forEach((a) => {
      const key = a.studentName.trim().toLowerCase()
      const cur = map.get(key) || {
        name: a.studentName,
        class: a.studentClass,
        attempts: 0,
        avgPercent: 0,
        totalScore: 0,
        totalQ: 0,
      }
      cur.attempts += 1
      cur.totalScore += a.score || 0
      cur.totalQ += a.total || 0
      if (a.studentClass) cur.class = a.studentClass
      map.set(key, cur)
    })
    return [...map.values()]
      .map((s) => ({
        ...s,
        avgPercent: s.totalQ ? Math.round((s.totalScore / s.totalQ) * 100) : 0,
      }))
      .sort((a, b) => b.avgPercent - a.avgPercent)
  }, [filteredAttempts])

  /** Agregasi per TP */
  const byTp = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>()
    filteredAttempts.forEach((a) => {
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
      .sort((a, b) => a.tp.localeCompare(b.tp, 'id'))
  }, [filteredAttempts])

  /** Agregasi per paket latihan */
  const byLatihan = useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; subjectKey?: SubjectKey; n: number; avg: number }
    >()
    filteredAttempts.forEach((a) => {
      const p = paketMap.get(a.latihanId)
      const cur = map.get(a.latihanId) || {
        id: a.latihanId,
        title: a.latihanTitle || p?.title || a.latihanId,
        subjectKey: p?.subjectKey,
        n: 0,
        avg: 0,
      }
      cur.n += 1
      cur.avg += a.percent || 0
      map.set(a.latihanId, cur)
    })
    return [...map.values()]
      .map((x) => ({ ...x, avg: x.n ? Math.round(x.avg / x.n) : 0 }))
      .sort((a, b) => b.n - a.n)
  }, [filteredAttempts, paketMap])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'ringkasan', label: 'Ringkasan' },
    { key: 'siswa', label: 'Per siswa' },
    { key: 'tp', label: 'Capaian TP' },
    { key: 'latihan', label: 'Per latihan' },
  ]

  return (
    <Layout title="Laporan" subtitle="Rekap hasil latihan, capaian TP, dan progress siswa">
      {/* Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mata pelajaran</label>
          <select
            value={filterSubject}
            onChange={(e) => {
              setFilterSubject(e.target.value as SubjectKey | '')
              setFilterLatihan('')
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[160px]"
          >
            <option value="">Semua mapel</option>
            {SUBJECTS.map((s) => (
              <option key={s.key} value={s.key}>{s.shortName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Paket latihan</label>
          <select
            value={filterLatihan}
            onChange={(e) => setFilterLatihan(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[200px] max-w-[280px]"
          >
            <option value="">Semua paket</option>
            {pakets
              .filter((p) => !filterSubject || p.subjectKey === filterSubject)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
          </select>
        </div>
        {(filterSubject || filterLatihan) && (
          <button
            type="button"
            onClick={() => {
              setFilterSubject('')
              setFilterLatihan('')
            }}
            className="text-xs text-gray-500 hover:text-indigo-600 pb-2"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total pengerjaan', value: stats.n },
          { label: 'Siswa unik', value: stats.uniqueStudents },
          { label: 'Paket dikerjakan', value: stats.uniqueLatihan },
          { label: 'Rata-rata skor', value: stats.n ? `${stats.avg}%` : '—' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '…' : c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium transition ${
              tab === t.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-100 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Memuat laporan...</div>
      ) : filteredAttempts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-600 font-medium">Belum ada data pengerjaan</p>
          <p className="text-sm text-gray-400 mt-1">
            Setelah siswa mengerjakan lewat <code className="bg-gray-100 px-1 rounded">/kerjakan</code>, laporan akan muncul di sini.
          </p>
        </div>
      ) : tab === 'ringkasan' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan terbaru</h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
            {filteredAttempts.slice(0, 30).map((a) => {
              const p = paketMap.get(a.latihanId)
              return (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${avatarColor(a.studentName)} text-white flex items-center justify-center text-[11px] font-semibold shrink-0`}>
                    {initials(a.studentName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.studentName}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {a.latihanTitle || p?.title}
                      {a.studentClass ? ` · ${a.studentClass}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${
                      a.percent >= 70 ? 'text-emerald-600' : a.percent >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {a.percent}%
                    </p>
                    <p className="text-[11px] text-gray-400">{a.score}/{a.total}</p>
                  </div>
                  {p && (
                    <Link
                      to={`/latihan-soal/${p.id}/hasil`}
                      className="text-xs text-indigo-600 hover:underline shrink-0"
                    >
                      Detail
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === 'siswa' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-5 py-3 font-medium">Siswa</th>
                  <th className="px-3 py-3 font-medium">Kelas</th>
                  <th className="px-3 py-3 font-medium text-center">Latihan</th>
                  <th className="px-3 py-3 font-medium text-center">Benar/Total</th>
                  <th className="px-5 py-3 font-medium text-right">Rata-rata</th>
                </tr>
              </thead>
              <tbody>
                {byStudent.map((s) => (
                  <tr key={s.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${avatarColor(s.name)} text-white flex items-center justify-center text-[11px] font-semibold`}>
                          {initials(s.name)}
                        </div>
                        <span className="font-medium text-gray-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{s.class || '—'}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{s.attempts}</td>
                    <td className="px-3 py-3 text-center text-gray-600">
                      {s.totalScore}/{s.totalQ}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-semibold ${
                        s.avgPercent >= 70 ? 'text-emerald-600' : s.avgPercent >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {s.avgPercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'tp' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-xs text-gray-500 mb-2">
            Akumulasi jawaban benar per Tujuan Pembelajaran dari semua pengerjaan terfilter.
          </p>
          {byTp.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              Belum ada data TP. Pastikan soal memiliki field TP saat dibuat.
            </p>
          ) : (
            byTp.map((row) => (
              <div key={row.tp} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-800 w-28 truncate" title={row.tp}>
                  TP {row.tp}
                </span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      row.percent >= 70 ? 'bg-emerald-500' : row.percent >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right">
                  {row.correct}/{row.total} ({row.percent}%)
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {byLatihan.map((row) => {
            const sub = row.subjectKey ? getSubject(row.subjectKey) : null
            return (
              <Link
                key={row.id}
                to={`/latihan-soal/${row.id}/hasil`}
                className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-indigo-200 hover:shadow-md transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{row.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sub?.shortName || '—'} · {row.n} pengerjaan
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold ${
                    row.avg >= 70 ? 'text-emerald-600' : row.avg >= 40 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {row.avg}%
                  </p>
                  <p className="text-[11px] text-gray-400">rata-rata</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
