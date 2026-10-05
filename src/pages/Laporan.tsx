import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'
import {
  buildNilaiPerMapelCsv,
  buildRekapSiswaCsv,
  buildDetailAttemptCsv,
  buildNilaiPerMapelTable,
  buildRekapSiswaTable,
  buildDetailAttemptTable,
  downloadCsv,
  downloadPdfTable,
  stampFilename,
} from '../lib/exportGrades'

type TabKey = 'ringkasan' | 'siswa' | 'tp' | 'latihan'
type TrendRange = 'week' | 'month'

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

const colors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
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

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m} mnt ${s} dtk` : `${m} mnt`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} jam ${rm} mnt` : `${h} jam`
}

function formatShortDate(ms: number) {
  return new Date(ms).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function studentKey(a: { studentId?: string | null; studentName: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${a.studentName.trim().toLowerCase()}`
}

function weekKey(ms: number) {
  const d = new Date(ms)
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthKey(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelWeek(key: string) {
  const m = key.match(/W(\d+)/)
  return m ? `Mgg ${m[1]}` : key
}

function labelMonth(key: string) {
  const [y, mo] = key.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const i = Number(mo) - 1
  return `${names[i] || mo} ${String(y).slice(2)}`
}

export default function Laporan() {
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [pakets, setPakets] = useState<LatihanPaket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('ringkasan')
  const [filterSubject, setFilterSubject] = useState<SubjectKey | ''>('')
  const [filterLatihan, setFilterLatihan] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterScore, setFilterScore] = useState<'all' | 'pass' | 'fail'>('all')
  const [trendRange, setTrendRange] = useState<TrendRange>('month')
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null)

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

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    attempts.forEach((a) => {
      const c = (a.studentClass || '').trim()
      if (c) set.add(c)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'id'))
  }, [attempts])

  const filteredAttempts = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return attempts.filter((a) => {
      if (filterLatihan && a.latihanId !== filterLatihan) return false
      if (filterSubject) {
        const p = paketMap.get(a.latihanId)
        if (!p || p.subjectKey !== filterSubject) return false
      }
      if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
      if (filterScore === 'pass' && (a.percent || 0) < 70) return false
      if (filterScore === 'fail' && (a.percent || 0) >= 70) return false
      if (q) {
        const name = (a.studentName || '').toLowerCase()
        const title = (a.latihanTitle || paketMap.get(a.latihanId)?.title || '').toLowerCase()
        if (!name.includes(q) && !title.includes(q)) return false
      }
      return true
    })
  }, [attempts, filterLatihan, filterSubject, filterClass, filterScore, searchQ, paketMap])

  const stats = useMemo(() => {
    const list = filteredAttempts
    const n = list.length
    const avg = n ? Math.round(list.reduce((s, a) => s + (a.percent || 0), 0) / n) : 0
    const uniqueStudents = new Set(list.map((a) => studentKey(a))).size
    const uniqueLatihan = new Set(list.map((a) => a.latihanId)).size
    const totalMs = list.reduce((s, a) => s + (a.durationMs || 0), 0)
    const pass = list.filter((a) => (a.percent || 0) >= 70).length
    const passRate = n ? Math.round((pass / n) * 100) : 0
    const paketInScope = pakets.filter((p) => !filterSubject || p.subjectKey === filterSubject)
    const doneIds = new Set(list.map((a) => a.latihanId))
    const completion =
      paketInScope.length > 0
        ? Math.round((paketInScope.filter((p) => p.id && doneIds.has(p.id)).length / paketInScope.length) * 100)
        : 0
    return {
      n,
      avg,
      uniqueStudents,
      uniqueLatihan,
      totalMs,
      passRate,
      completion,
      paketCount: paketInScope.length,
      paketDone: paketInScope.filter((p) => p.id && doneIds.has(p.id)).length,
    }
  }, [filteredAttempts, pakets, filterSubject])

  const trendSeries = useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number; ms: number }>()
    filteredAttempts.forEach((a) => {
      const t = toMillis(a.finishedAt) || toMillis(a.startedAt)
      if (!t) return
      const key = trendRange === 'week' ? weekKey(t) : monthKey(t)
      const cur = buckets.get(key) || { sum: 0, n: 0, ms: 0 }
      cur.sum += a.percent || 0
      cur.n += 1
      cur.ms += a.durationMs || 0
      buckets.set(key, cur)
    })
    const keys = [...buckets.keys()].sort()
    const sliced = keys.slice(-12)
    return sliced.map((key) => {
      const b = buckets.get(key)!
      return {
        key,
        label: trendRange === 'week' ? labelWeek(key) : labelMonth(key),
        avg: b.n ? Math.round(b.sum / b.n) : 0,
        n: b.n,
        minutes: Math.round(b.ms / 60000),
      }
    })
  }, [filteredAttempts, trendRange])

  const byStudent = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        name: string
        studentId?: string
        class?: string
        attempts: number
        avgPercent: number
        totalScore: number
        totalQ: number
        totalMs: number
        lastAt: number | null
        tp: Record<string, { correct: number; total: number }>
      }
    >()
    filteredAttempts.forEach((a) => {
      const key = studentKey(a)
      const cur = map.get(key) || {
        key,
        name: a.studentName.trim(),
        studentId: a.studentId || undefined,
        class: a.studentClass,
        attempts: 0,
        avgPercent: 0,
        totalScore: 0,
        totalQ: 0,
        totalMs: 0,
        lastAt: null as number | null,
        tp: {} as Record<string, { correct: number; total: number }>,
      }
      cur.attempts += 1
      cur.totalScore += a.score || 0
      cur.totalQ += a.total || 0
      cur.totalMs += a.durationMs || 0
      if (a.studentClass) cur.class = a.studentClass
      const fin = toMillis(a.finishedAt) || toMillis(a.startedAt)
      if (fin && (cur.lastAt == null || fin > cur.lastAt)) cur.lastAt = fin
      if (a.tpSummary) {
        Object.entries(a.tpSummary).forEach(([tp, v]) => {
          if (!cur.tp[tp]) cur.tp[tp] = { correct: 0, total: 0 }
          cur.tp[tp].correct += v.correct
          cur.tp[tp].total += v.total
        })
      }
      map.set(key, cur)
    })
    return [...map.values()]
      .map((s) => ({
        ...s,
        avgPercent: s.totalQ ? Math.round((s.totalScore / s.totalQ) * 100) : 0,
      }))
      .sort((a, b) => b.avgPercent - a.avgPercent)
  }, [filteredAttempts])

  const selectedStudent = useMemo(
    () => (selectedStudentKey ? byStudent.find((s) => s.key === selectedStudentKey) || null : null),
    [byStudent, selectedStudentKey]
  )

  const studentAttempts = useMemo(() => {
    if (!selectedStudentKey) return []
    return filteredAttempts
      .filter((a) => studentKey(a) === selectedStudentKey)
      .sort((a, b) => {
        const ta = toMillis(a.finishedAt) || 0
        const tb = toMillis(b.finishedAt) || 0
        return tb - ta
      })
  }, [filteredAttempts, selectedStudentKey])

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

  const weakTp = useMemo(() => {
    return [...byTp].filter((r) => r.total >= 2).sort((a, b) => a.percent - b.percent).slice(0, 5)
  }, [byTp])

  const byLatihan = useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; subjectKey?: SubjectKey; n: number; avg: number; totalMs: number }
    >()
    filteredAttempts.forEach((a) => {
      const p = paketMap.get(a.latihanId)
      const cur = map.get(a.latihanId) || {
        id: a.latihanId,
        title: a.latihanTitle || p?.title || a.latihanId,
        subjectKey: p?.subjectKey,
        n: 0,
        avg: 0,
        totalMs: 0,
      }
      cur.n += 1
      cur.avg += a.percent || 0
      cur.totalMs += a.durationMs || 0
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

  const maxTrendAvg = Math.max(100, ...trendSeries.map((p) => p.avg), 1)

  const exportInput = () => ({
    attempts,
    paketMap,
    filterSubject: filterSubject || undefined,
    filterClass: filterClass || undefined,
  })

  return (
    <Layout title="Laporan" subtitle="Progress siswa dari hasil kuis — skor, waktu pengerjaan, dan capaian TP">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Cari siswa / judul latihan</label>
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Ketik nama atau judul paket…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mata pelajaran</label>
            <select
              value={filterSubject}
              onChange={(e) => {
                setFilterSubject(e.target.value as SubjectKey | '')
                setFilterLatihan('')
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[140px]"
            >
              <option value="">Semua mapel</option>
              {SUBJECTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.shortName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Paket latihan</label>
            <select
              value={filterLatihan}
              onChange={(e) => setFilterLatihan(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[180px] max-w-[260px]"
            >
              <option value="">Semua paket</option>
              {pakets
                .filter((p) => !filterSubject || p.subjectKey === filterSubject)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kelas</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[100px]"
            >
              <option value="">Semua</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Skor</label>
            <select
              value={filterScore}
              onChange={(e) => setFilterScore(e.target.value as 'all' | 'pass' | 'fail')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[120px]"
            >
              <option value="all">Semua</option>
              <option value="pass">≥ 70%</option>
              <option value="fail">< 70%</option>
            </select>
          </div>
          {(filterSubject || filterLatihan || searchQ || filterClass || filterScore !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setFilterSubject('')
                setFilterLatihan('')
                setSearchQ('')
                setFilterClass('')
                setFilterScore('all')
              }}
              className="text-xs text-gray-500 hover:text-indigo-600 pb-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Export nilai</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Mengikuti filter mapel & kelas di atas. CSV untuk Excel · PDF untuk arsip/cetak.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-10">CSV</span>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                downloadCsv(stampFilename('nilai_per_mapel', 'csv'), buildNilaiPerMapelCsv(exportInput()))
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Nilai per mapel
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                downloadCsv(stampFilename('rekap_siswa', 'csv'), buildRekapSiswaCsv(exportInput()))
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Rekap siswa
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                downloadCsv(stampFilename('detail_pengerjaan', 'csv'), buildDetailAttemptCsv(exportInput()))
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Detail attempt
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-400 w-10">PDF</span>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                void downloadPdfTable(
                  stampFilename('nilai_per_mapel', 'pdf'),
                  buildNilaiPerMapelTable(exportInput())
                )
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Nilai per mapel
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                void downloadPdfTable(
                  stampFilename('rekap_siswa', 'pdf'),
                  buildRekapSiswaTable(exportInput())
                )
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Rekap siswa
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => {
                void downloadPdfTable(
                  stampFilename('detail_pengerjaan', 'pdf'),
                  buildDetailAttemptTable(exportInput())
                )
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Detail attempt
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {[
          {
            label: 'Pengerjaan kuis',
            value: loading ? '…' : String(stats.n),
            hint: `${stats.uniqueLatihan} paket`,
            icon: '📝',
            tint: 'bg-indigo-50 text-indigo-600',
          },
          {
            label: 'Siswa unik',
            value: loading ? '…' : String(stats.uniqueStudents),
            hint: 'dari filter aktif',
            icon: '👥',
            tint: 'bg-sky-50 text-sky-600',
          },
          {
            label: 'Rata-rata skor',
            value: loading ? '…' : stats.n ? `${stats.avg}%` : '—',
            hint: `${stats.passRate}% ≥ 70`,
            icon: '🎯',
            tint: 'bg-emerald-50 text-emerald-600',
          },
          {
            label: 'Waktu pengerjaan',
            value: loading ? '…' : formatDuration(stats.totalMs),
            hint: 'akumulasi dari kuis',
            icon: '⏱',
            tint: 'bg-amber-50 text-amber-600',
          },
          {
            label: 'Paket tersentuh',
            value: loading ? '…' : stats.paketCount ? `${stats.completion}%` : '—',
            hint: `${stats.paketDone}/${stats.paketCount || 0} paket`,
            icon: '📊',
            tint: 'bg-violet-50 text-violet-600',
          },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-gray-400">{c.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{c.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{c.hint}</p>
              </div>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${c.tint}`}>
                {c.icon}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
              if (t.key !== 'siswa') setSelectedStudentKey(null)
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ringkasan' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Tren skor</h2>
              <div className="flex gap-1">
                {(['week', 'month'] as TrendRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTrendRange(r)}
                    className={`text-xs px-2.5 py-1 rounded-lg ${
                      trendRange === r
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {r === 'week' ? 'Mingguan' : 'Bulanan'}
                  </button>
                ))}
              </div>
            </div>
            {trendSeries.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Belum ada data tren.</p>
            ) : (
              <div className="flex items-end gap-2 h-40">
                {trendSeries.map((p) => (
                  <div key={p.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-[10px] text-gray-500 tabular-nums">{p.avg}%</span>
                    <div
                      className="w-full max-w-[36px] bg-indigo-500 rounded-t-md transition-all"
                      style={{ height: `${Math.max(4, (p.avg / maxTrendAvg) * 100)}%` }}
                      title={`${p.n} kuis · ${p.minutes} mnt`}
                    />
                    <span className="text-[10px] text-gray-400 truncate w-full text-center">{p.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {weakTp.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">TP yang perlu perhatian</h2>
              <ul className="space-y-2">
                {weakTp.map((r) => (
                  <li key={r.tp} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-700 w-16">{r.tp}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          r.percent >= 70 ? 'bg-emerald-500' : r.percent >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                        }`}
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right tabular-nums">{r.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Top siswa (filter aktif)</h2>
            </div>
            {byStudent.length === 0 ? (
              <p className="p-6 text-sm text-gray-400 text-center">Belum ada data.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {byStudent.slice(0, 8).map((s, i) => (
                  <li key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${avatarColor(
                        s.name
                      )}`}
                    >
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {s.class || '—'} · {s.attempts} kuis
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        s.avgPercent >= 70
                          ? 'text-emerald-600'
                          : s.avgPercent >= 40
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {s.avgPercent}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'siswa' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Daftar siswa</h2>
            </div>
            {byStudent.length === 0 ? (
              <p className="p-6 text-sm text-gray-400 text-center">Belum ada data.</p>
            ) : (
              <ul className="max-h-[28rem] overflow-y-auto divide-y divide-gray-50">
                {byStudent.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentKey(s.key)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition ${
                        selectedStudentKey === s.key ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(
                          s.name
                        )}`}
                      >
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-[11px] text-gray-400">
                          {s.class || '—'} · {s.attempts} kuis
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-gray-700">{s.avgPercent}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            {!selectedStudent ? (
              <p className="text-sm text-gray-400 text-center py-12">Pilih siswa untuk melihat detail.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(
                      selectedStudent.name
                    )}`}
                  >
                    {initials(selectedStudent.name)}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{selectedStudent.name}</h3>
                    <p className="text-xs text-gray-500">
                      {selectedStudent.class || '—'} · {selectedStudent.attempts} kuis · rata-rata{' '}
                      <strong>{selectedStudent.avgPercent}%</strong>
                    </p>
                    {selectedStudent.lastAt && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Terakhir: {formatShortDate(selectedStudent.lastAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3 font-medium">Paket</th>
                        <th className="py-2 pr-3 font-medium text-right">Skor</th>
                        <th className="py-2 pr-3 font-medium text-right">Waktu</th>
                        <th className="py-2 font-medium text-right">Selesai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentAttempts.map((a) => (
                        <tr key={a.id} className="border-b border-gray-50">
                          <td className="py-2 pr-3 text-gray-800">{a.latihanTitle || a.latihanId}</td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">{a.percent ?? 0}%</td>
                          <td className="py-2 pr-3 text-right text-gray-500 tabular-nums">
                            {formatDuration(a.durationMs)}
                          </td>
                          <td className="py-2 text-right text-gray-500 text-xs">
                            {toMillis(a.finishedAt) ? formatShortDate(toMillis(a.finishedAt)!) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'tp' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Capaian per Tujuan Pembelajaran</h2>
          </div>
          {byTp.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Belum ada data TP.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Kode TP</th>
                    <th className="px-4 py-2.5 font-medium text-right">Benar</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium text-right">Persen</th>
                  </tr>
                </thead>
                <tbody>
                  {byTp.map((r) => (
                    <tr key={r.tp} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.tp}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.correct}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                          r.percent >= 70
                            ? 'text-emerald-600'
                            : r.percent >= 40
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        }`}
                      >
                        {r.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'latihan' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Ringkasan per paket latihan</h2>
          </div>
          {byLatihan.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Belum ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Judul</th>
                    <th className="px-4 py-2.5 font-medium">Mapel</th>
                    <th className="px-4 py-2.5 font-medium text-right">Pengerjaan</th>
                    <th className="px-4 py-2.5 font-medium text-right">Rata-rata</th>
                    <th className="px-4 py-2.5 font-medium text-right">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {byLatihan.map((r) => (
                    <tr key={r.id} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.title}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {r.subjectKey ? getSubject(r.subjectKey)?.shortName || r.subjectKey : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.n}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                          r.avg >= 70
                            ? 'text-emerald-600'
                            : r.avg >= 40
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        }`}
                      >
                        {r.avg}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">
                        {formatDuration(r.totalMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
