import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

/**
 * Laporan progress siswa — berbasis attempts (kuis).
 * Pola referensi LMS: kartu ringkas, tren skor, velocity waktu pengerjaan, drill-down per siswa.
 */

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


/** Kunci stabil: studentId bila ada, else nama (data lama). */
function studentKey(a: { studentId?: string | null; studentName: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${a.studentName.trim().toLowerCase()}`
}


function weekKey(ms: number) {
  const d = new Date(ms)
  // ISO-ish: year-Wxx based on Thursday of week
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
  // 2026-W40 → W40
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
    const uniqueStudents = new Set(list.map((a) => studentKey(a))).size
    const uniqueLatihan = new Set(list.map((a) => a.latihanId)).size
    const totalMs = list.reduce((s, a) => s + (a.durationMs || 0), 0)
    const pass = list.filter((a) => (a.percent || 0) >= 70).length
    const passRate = n ? Math.round((pass / n) * 100) : 0
    // paket di filter mapel (untuk “penyelesaian” kasar)
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

  /** Tren skor rata-rata per bucket waktu */
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
    // batasi 12 bucket terakhir agar chart rapi
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
  const maxMinutes = Math.max(...trendSeries.map((p) => p.minutes), 1)

  return (
    <Layout title="Laporan" subtitle="Progress siswa dari hasil kuis — skor, waktu pengerjaan, dan capaian TP">
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
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[200px] max-w-[280px]"
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

      {/* Stat cards — pola referensi dashboard */}
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

      {/* Tren + velocity + rekomendasi TP lemah */}
      {!loading && filteredAttempts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-5">
          {/* Performance trend */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Tren skor kuis</h2>
                <p className="text-[11px] text-gray-400">Rata-rata persen benar per periode</p>
              </div>
              <div className="flex gap-1 bg-gray-50 rounded-lg p-0.5">
                {(
                  [
                    ['week', 'Minggu'],
                    ['month', 'Bulan'],
                  ] as const
                ).map(([k, lab]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTrendRange(k)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      trendRange === k ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            {trendSeries.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">Belum ada tanggal selesai pada attempt.</p>
            ) : (
              <div className="h-44 flex items-end gap-1.5 sm:gap-2">
                {trendSeries.map((p) => (
                  <div key={p.key} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] font-semibold text-gray-600 tabular-nums">{p.avg}%</span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md bg-indigo-500/90 hover:bg-indigo-600 transition min-h-[4px]"
                        style={{ height: `${Math.max(4, (p.avg / maxTrendAvg) * 100)}%` }}
                        title={`${p.label}: rata-rata ${p.avg}% · ${p.n} pengerjaan`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 truncate w-full text-center">{p.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Velocity + weak TP */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900">Waktu pengerjaan</h2>
              <p className="text-[11px] text-gray-400 mb-3">Menit kuis per periode (bukan jam belajar mandiri)</p>
              {trendSeries.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">—</p>
              ) : (
                <div className="h-28 flex items-end gap-1">
                  {trendSeries.map((p) => (
                    <div key={p.key} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
                      <div
                        className="w-full rounded-t bg-violet-400/90 min-h-[2px]"
                        style={{ height: `${Math.max(2, (p.minutes / maxMinutes) * 100)}%` }}
                        title={`${p.label}: ${p.minutes} menit`}
                      />
                      <span className="text-[9px] text-gray-400 truncate w-full text-center">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900">Perhatian TP</h2>
              <p className="text-[11px] text-gray-400 mb-3">Capaian terendah (≥2 jawaban tercatat)</p>
              {weakTp.length === 0 ? (
                <p className="text-sm text-gray-400">Belum cukup data TP. Pastikan soal punya kode TP.</p>
              ) : (
                <ul className="space-y-2">
                  {weakTp.map((row) => (
                    <li key={row.tp} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-700 w-20 truncate" title={row.tp}>
                        {row.tp}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            row.percent >= 70 ? 'bg-emerald-500' : row.percent >= 40 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${row.percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500 w-14 text-right">
                        {row.percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
            Setelah siswa mengerjakan lewat <code className="bg-gray-100 px-1 rounded">/kerjakan</code>, progress
            muncul di sini.
          </p>
        </div>
      ) : tab === 'ringkasan' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Pengerjaan terbaru</h2>
            <span className="text-[11px] text-gray-400">maks. 40 baris</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
            {filteredAttempts.slice(0, 40).map((a) => {
              const p = paketMap.get(a.latihanId)
              const fin = toMillis(a.finishedAt)
              return (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full ${avatarColor(a.studentName)} text-white flex items-center justify-center text-[11px] font-semibold shrink-0`}
                  >
                    {initials(a.studentName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.studentName}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {a.latihanTitle || p?.title}
                      {a.studentClass ? ` · ${a.studentClass}` : ''}
                      {fin ? ` · ${formatShortDate(fin)}` : ''}
                      {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-semibold ${
                        a.percent >= 70 ? 'text-emerald-600' : a.percent >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}
                    >
                      {a.percent}%
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {a.score}/{a.total}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentKey(studentKey(a))
                      setTab('siswa')
                    }}
                    className="text-xs text-indigo-600 hover:underline shrink-0"
                  >
                    Profil
                  </button>
                  {p && (
                    <Link
                      to={`/latihan-soal/${p.id}/hasil`}
                      className="text-xs text-gray-500 hover:text-indigo-600 shrink-0"
                    >
                      Paket
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === 'siswa' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
              selectedStudent ? 'lg:col-span-5' : 'lg:col-span-12'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">Siswa</th>
                    <th className="px-2 py-3 font-medium">Kelas</th>
                    <th className="px-2 py-3 font-medium text-center">Kuis</th>
                    <th className="px-2 py-3 font-medium text-center">Waktu</th>
                    <th className="px-4 py-3 font-medium text-right">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {byStudent.map((s) => (
                    <tr
                      key={s.key}
                      className={`border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer transition ${
                        selectedStudentKey === s.key ? 'bg-indigo-50/70' : ''
                      }`}
                      onClick={() => setSelectedStudentKey(s.key)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full ${avatarColor(s.name)} text-white flex items-center justify-center text-[11px] font-semibold`}
                          >
                            {initials(s.name)}
                          </div>
                          <span className="font-medium text-gray-900">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-gray-500">{s.class || '—'}</td>
                      <td className="px-2 py-3 text-center text-gray-600">{s.attempts}</td>
                      <td className="px-2 py-3 text-center text-gray-500 text-xs">
                        {formatDuration(s.totalMs)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold ${
                            s.avgPercent >= 70
                              ? 'text-emerald-600'
                              : s.avgPercent >= 40
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {s.avgPercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drill-down siswa */}
          {selectedStudent && (
            <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[32rem]">
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-full ${avatarColor(selectedStudent.name)} text-white flex items-center justify-center text-sm font-semibold shrink-0`}
                  >
                    {initials(selectedStudent.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{selectedStudent.name}</p>
                    <p className="text-xs text-gray-500">
                      {selectedStudent.class || 'Kelas —'} · {selectedStudent.attempts} kuis · rata-rata{' '}
                      <span
                        className={
                          selectedStudent.avgPercent >= 70
                            ? 'text-emerald-600 font-semibold'
                            : selectedStudent.avgPercent >= 40
                              ? 'text-amber-600 font-semibold'
                              : 'text-red-600 font-semibold'
                        }
                      >
                        {selectedStudent.avgPercent}%
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudentKey(null)}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Tutup
                </button>
              </div>

              <div className="px-5 py-3 grid grid-cols-3 gap-2 shrink-0 border-b border-gray-50">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-gray-400">Benar / soal</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedStudent.totalScore}/{selectedStudent.totalQ}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-gray-400">Waktu kuis</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDuration(selectedStudent.totalMs)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-gray-400">Terakhir</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedStudent.lastAt ? formatShortDate(selectedStudent.lastAt) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
                {/* TP siswa */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Capaian TP
                  </h3>
                  {Object.keys(selectedStudent.tp).length === 0 ? (
                    <p className="text-sm text-gray-400">Belum ada ringkasan TP pada attempt siswa ini.</p>
                  ) : (
                    <ul className="space-y-2">
                      {Object.entries(selectedStudent.tp)
                        .map(([tp, v]) => ({
                          tp,
                          ...v,
                          percent: v.total ? Math.round((v.correct / v.total) * 100) : 0,
                        }))
                        .sort((a, b) => a.tp.localeCompare(b.tp, 'id'))
                        .map((row) => (
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
                            <span className="text-[11px] text-gray-500 w-16 text-right">
                              {row.correct}/{row.total}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </section>

                {/* Riwayat */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Riwayat kuis
                  </h3>
                  <div className="space-y-2">
                    {studentAttempts.map((a) => {
                      const p = paketMap.get(a.latihanId)
                      const fin = toMillis(a.finishedAt)
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {a.latihanTitle || p?.title || 'Latihan'}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {fin ? formatShortDate(fin) : '—'}
                              {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              a.percent >= 70
                                ? 'text-emerald-600'
                                : a.percent >= 40
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {a.percent}%
                          </span>
                          {p && (
                            <Link
                              to={`/latihan-soal/${p.id}/hasil`}
                              className="text-[11px] text-indigo-600 hover:underline shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Detail
                            </Link>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}
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
                  {row.tp}
                </span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      row.percent >= 70 ? 'bg-emerald-500' : row.percent >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-24 text-right">
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
                    {sub?.shortName || '—'} · {row.n} pengerjaan · {formatDuration(row.totalMs)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-lg font-bold ${
                      row.avg >= 70 ? 'text-emerald-600' : row.avg >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}
                  >
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
