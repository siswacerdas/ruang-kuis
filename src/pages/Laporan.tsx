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
import LaporanNilaiTp, { SiswaTpBreakdown } from '../components/LaporanNilaiTp'

type TabKey = 'ringkasan' | 'siswa' | 'nilai-tp' | 'tp' | 'latihan'

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

  /** Aktivitas 7 hari terakhir (mengikuti filter aktif). */
  const last7Days = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000
    const list = filteredAttempts.filter((a) => {
      const t = toMillis(a.finishedAt) || toMillis(a.startedAt)
      return t != null && t >= cutoff
    })
    const n = list.length
    const avg = n ? Math.round(list.reduce((s, a) => s + (a.percent || 0), 0) / n) : 0
    const students = new Set(list.map((a) => studentKey(a))).size
    return { n, avg, students }
  }, [filteredAttempts])

  /** Rata skor per mapel — paling lemah di atas. */
  const bySubjectAvg = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    filteredAttempts.forEach((a) => {
      const sk = paketMap.get(a.latihanId)?.subjectKey
      if (!sk) return
      const cur = map.get(sk) || { sum: 0, n: 0 }
      cur.sum += a.percent || 0
      cur.n += 1
      map.set(sk, cur)
    })
    return [...map.entries()]
      .map(([key, b]) => ({
        key,
        shortName: getSubject(key)?.shortName || key,
        name: getSubject(key)?.name || key,
        avg: b.n ? Math.round(b.sum / b.n) : 0,
        n: b.n,
      }))
      .sort((a, b) => a.avg - b.avg || b.n - a.n)
  }, [filteredAttempts, paketMap])

  /** Paket tanpa attempt atau rata skor < 70 (bukan draft/arsip). */
  const attentionPakets = useMemo(() => {
    const scoped = pakets.filter((p) => {
      if (!p.id) return false
      if (p.status === 'draft' || p.status === 'archived') return false
      if (filterSubject && p.subjectKey !== filterSubject) return false
      return true
    })
    return scoped
      .map((p) => {
        const list = attempts.filter((a) => {
          if (a.latihanId !== p.id) return false
          if (filterClass && (a.studentClass || '').trim() !== filterClass) return false
          return true
        })
        const n = list.length
        const avg = n ? Math.round(list.reduce((s, a) => s + (a.percent || 0), 0) / n) : 0
        return {
          id: p.id!,
          title: p.title,
          shortName: p.subjectKey ? getSubject(p.subjectKey)?.shortName || p.subjectKey : '',
          n,
          avg,
        }
      })
      .filter((r) => r.n === 0 || r.avg < 70)
      .sort((a, b) => {
        if (a.n === 0 && b.n !== 0) return -1
        if (b.n === 0 && a.n !== 0) return 1
        return a.avg - b.avg || a.title.localeCompare(b.title, 'id')
      })
      .slice(0, 8)
  }, [pakets, attempts, filterSubject, filterClass])

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
    { key: 'nilai-tp', label: 'Nilai TP' },
    { key: 'tp', label: 'Rekap TP' },
    { key: 'latihan', label: 'Per latihan' },
  ]

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
              <option value="fail">{'< 70%'}</option>
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

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        {!filterSubject && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            Tip: pilih <strong>mata pelajaran</strong> di filter agar ringkasan lebih jelas.
          </p>
        )}
        {filterSubject && (
          <p className="text-xs text-gray-500">
            Filter aktif: <span className="font-medium text-gray-800">{filterSubject}</span>
            {filterClass ? ` · kelas ${filterClass}` : ''}
          </p>
        )}
        <details className="relative ml-auto group">
          <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm select-none">
            Export
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl border border-gray-100 shadow-lg z-20 p-2 space-y-0.5">
            <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">CSV</p>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadCsv(stampFilename('nilai_per_mapel', 'csv'), buildNilaiPerMapelCsv(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Nilai per mapel
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadCsv(stampFilename('rekap_siswa', 'csv'), buildRekapSiswaCsv(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Rekap siswa
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadCsv(stampFilename('detail_attempt', 'csv'), buildDetailAttemptCsv(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Detail attempt
            </button>
            <p className="px-2 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">PDF</p>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadPdfTable(stampFilename('nilai_per_mapel', 'pdf'), buildNilaiPerMapelTable(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Nilai per mapel (PDF)
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadPdfTable(stampFilename('rekap_siswa', 'pdf'), buildRekapSiswaTable(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Rekap siswa (PDF)
            </button>
            <button
              type="button"
              disabled={loading || filteredAttempts.length === 0}
              onClick={() => downloadPdfTable(stampFilename('detail_attempt', 'pdf'), buildDetailAttemptTable(exportInput()))}
              className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-gray-700 disabled:opacity-40"
            >
              Detail attempt (PDF)
            </button>
          </div>
        </details>
      </div>

      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-gray-100 pb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
              if (t.key !== 'siswa') setSelectedStudentKey(null)
            }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-gray-400 mb-4">Memuat data laporan…</p>
      )}

      {tab === 'ringkasan' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Attempt</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{loading ? '…' : stats.n}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Rata skor</p>
              <p
                className={`text-2xl font-bold mt-1 tabular-nums ${
                  !stats.n ? 'text-gray-400' : stats.avg >= 70 ? 'text-emerald-600' : stats.avg >= 40 ? 'text-amber-600' : 'text-rose-600'
                }`}
              >
                {loading ? '…' : stats.n ? `${stats.avg}%` : '—'}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Siswa</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{loading ? '…' : stats.uniqueStudents}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Lulus (≥70%)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{loading ? '…' : stats.n ? `${stats.passRate}%` : '—'}</p>
            </div>
          </div>

          {/* Opsi B: ganti Tren skor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">7 hari terakhir</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{loading ? '…' : last7Days.n}</p>
              <p className="text-xs text-gray-500 mt-1">
                {loading
                  ? '…'
                  : last7Days.n
                    ? `rata ${last7Days.avg}% · ${last7Days.students} siswa`
                    : 'Belum ada aktivitas'}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-2">Rata skor per mapel</p>
              {bySubjectAvg.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada data.</p>
              ) : (
                <ul className="space-y-2">
                  {bySubjectAvg.map((s) => (
                    <li key={s.key} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-700 w-20 shrink-0 truncate" title={s.name}>
                        {s.shortName}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.avg >= 70 ? 'bg-emerald-500' : s.avg >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.min(100, s.avg)}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-semibold tabular-nums w-12 text-right ${
                          s.avg >= 70 ? 'text-emerald-600' : s.avg >= 40 ? 'text-amber-600' : 'text-rose-600'
                        }`}
                      >
                        {s.avg}%
                      </span>
                      <span className="text-[10px] text-gray-400 w-10 text-right tabular-nums">{s.n}x</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Paket yang perlu perhatian</h2>
              {attentionPakets.length === 0 ? (
                <p className="text-sm text-gray-400">Semua paket aktif sudah dikerjakan dengan rata ≥ 70%.</p>
              ) : (
                <ul className="space-y-2.5">
                  {attentionPakets.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{p.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {p.shortName ? `${p.shortName} · ` : ''}
                          {p.n === 0 ? 'Belum ada attempt' : `${p.n} attempt`}
                        </p>
                      </div>
                      {p.n === 0 ? (
                        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800">
                          Kosong
                        </span>
                      ) : (
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            p.avg >= 40 ? 'text-amber-600' : 'text-rose-600'
                          }`}
                        >
                          {p.avg}%
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
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
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Top siswa (filter aktif)</h2>
            </div>
            {byStudent.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">Belum ada data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-4 py-2.5 font-medium">Siswa</th>
                      <th className="px-4 py-2.5 font-medium">Kelas</th>
                      <th className="px-4 py-2.5 font-medium text-right">Attempt</th>
                      <th className="px-4 py-2.5 font-medium text-right">Rata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStudent.slice(0, 10).map((s) => (
                      <tr key={s.key} className="border-t border-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${avatarColor(s.name)}`}>
                              {initials(s.name)}
                            </span>
                            <span className="font-medium text-gray-900">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{s.class || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{s.attempts}</td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                            s.avgPercent >= 70 ? 'text-emerald-600' : s.avgPercent >= 40 ? 'text-amber-600' : 'text-rose-600'
                          }`}
                        >
                          {s.avgPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'siswa' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Daftar siswa</h2>
            </div>
            {byStudent.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">Belum ada data.</p>
            ) : (
              <ul className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
                {byStudent.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentKey(s.key)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${
                        selectedStudentKey === s.key ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${avatarColor(s.name)}`}>
                        {initials(s.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-[11px] text-gray-400">
                          {s.class || '—'} · {s.attempts} attempt
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          s.avgPercent >= 70 ? 'text-emerald-600' : s.avgPercent >= 40 ? 'text-amber-600' : 'text-rose-600'
                        }`}
                      >
                        {s.avgPercent}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            {!selectedStudent ? (
              <p className="text-sm text-gray-400 text-center py-12">Pilih siswa di sebelah kiri.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor(selectedStudent.name)}`}>
                    {initials(selectedStudent.name)}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedStudent.name}</h2>
                    <p className="text-xs text-gray-500">
                      {selectedStudent.class || '—'} · rata {selectedStudent.avgPercent}% · {formatDuration(selectedStudent.totalMs)}
                      {selectedStudent.lastAt ? ` · terakhir ${formatShortDate(selectedStudent.lastAt)}` : ''}
                    </p>
                  </div>
                </div>
                <SiswaTpBreakdown tp={selectedStudent.tp} />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Riwayat attempt</h3>
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {studentAttempts.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm border border-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{a.latihanTitle || paketMap.get(a.latihanId)?.title || a.latihanId}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatShortDate(toMillis(a.finishedAt) || toMillis(a.startedAt) || 0)} · {formatDuration(a.durationMs)}
                          </p>
                        </div>
                        <span
                          className={`font-semibold tabular-nums ${
                            (a.percent || 0) >= 70 ? 'text-emerald-600' : (a.percent || 0) >= 40 ? 'text-amber-600' : 'text-rose-600'
                          }`}
                        >
                          {a.percent ?? 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'nilai-tp' && <LaporanNilaiTp attempts={filteredAttempts} pakets={pakets} />}

      {tab === 'tp' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Rekap capaian TP</h2>
          </div>
          {byTp.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Belum ada data TP.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium">TP</th>
                    <th className="px-4 py-2.5 font-medium text-right">Benar</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium text-right">%</th>
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
                          r.percent >= 70 ? 'text-emerald-600' : r.percent >= 40 ? 'text-amber-600' : 'text-rose-600'
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
                          r.avg >= 70 ? 'text-emerald-600' : r.avg >= 40 ? 'text-amber-600' : 'text-rose-600'
                        }`}
                      >
                        {r.avg}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{formatDuration(r.totalMs)}</td>
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
