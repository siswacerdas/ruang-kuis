import { useMemo } from 'react'
import {
  SUBJECTS,
  getSubject,
  type LatihanAttempt,
  type LatihanPaket,
  type SubjectKey,
} from '../types/question'
import { downloadCsv, stampFilename } from '../lib/exportGrades'

function studentKey(a: { studentId?: string | null; studentName: string }) {
  const id = (a.studentId || '').trim()
  if (id) return `id:${id}`
  return `name:${a.studentName.trim().toLowerCase()}`
}

interface Props {
  attempts: LatihanAttempt[]
  paketMap: Map<string, LatihanPaket>
  filterSubject: SubjectKey | ''
  setFilterSubject: (v: SubjectKey | '') => void
  loading: boolean
}

export default function LaporanNilaiTp({
  attempts,
  paketMap,
  filterSubject,
  setFilterSubject,
  loading,
}: Props) {
  const tpMatrix = useMemo(() => {
    type Cell = { correct: number; total: number }
    const students = new Map<string, { key: string; name: string; className: string }>()
    const tpsBySubject = new Map<string, Set<string>>()
    const cells = new Map<string, Cell>()

    attempts.forEach((a) => {
      if (!a.tpSummary) return
      const p = paketMap.get(a.latihanId)
      const subject = p?.subjectKey || 'unknown'
      const sk = studentKey(a)
      const curS =
        students.get(sk) ||
        ({
          key: sk,
          name: (a.studentName || '—').trim(),
          className: (a.studentClass || '').trim(),
        } as { key: string; name: string; className: string })
      if (a.studentName) curS.name = a.studentName.trim()
      if (a.studentClass) curS.className = a.studentClass.trim()
      students.set(sk, curS)

      if (!tpsBySubject.has(subject)) tpsBySubject.set(subject, new Set())
      const tpSet = tpsBySubject.get(subject)!

      Object.entries(a.tpSummary).forEach(([tp, v]) => {
        const code = (tp || '').trim()
        if (!code) return
        tpSet.add(code)
        const ck = `${sk}||${subject}||${code}`
        const cell = cells.get(ck) || { correct: 0, total: 0 }
        cell.correct += v.correct || 0
        cell.total += v.total || 0
        cells.set(ck, cell)
      })
    })

    const studentList = [...students.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'))

    const subjectOrder = SUBJECTS.map((s) => s.key as string).concat(
      [...tpsBySubject.keys()].filter((k) => !SUBJECTS.some((s) => s.key === k))
    )
    const subjects = subjectOrder.filter(
      (k) => tpsBySubject.has(k) && (tpsBySubject.get(k)?.size || 0) > 0
    )

    const getCell = (studentK: string, subject: string, tp: string) => {
      const c = cells.get(`${studentK}||${subject}||${tp}`)
      if (!c || c.total === 0) return null
      return {
        correct: c.correct,
        total: c.total,
        percent: Math.round((c.correct / c.total) * 100),
      }
    }

    const tpsFor = (subject: string) =>
      [...(tpsBySubject.get(subject) || [])].sort((a, b) =>
        a.localeCompare(b, 'id', { numeric: true })
      )

    return { studentList, subjects, tpsFor, getCell, studentCount: studentList.length }
  }, [attempts, paketMap])

  const matrixSubject = useMemo(() => {
    if (filterSubject && tpMatrix.subjects.includes(filterSubject)) return filterSubject
    return tpMatrix.subjects[0] || ''
  }, [filterSubject, tpMatrix.subjects])

  const matrixTps = useMemo(
    () => (matrixSubject ? tpMatrix.tpsFor(matrixSubject) : []),
    [matrixSubject, tpMatrix]
  )

  const exportMatrix = () => {
    if (!matrixSubject) return
    const headers = ['No', 'Nama Siswa', 'Kelas', ...matrixTps, 'Rata-rata TP']
    const rows = tpMatrix.studentList.map((s, i) => {
      const scores: number[] = []
      const rowCells = matrixTps.map((tp) => {
        const c = tpMatrix.getCell(s.key, matrixSubject, tp)
        if (c) scores.push(c.percent)
        return c ? c.percent : ''
      })
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : ''
      return [i + 1, s.name, s.className || '', ...rowCells, avg]
    })
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = v == null ? '' : String(v)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(',')
      )
      .join('\r\n')
    downloadCsv(stampFilename(`nilai_tp_${matrixSubject || 'all'}`, 'csv'), '\uFEFF' + csv)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Nilai TP per siswa</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Matriks capaian tiap kode TP per mapel. Sel = persen benar; titik (·) = belum ada data.
            Gulir horizontal; kolom siswa menempel di kiri.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-gray-500">
            {loading
              ? '…'
              : matrixSubject
                ? `${tpMatrix.studentCount} siswa · ${matrixTps.length} TP · ${
                    getSubject(matrixSubject as SubjectKey)?.shortName || matrixSubject
                  }`
                : 'Belum ada data TP'}
          </span>
          <button
            type="button"
            disabled={!matrixSubject || matrixTps.length === 0 || tpMatrix.studentCount === 0}
            onClick={exportMatrix}
            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tpMatrix.subjects.map((sk) => {
          const active = matrixSubject === sk
          const sub = getSubject(sk as SubjectKey)
          return (
            <button
              key={sk}
              type="button"
              onClick={() => setFilterSubject(active && filterSubject === sk ? '' : (sk as SubjectKey))}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-200'
              }`}
            >
              {sub?.icon || '📝'} {sub?.shortName || sk}
              <span className="ml-1 opacity-70">({tpMatrix.tpsFor(sk).length})</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500" /> ≥ 70%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-400" /> 40–69%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-400" /> {'< 40%'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" /> Belum ada
        </span>
      </div>

      {!matrixSubject || matrixTps.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-600 font-medium">Belum ada data nilai TP</p>
          <p className="text-sm text-gray-400 mt-1">
            Pastikan soal punya kode TP dan siswa sudah mengerjakan kuis. Filter mapel/kelas memengaruhi data.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 text-gray-500">
                  <th className="sticky left-0 z-30 bg-gray-50 px-2 py-2.5 font-medium text-left w-10 border-b border-r border-gray-100">
                    #
                  </th>
                  <th className="sticky left-10 z-30 bg-gray-50 px-3 py-2.5 font-medium text-left min-w-[140px] border-b border-r border-gray-100">
                    Siswa
                  </th>
                  <th className="sticky left-40 z-30 bg-gray-50 px-2 py-2.5 font-medium text-left min-w-[56px] border-b border-r border-gray-100">
                    Kelas
                  </th>
                  {matrixTps.map((tp) => (
                    <th
                      key={tp}
                      title={tp}
                      className="px-1.5 py-2.5 font-medium text-center min-w-[52px] max-w-[72px] border-b border-gray-100"
                    >
                      <span className="block truncate font-semibold text-gray-700">{tp}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 font-medium text-center min-w-[56px] border-b border-l border-gray-100 bg-indigo-50/50 text-indigo-700">
                    Rata
                  </th>
                </tr>
              </thead>
              <tbody>
                {tpMatrix.studentList.map((s, idx) => {
                  const scores: number[] = []
                  return (
                    <tr key={s.key} className="hover:bg-indigo-50/30 group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-indigo-50/30 px-2 py-1.5 text-gray-400 border-b border-r border-gray-50 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="sticky left-10 z-10 bg-white group-hover:bg-indigo-50/30 px-3 py-1.5 font-medium text-gray-900 border-b border-r border-gray-50 max-w-[160px] truncate">
                        {s.name}
                      </td>
                      <td className="sticky left-40 z-10 bg-white group-hover:bg-indigo-50/30 px-2 py-1.5 text-gray-500 border-b border-r border-gray-50">
                        {s.className || '—'}
                      </td>
                      {matrixTps.map((tp) => {
                        const c = tpMatrix.getCell(s.key, matrixSubject, tp)
                        if (c) scores.push(c.percent)
                        const tone = !c
                          ? 'text-gray-300'
                          : c.percent >= 70
                            ? 'bg-emerald-50 text-emerald-700'
                            : c.percent >= 40
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        return (
                          <td
                            key={tp}
                            title={
                              c
                                ? `${s.name} · ${tp}: ${c.correct}/${c.total} benar (${c.percent}%)`
                                : `${s.name} · ${tp}: belum ada data`
                            }
                            className={`px-1 py-1.5 text-center tabular-nums font-semibold border-b border-gray-50 ${tone}`}
                          >
                            {c ? c.percent : '·'}
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums font-bold border-b border-l border-gray-50 bg-indigo-50/30 text-indigo-700">
                        {scores.length
                          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">
            Hover sel untuk detail benar/total. Export CSV untuk diolah di Excel.
          </p>
        </div>
      )}

      {tpMatrix.subjects.length > 1 && !filterSubject && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tpMatrix.subjects.map((sk) => {
            const sub = getSubject(sk as SubjectKey)
            const tps = tpMatrix.tpsFor(sk)
            let sum = 0
            let n = 0
            tpMatrix.studentList.forEach((s) => {
              tps.forEach((tp) => {
                const c = tpMatrix.getCell(s.key, sk, tp)
                if (c) {
                  sum += c.percent
                  n += 1
                }
              })
            })
            const avg = n ? Math.round(sum / n) : null
            return (
              <button
                key={sk}
                type="button"
                onClick={() => setFilterSubject(sk as SubjectKey)}
                className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 hover:border-violet-200 transition"
              >
                <p className="text-xs text-gray-400">
                  {sub?.icon} {sub?.shortName || sk}
                </p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 mt-0.5">
                  {avg != null ? `${avg}%` : '—'}
                </p>
                <p className="text-[11px] text-gray-400">{tps.length} TP · klik untuk matriks</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Chip list nilai TP untuk detail satu siswa (tab Per siswa). */
export function SiswaTpBreakdown({
  studentKey: selectedKey,
  attempts,
  paketMap,
}: {
  studentKey: string
  attempts: LatihanAttempt[]
  paketMap: Map<string, LatihanPaket>
}) {
  const bySubject = useMemo(() => {
    type Cell = { correct: number; total: number }
    const map = new Map<string, Map<string, Cell>>()
    attempts.forEach((a) => {
      if (!a.tpSummary) return
      const sk = studentKey(a)
      if (sk !== selectedKey) return
      const subject = paketMap.get(a.latihanId)?.subjectKey || 'unknown'
      if (!map.has(subject)) map.set(subject, new Map())
      const tpMap = map.get(subject)!
      Object.entries(a.tpSummary).forEach(([tp, v]) => {
        const code = (tp || '').trim()
        if (!code) return
        const cur = tpMap.get(code) || { correct: 0, total: 0 }
        cur.correct += v.correct || 0
        cur.total += v.total || 0
        tpMap.set(code, cur)
      })
    })
    return [...map.entries()]
      .map(([subject, tps]) => {
        const cells = [...tps.entries()]
          .map(([tp, c]) => ({
            tp,
            percent: c.total ? Math.round((c.correct / c.total) * 100) : 0,
            correct: c.correct,
            total: c.total,
          }))
          .sort((a, b) => a.tp.localeCompare(b.tp, 'id', { numeric: true }))
        const avg = cells.length
          ? Math.round(cells.reduce((s, x) => s + x.percent, 0) / cells.length)
          : null
        return { subject, cells, avg }
      })
      .filter((x) => x.cells.length > 0)
      .sort((a, b) => a.subject.localeCompare(b.subject))
  }, [attempts, paketMap, selectedKey])

  if (!bySubject.length) return null

  return (
    <div className="space-y-3 pt-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nilai TP per mapel</h4>
      {bySubject.map(({ subject, cells, avg }) => {
        const sub = getSubject(subject as SubjectKey)
        return (
          <div key={subject} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-900">
                {sub?.icon} {sub?.name || subject}
              </p>
              {avg != null && (
                <span
                  className={`text-sm font-bold tabular-nums ${
                    avg >= 70 ? 'text-emerald-600' : avg >= 40 ? 'text-amber-600' : 'text-rose-600'
                  }`}
                >
                  {avg}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cells.map(({ tp, percent, correct, total }) => (
                <span
                  key={tp}
                  title={`${tp}: ${correct}/${total}`}
                  className={`text-[11px] px-2 py-1 rounded-lg font-medium tabular-nums ${
                    percent >= 70
                      ? 'bg-emerald-50 text-emerald-700'
                      : percent >= 40
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {tp} {percent}%
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
