import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { loadRankingSource, type RankingSource } from '../lib/rankingData'
import { classesFromStats, rankFromAttempts, rankFromStats } from '../lib/ranking'
import {
  SUBJECTS,
  getSubject,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'

interface RankRow {
  key: string
  name: string
  studentId?: string
  className?: string
  attempts: number
  avg: number
  best: number
  rank: number
}

export default function Peringkat() {
  const [source, setSource] = useState<RankingSource | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState<string>('all')
  const [filterClass, setFilterClass] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        setSource(await loadRankingSource())
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const paketMap = useMemo(() => {
    const m = new Map<string, LatihanPaket>()
    if (source?.mode === 'attempts') {
      source.pakets.forEach((p) => {
        if (p.id) m.set(p.id, p)
      })
    }
    return m
  }, [source])

  const classes = useMemo(() => {
    if (!source) return []
    if (source.mode === 'stats') return classesFromStats(source.stats)
    const set = new Set<string>()
    source.attempts.forEach((a) => {
      const c = (a.studentClass || '').trim()
      if (c) set.add(c)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'id'))
  }, [source])

  const ranks: RankRow[] = useMemo(() => {
    if (!source) return []
    const filters = {
      className: filterClass === 'all' ? '' : filterClass,
      subjectKey: filterSubject,
    }
    const base =
      source.mode === 'stats'
        ? rankFromStats(source.stats, filters)
        : rankFromAttempts(source.attempts, (id) => paketMap.get(id)?.subjectKey, filters)

    const q = search.trim().toLowerCase()
    let rows = base.map((r) => ({
      key: r.key,
      name: r.name,
      studentId: r.studentId,
      className: r.className,
      attempts: r.attempts,
      avg: r.avg,
      best: r.best,
      rank: 0,
    }))

    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.className || '').toLowerCase().includes(q)
      )
    }

    rows.sort((a, b) => b.avg - a.avg || b.attempts - a.attempts || a.name.localeCompare(b.name, 'id'))
    rows.forEach((r, i) => {
      r.rank = i + 1
    })
    return rows
  }, [source, paketMap, filterSubject, filterClass, search])

  const medal = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return String(rank)
  }

  return (
    <Layout
      title="Peringkat"
      subtitle="Peringkat siswa berdasarkan rata-rata skor kuis"
    >
      <div className="space-y-5">
        <section className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="all">Semua mapel</option>
              {SUBJECTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.icon} {s.shortName}
                </option>
              ))}
            </select>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="all">Semua kelas</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / kelas…"
            className="w-full sm:w-64 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Peserta', value: loading ? '…' : String(ranks.length), tone: 'text-indigo-600' },
            {
              label: 'Rata-rata kelas',
              value: loading
                ? '…'
                : ranks.length
                  ? `${Math.round(ranks.reduce((s, r) => s + r.avg, 0) / ranks.length)}%`
                  : '—',
              tone: 'text-violet-600',
            },
            {
              label: 'Tertinggi',
              value: loading ? '…' : ranks[0] ? `${ranks[0].avg}%` : '—',
              tone: 'text-emerald-600',
            },
            {
              label: 'Filter mapel',
              value:
                filterSubject === 'all'
                  ? 'Semua'
                  : getSubject(filterSubject as SubjectKey)?.shortName || filterSubject,
              tone: 'text-sky-600',
            },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5"
            >
              <p className="text-[11px] text-gray-400 font-medium">{c.label}</p>
              <p className={`text-2xl font-bold mt-0.5 tabular-nums ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Tabel peringkat</h2>
            <span className="text-[11px] text-gray-400">
              {loading ? 'Memuat…' : `${ranks.length} siswa`}
            </span>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-gray-400">Memuat data…</p>
          ) : ranks.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              Belum ada data pengerjaan untuk filter ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium w-16">#</th>
                    <th className="px-4 py-2.5 font-medium">Siswa</th>
                    <th className="px-4 py-2.5 font-medium">Kelas</th>
                    <th className="px-4 py-2.5 font-medium text-right">Kuis</th>
                    <th className="px-4 py-2.5 font-medium text-right">Rata-rata</th>
                    <th className="px-4 py-2.5 font-medium text-right">Terbaik</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks.map((r) => (
                    <tr
                      key={r.key}
                      className={`border-t border-gray-50 ${
                        r.rank <= 3 ? 'bg-amber-50/40' : 'hover:bg-gray-50/80'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-semibold tabular-nums text-gray-700">
                        <span className={r.rank <= 3 ? 'text-base' : 'text-sm'}>{medal(r.rank)}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.className || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{r.attempts}</td>
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
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.best}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[11px] text-gray-400">
          Peringkat dihitung dari rata-rata skor (percent) semua attempt yang cocok filter. Jika siswa mengerjakan
          ulang, semua attempt ikut dirata-rata.
        </p>
      </div>
    </Layout>
  )
}
