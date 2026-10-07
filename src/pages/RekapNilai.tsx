import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import {
  clampScore,
  SCORE_MAX,
  type AssessmentActivity,
  type AssessmentScore,
} from '../types/assessment'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import type { LearningObjective } from '../types/tp'
import { isDummyStudent, type Student } from '../types/student'
import { downloadCsv, stampFilename } from '../lib/exportGrades'

/** Satu kontribusi skor (level 1–4) ke suatu kode TP. */
type TpContribution = {
  activityId: string
  activityTitle: string
  componentId: string
  componentLabel: string
  level: number
  percent: number
}

type StudentTpCell = {
  avgPercent: number | null
  avgLevel: number | null
  n: number
  contributions: TpContribution[]
}

/**
 * Urutan alami kode TP: BIN-7.1 < BIN-8.1 < BIN-10.1
 * (bukan lexicographic: BIN-10 jangan mendahului BIN-7).
 * Tokenisasi tanpa regex agar aman dari escape saat push.
 */
function compareTpCodes(a: string, b: string): number {
  const tokenize = (s: string): (string | number)[] => {
    const parts: (string | number)[] = []
    const str = s || ''
    let i = 0
    while (i < str.length) {
      const ch = str.charCodeAt(i)
      if (ch >= 48 && ch <= 57) {
        let j = i + 1
        while (j < str.length) {
          const cj = str.charCodeAt(j)
          if (cj < 48 || cj > 57) break
          j++
        }
        parts.push(parseInt(str.slice(i, j), 10))
        i = j
      } else {
        let j = i + 1
        while (j < str.length) {
          const cj = str.charCodeAt(j)
          if (cj >= 48 && cj <= 57) break
          j++
        }
        parts.push(str.slice(i, j).toLowerCase())
        i = j
      }
    }
    return parts
  }
  const pa = tokenize(a)
  const pb = tokenize(b)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else {
      const sx = String(x)
      const sy = String(y)
      if (sx !== sy) return sx.localeCompare(sy, 'id')
    }
  }
  return 0
}

function scoreColor(pct: number | null): string {
  if (pct == null) return 'text-gray-300'
  if (pct >= 85) return 'text-emerald-600'
  if (pct >= 70) return 'text-sky-600'
  if (pct >= 55) return 'text-amber-600'
  return 'text-red-500'
}

function scoreBg(pct: number | null): string {
  if (pct == null) return 'bg-transparent'
  if (pct >= 85) return 'bg-emerald-50'
  if (pct >= 70) return 'bg-sky-50'
  if (pct >= 55) return 'bg-amber-50'
  return 'bg-red-50'
}

/**
 * Agregasi nilai akhir per TP dari assessmentActivities + assessmentScores.
 * Setiap komponen yang menautkan kode TP menyumbang skor level → persen (level/4×100).
 * Nilai akhir TP siswa = rata-rata persen dari semua kontribusi.
 */
function buildStudentTpMatrix(
  activities: AssessmentActivity[],
  scores: AssessmentScore[],
  subjectKey: SubjectKey
): Map<string, Map<string, StudentTpCell>> {
  const acc = new Map<string, Map<string, TpContribution[]>>()

  for (const act of activities) {
    if (!act.id) continue
    if (!(act.subjectKeys || []).includes(subjectKey)) continue
    for (const comp of act.components || []) {
      const tpCodes = (comp.tpCodes || []).filter(Boolean)
      if (tpCodes.length === 0) continue
      scores
        .filter((sc) => sc.activityId === act.id)
        .forEach((sc) => {
          const raw = sc.scores?.[comp.id]
          if (raw == null || !Number.isFinite(raw)) return
          const level = clampScore(raw)
          const percent = Math.round((level / SCORE_MAX) * 100)
          const contrib: TpContribution = {
            activityId: act.id!,
            activityTitle: act.title,
            componentId: comp.id,
            componentLabel: comp.label,
            level,
            percent,
          }
          let byTp = acc.get(sc.studentId)
          if (!byTp) {
            byTp = new Map()
            acc.set(sc.studentId, byTp)
          }
          for (const code of tpCodes) {
            const list = byTp.get(code) || []
            list.push(contrib)
            byTp.set(code, list)
          }
        })
    }
  }

  const result = new Map<string, Map<string, StudentTpCell>>()
  acc.forEach((byTp, studentId) => {
    const row = new Map<string, StudentTpCell>()
    byTp.forEach((list, code) => {
      if (list.length === 0) {
        row.set(code, { avgPercent: null, avgLevel: null, n: 0, contributions: [] })
        return
      }
      const sumPct = list.reduce((s, c) => s + c.percent, 0)
      const sumLv = list.reduce((s, c) => s + c.level, 0)
      row.set(code, {
        avgPercent: Math.round(sumPct / list.length),
        avgLevel: Math.round((sumLv / list.length) * 100) / 100,
        n: list.length,
        contributions: list,
      })
    })
    result.set(studentId, row)
  })
  return result
}

export default function RekapNilai() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activities, setActivities] = useState<AssessmentActivity[]>([])
  const [scores, setScores] = useState<AssessmentScore[]>([])
  const [tps, setTps] = useState<LearningObjective[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [subjectKey, setSubjectKey] = useState<SubjectKey>('pendidikan-pancasila')
  const [classFilter, setClassFilter] = useState('5A')
  const [focusTp, setFocusTp] = useState<string | null>(null)
  const [showLevel, setShowLevel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [actSnap, scoreSnap, tpSnap, stuSnap] = await Promise.all([
        getDocs(collection(db, 'assessmentActivities')),
        getDocs(collection(db, 'assessmentScores')),
        getDocs(collection(db, 'learningObjectives')),
        getDocs(collection(db, 'students')),
      ])
      setActivities(
        actSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AssessmentActivity, 'id'>),
        }))
      )
      setScores(
        scoreSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AssessmentScore, 'id'>),
        }))
      )
      setTps(
        tpSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LearningObjective, 'id'>) }))
          .filter((t) => t.active !== false)
      )
      setStudents(
        stuSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Student, 'id'>) }))
          .filter((s) => s.active !== false && !isDummyStudent(s))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
      )
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat rekap nilai.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const subjectTps = useMemo(() => {
    return tps
      .filter((t) => t.subjectKey === subjectKey)
      .sort((a, b) => compareTpCodes(a.code || '', b.code || ''))
  }, [tps, subjectKey])

  const tpCodesInData = useMemo(() => {
    const set = new Set<string>()
    activities.forEach((a) => {
      if (!(a.subjectKeys || []).includes(subjectKey)) return
      ;(a.components || []).forEach((c) => (c.tpCodes || []).forEach((code) => set.add(code)))
      ;(a.linkedTpCodes || []).forEach((code) => set.add(code))
    })
    return set
  }, [activities, subjectKey])

  const displayTps = useMemo(() => {
    const fromMaster = subjectTps
    const known = new Set(fromMaster.map((t) => t.code))
    const extras = [...tpCodesInData]
      .filter((c) => !known.has(c))
      .map(
        (code) =>
          ({
            id: code,
            code,
            subjectKey,
            statement: '(TP belum ada di master Tujuan Pembelajaran)',
            element: '',
            active: true,
          }) as LearningObjective
      )
    return [...fromMaster, ...extras].sort((a, b) =>
      compareTpCodes(a.code || '', b.code || '')
    )
  }, [subjectTps, tpCodesInData, subjectKey])

  useEffect(() => {
    if (displayTps.length === 0) {
      setFocusTp(null)
      return
    }
    if (!focusTp || !displayTps.some((t) => t.code === focusTp)) {
      setFocusTp(displayTps[0].code)
    }
  }, [displayTps, focusTp])

  const matrix = useMemo(
    () => buildStudentTpMatrix(activities, scores, subjectKey),
    [activities, scores, subjectKey]
  )

  const studentsInClass = useMemo(() => {
    const cls = classFilter.trim()
    return students.filter((s) => s.id && (!cls || (s.className || '').trim() === cls))
  }, [students, classFilter])

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    students.forEach((s) => {
      const c = (s.className || '').trim()
      if (c) set.add(c)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'id'))
  }, [students])

  const focused = useMemo(
    () => displayTps.find((t) => t.code === focusTp) || null,
    [displayTps, focusTp]
  )

  const classAvgByTp = useMemo(() => {
    const m = new Map<string, number | null>()
    displayTps.forEach((tp) => {
      const vals: number[] = []
      studentsInClass.forEach((s) => {
        const cell = matrix.get(s.id!)?.get(tp.code)
        if (cell?.avgPercent != null) vals.push(cell.avgPercent)
      })
      m.set(tp.code, vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null)
    })
    return m
  }, [displayTps, studentsInClass, matrix])

  const relatedActivities = useMemo(() => {
    return activities.filter((a) => (a.subjectKeys || []).includes(subjectKey))
  }, [activities, subjectKey])

  const focusContributionsSample = useMemo(() => {
    if (!focusTp) return [] as TpContribution[]
    const seen = new Set<string>()
    const list: TpContribution[] = []
    matrix.forEach((byTp) => {
      const cell = byTp.get(focusTp)
      cell?.contributions.forEach((c) => {
        const k = `${c.activityId}__${c.componentId}`
        if (seen.has(k)) return
        seen.add(k)
        list.push(c)
      })
    })
    return list
  }, [matrix, focusTp])

  const exportCsv = () => {
    const sub = getSubject(subjectKey)
    const headers = [
      'No',
      'Nama Siswa',
      'Kelas',
      ...displayTps.map((t) => t.code),
      'Rata-rata TP (%)',
    ]
    const rows = studentsInClass.map((s, i) => {
      const cells = displayTps.map((t) => {
        const cell = matrix.get(s.id!)?.get(t.code)
        return cell?.avgPercent ?? ''
      })
      const nums = cells.filter((v) => v !== '' && Number.isFinite(Number(v))) as number[]
      const avg = nums.length
        ? Math.round(nums.reduce((a, b) => a + Number(b), 0) / nums.length)
        : ''
      return [i + 1, s.fullName, s.className || '', ...cells, avg]
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
    downloadCsv(
      stampFilename(`rekap_tp_${sub?.shortName || subjectKey}_${classFilter || 'all'}`, 'csv'),
      '\uFEFF' + csv
    )
  }

  const subjectMeta = getSubject(subjectKey)

  return (
    <Layout
      title="Rekap Nilai"
      subtitle="Nilai akhir per Tujuan Pembelajaran (TP) dari penilaian aktivitas"
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => setShowLevel((v) => !v)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-700"
            title="Tampilkan rata level 1–4 selain persen"
          >
            {showLevel ? 'Tampil: level + %' : 'Tampil: % saja'}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-700"
          >
            Muat ulang
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SUBJECTS.map((s) => {
            const on = subjectKey === s.key
            const hasData = activities.some((a) => (a.subjectKeys || []).includes(s.key))
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSubjectKey(s.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  on
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : hasData
                      ? 'bg-white text-gray-700 border-gray-200 hover:border-violet-200'
                      : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
              >
                {s.icon} {s.shortName}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Kelas</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm bg-white min-w-[5rem]"
          >
            <option value="">Semua</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Mapel</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
            {subjectMeta?.name || subjectKey}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">TP</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">{displayTps.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Aktivitas</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">
            {relatedActivities.length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Siswa</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">
            {studentsInClass.length}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-16">Memuat rekap…</p>
      ) : relatedActivities.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="font-medium text-gray-800">Belum ada penilaian untuk mapel ini</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Buat penilaian di <strong>Input Nilai</strong> dan tautkan TP mapel{' '}
            {subjectMeta?.shortName || subjectKey}, lalu isi skor siswa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">
                Matriks nilai akhir TP · {subjectMeta?.shortName}
                {classFilter ? ` · ${classFilter}` : ''}
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Klik header kode TP untuk membuka deskripsi di panel kanan. Nilai = rata-rata persen
                dari komponen aktivitas yang menautkan TP tersebut.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="text-xs border-collapse min-w-full">
                <thead className="sticky top-0 z-20 bg-gray-50">
                  <tr className="text-gray-500">
                    <th className="sticky left-0 z-30 bg-gray-50 px-2 py-2.5 text-left border-b border-r w-8">
                      #
                    </th>
                    <th className="sticky left-8 z-30 bg-gray-50 px-3 py-2.5 text-left border-b border-r min-w-[130px]">
                      Siswa
                    </th>
                    {displayTps.map((tp) => {
                      const avg = classAvgByTp.get(tp.code)
                      const active = focusTp === tp.code
                      return (
                        <th
                          key={tp.code}
                          onClick={() => setFocusTp(tp.code)}
                          className={`px-1.5 py-2 text-center border-b min-w-[64px] cursor-pointer transition ${
                            active
                              ? 'bg-violet-100 text-violet-800'
                              : 'hover:bg-violet-50 text-gray-600'
                          }`}
                          title={tp.statement}
                        >
                          <span className="font-semibold block text-[11px] leading-tight">
                            {tp.code}
                          </span>
                          <span
                            className={`text-[10px] tabular-nums font-medium ${scoreColor(avg ?? null)}`}
                          >
                            {avg != null ? `${avg}%` : '—'}
                          </span>
                        </th>
                      )
                    })}
                    <th className="px-2 py-2.5 text-center border-b border-l bg-indigo-50/60 text-indigo-700 min-w-[52px]">
                      Rata
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentsInClass.length === 0 ? (
                    <tr>
                      <td
                        colSpan={displayTps.length + 3}
                        className="px-4 py-10 text-center text-gray-400"
                      >
                        Tidak ada siswa di filter kelas ini.
                      </td>
                    </tr>
                  ) : (
                    studentsInClass.map((s, idx) => {
                      const row = matrix.get(s.id!)
                      const pcts: number[] = []
                      displayTps.forEach((tp) => {
                        const p = row?.get(tp.code)?.avgPercent
                        if (p != null) pcts.push(p)
                      })
                      const rowAvg =
                        pcts.length > 0
                          ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
                          : null
                      return (
                        <tr key={s.id} className="hover:bg-indigo-50/15">
                          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-gray-400 border-b border-r tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="sticky left-8 z-10 bg-white px-3 py-1.5 font-medium text-gray-900 border-b border-r truncate max-w-[150px]">
                            {s.fullName}
                          </td>
                          {displayTps.map((tp) => {
                            const cell = row?.get(tp.code)
                            const pct = cell?.avgPercent ?? null
                            const focusedCell = focusTp === tp.code
                            return (
                              <td
                                key={tp.code}
                                onClick={() => setFocusTp(tp.code)}
                                className={`px-1 py-1 border-b text-center cursor-pointer ${scoreBg(
                                  pct
                                )} ${focusedCell ? 'ring-1 ring-inset ring-violet-300' : ''}`}
                                title={
                                  cell
                                    ? `Level rata ${cell.avgLevel} · ${cell.n} kontribusi`
                                    : 'Belum ada nilai'
                                }
                              >
                                <span
                                  className={`text-xs font-semibold tabular-nums ${scoreColor(pct)}`}
                                >
                                  {pct != null ? `${pct}` : '—'}
                                </span>
                                {showLevel && cell?.avgLevel != null && (
                                  <span className="block text-[10px] text-gray-400 tabular-nums">
                                    L{cell.avgLevel}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                          <td
                            className={`px-2 py-1.5 text-center border-b border-l font-bold tabular-nums ${scoreColor(
                              rowAvg
                            )} bg-indigo-50/20`}
                          >
                            {rowAvg != null ? rowAvg : '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {studentsInClass.length > 0 && displayTps.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="sticky left-0 z-10 bg-gray-50 px-2 py-2 border-t border-r" />
                      <td className="sticky left-8 z-10 bg-gray-50 px-3 py-2 border-t border-r text-gray-600 text-[11px]">
                        Rata kelas
                      </td>
                      {displayTps.map((tp) => {
                        const avg = classAvgByTp.get(tp.code) ?? null
                        return (
                          <td
                            key={tp.code}
                            className={`px-1 py-2 text-center border-t tabular-nums ${scoreColor(
                              avg
                            )}`}
                          >
                            {avg != null ? `${avg}%` : '—'}
                          </td>
                        )
                      })}
                      <td className="px-2 py-2 text-center border-t border-l text-indigo-700 tabular-nums">
                        {(() => {
                          const vals = [...classAvgByTp.values()].filter(
                            (v): v is number => v != null
                          )
                          return vals.length
                            ? `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`
                            : '—'
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">
              Skala sumber: level 1–4 (kelipatan 0,25) dari Input Nilai → dikonversi ke persen
              (level÷4×100). Satu TP bisa menerima beberapa kontribusi dari komponen berbeda;
              ditampilkan rata-rata.
            </p>
          </div>

          <div className="xl:col-span-4 space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sticky top-20">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Deskripsi TP</h3>
              {displayTps.length > 1 && (
                <div className="flex flex-wrap gap-1 mb-3 max-h-24 overflow-y-auto">
                  {displayTps.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setFocusTp(t.code)}
                      className={`text-[11px] px-2 py-1 rounded-lg border ${
                        focusTp === t.code
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {t.code}
                    </button>
                  ))}
                </div>
              )}

              {!focused ? (
                <p className="text-xs text-gray-400">Pilih kode TP pada tabel atau tombol di atas.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                      {focused.code}
                    </p>
                    {focused.element && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Elemen: {focused.element}</p>
                    )}
                    <p className="text-sm text-gray-800 leading-relaxed mt-2 whitespace-pre-wrap">
                      {focused.statement || '—'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Rata kelas (filter)</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${scoreColor(
                        classAvgByTp.get(focused.code) ?? null
                      )}`}
                    >
                      {classAvgByTp.get(focused.code) != null
                        ? `${classAvgByTp.get(focused.code)}%`
                        : '—'}
                    </span>
                  </div>

                  {focusContributionsSample.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Sumber nilai
                      </p>
                      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                        {focusContributionsSample.map((c) => (
                          <li
                            key={`${c.activityId}_${c.componentId}`}
                            className="text-xs rounded-xl border border-gray-100 px-3 py-2"
                          >
                            <p className="font-medium text-gray-800 truncate">{c.activityTitle}</p>
                            <p className="text-gray-500 mt-0.5 truncate">
                              Komponen: {c.componentLabel}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Sebaran siswa
                    </p>
                    {(() => {
                      const bands = [
                        { label: '≥85%', min: 85, color: 'bg-emerald-400' },
                        { label: '70–84%', min: 70, color: 'bg-sky-400' },
                        { label: '55–69%', min: 55, color: 'bg-amber-400' },
                        { label: '<55%', min: 0, color: 'bg-red-400' },
                      ]
                      const counts = [0, 0, 0, 0]
                      let filled = 0
                      studentsInClass.forEach((s) => {
                        const p = matrix.get(s.id!)?.get(focused.code)?.avgPercent
                        if (p == null) return
                        filled += 1
                        if (p >= 85) counts[0] += 1
                        else if (p >= 70) counts[1] += 1
                        else if (p >= 55) counts[2] += 1
                        else counts[3] += 1
                      })
                      if (filled === 0) {
                        return (
                          <p className="text-xs text-gray-400">Belum ada siswa dengan nilai TP ini.</p>
                        )
                      }
                      return (
                        <ul className="space-y-1.5">
                          {bands.map((b, i) => (
                            <li key={b.label} className="flex items-center gap-2 text-xs">
                              <span className={`w-2 h-2 rounded-full ${b.color}`} />
                              <span className="text-gray-600 w-16">{b.label}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className={`h-full ${b.color} rounded-full`}
                                  style={{ width: `${Math.round((counts[i] / filled) * 100)}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-gray-500 w-6 text-right">
                                {counts[i]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            {relatedActivities.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Aktivitas mapel ini</h3>
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {relatedActivities.map((a) => (
                    <li key={a.id} className="text-xs text-gray-600 flex justify-between gap-2">
                      <span className="truncate font-medium text-gray-800">{a.title}</span>
                      <span className="shrink-0 text-gray-400">
                        {a.components?.length || 0} komp.
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
