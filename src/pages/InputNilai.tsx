import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import {
  generateAssessmentWithOpenAI,
  simulateScoresWithOpenAI,
} from '../lib/openaiAssessment'
import { downloadCsv, stampFilename } from '../lib/exportGrades'
import {
  clampScore,
  computeWeightedPercent,
  formatScore,
  normalizePredicate,
  percentToPredicate,
  PREDICATE_OPTIONS,
  RUBRIC_LEVEL_LABELS,
  SCORE_OPTIONS,
  simulateScoresFromPredicateLocal,
  type AssessmentActivity,
  type AssessmentComponent,
  type AssessmentScore,
} from '../types/assessment'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import type { LearningObjective } from '../types/tp'
import { isDummyStudent, type Student } from '../types/student'

type View = 'list' | 'create' | 'detail'

function scoreDocId(activityId: string, studentId: string) {
  return `${activityId}__${studentId}`
}

export default function InputNilai() {
  const [view, setView] = useState<View>('list')
  const [activities, setActivities] = useState<AssessmentActivity[]>([])
  const [tps, setTps] = useState<LearningObjective[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [description, setDescription] = useState('')
  const [titleHint, setTitleHint] = useState('')
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectKey[]>([
    'pendidikan-pancasila',
    'bahasa-indonesia',
  ])
  const [classFilter, setClassFilter] = useState('5A')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<AssessmentActivity | null>(null)
  const [saving, setSaving] = useState(false)

  const [active, setActive] = useState<AssessmentActivity | null>(null)
  const [allScores, setAllScores] = useState<AssessmentScore[]>([])
  const [scoresLoading, setScoresLoading] = useState(false)
  const [scoreDirty, setScoreDirty] = useState(false)
  const [localScores, setLocalScores] = useState<Record<string, Record<string, number>>>({})
  const [predicates, setPredicates] = useState<Record<string, string>>({})
  const [simulatingIds, setSimulatingIds] = useState<Record<string, boolean>>({})
  const [rubricFocus, setRubricFocus] = useState<string | null>(null)

  const loadMeta = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [actSnap, tpSnap, stuSnap] = await Promise.all([
        getDocs(collection(db, 'assessmentActivities')),
        getDocs(collection(db, 'learningObjectives')),
        getDocs(collection(db, 'students')),
      ])
      setActivities(
        actSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AssessmentActivity, 'id'>) }))
          .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'))
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
      setError(e?.message || 'Gagal memuat data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const availableTpsForCreate = useMemo(() => {
    return tps.filter((t) => selectedSubjects.includes(t.subjectKey as SubjectKey))
  }, [tps, selectedSubjects])

  const studentsForTable = useMemo(() => {
    const cls = classFilter.trim()
    return students.filter((s) => !cls || (s.className || '').trim() === cls)
  }, [students, classFilter])

  const toggleSubject = (key: SubjectKey) => {
    setSelectedSubjects((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const runGenerate = async () => {
    setError('')
    setNotice('')
    if (!description.trim()) {
      setError('Tuliskan deskripsi aktivitas penilaian.')
      return
    }
    if (selectedSubjects.length === 0) {
      setError('Pilih minimal satu mata pelajaran.')
      return
    }
    setGenerating(true)
    try {
      const result = await generateAssessmentWithOpenAI({
        description: description.trim(),
        subjectKeys: selectedSubjects,
        availableTps: availableTpsForCreate.map((t) => ({
          code: t.code,
          subjectKey: t.subjectKey,
          element: t.element,
          statement: t.statement,
        })),
        titleHint: titleHint.trim() || undefined,
      })
      setDraft({
        title: result.title,
        description: description.trim(),
        subjectKeys: selectedSubjects,
        linkedTpCodes: result.linkedTpCodes,
        components: result.components,
        className: classFilter.trim() || '5A',
        status: 'draft',
        aiNotes: result.aiNotes,
      })
      setNotice('Draf penilaian siap. Periksa komponen & rubrik, lalu simpan.')
    } catch (e: any) {
      setError(e?.message || 'Gagal generate penilaian.')
    } finally {
      setGenerating(false)
    }
  }

  const saveActivity = async () => {
    if (!draft) return
    if (!draft.title.trim() || draft.components.length === 0) {
      setError('Judul dan minimal satu komponen wajib.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const id =
        draft.id ||
        `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      const payload: Omit<AssessmentActivity, 'id'> = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        subjectKeys: draft.subjectKeys,
        linkedTpCodes: draft.linkedTpCodes,
        components: draft.components,
        className: draft.className || '5A',
        status: 'active',
        aiNotes: draft.aiNotes || '',
        updatedAt: serverTimestamp(),
        ...(draft.id ? {} : { createdAt: serverTimestamp() }),
      }
      await setDoc(doc(db, 'assessmentActivities', id), payload, { merge: true })
      setNotice(`Penilaian "${payload.title}" disimpan.`)
      setDraft(null)
      setDescription('')
      setTitleHint('')
      await loadMeta()
      const saved = { id, ...payload } as AssessmentActivity
      setActive(saved)
      setView('detail')
      await openScores(saved)
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const openScores = async (act: AssessmentActivity) => {
    if (!act.id) return
    setScoresLoading(true)
    setError('')
    try {
      const snap = await getDocs(collection(db, 'assessmentScores'))
      const all = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AssessmentScore, 'id'>),
      }))
      setAllScores(all)
      const rows = all.filter((s) => s.activityId === act.id)
      const map: Record<string, Record<string, number>> = {}
      const predMap: Record<string, string> = {}
      rows.forEach((r) => {
        map[r.studentId] = { ...(r.scores || {}) }
        const tot = computeWeightedPercent(act.components, r.scores || {})
        const pred = percentToPredicate(tot)
        if (pred) predMap[r.studentId] = pred
      })
      const cls = (act.className || '').trim()
      students
        .filter((s) => s.id && (!cls || (s.className || '').trim() === cls))
        .forEach((s) => {
          if (!map[s.id!]) map[s.id!] = {}
        })
      setLocalScores(map)
      setPredicates(predMap)
      setScoreDirty(false)
      setRubricFocus(act.components[0]?.id || null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat nilai.')
    } finally {
      setScoresLoading(false)
    }
  }

  const buildSubjectPerformanceNotes = (studentId: string, act: AssessmentActivity): string => {
    const subjectSet = new Set(act.subjectKeys || [])
    const lines: string[] = []
    for (const other of activities) {
      if (!other.id || other.id === act.id) continue
      if (!(other.subjectKeys || []).some((k) => subjectSet.has(k))) continue
      const row = allScores.find((s) => s.activityId === other.id && s.studentId === studentId)
      if (!row?.scores) continue
      const tot = computeWeightedPercent(other.components || [], row.scores)
      if (tot == null) continue
      const pred = percentToPredicate(tot)
      const maps = (other.subjectKeys || [])
        .map((k) => getSubject(k)?.shortName || k)
        .join('/')
      lines.push(`- ${other.title} [${maps}]: ${tot}%${pred ? ` (${pred})` : ''}`)
    }
    return lines.slice(0, 8).join('\n')
  }

  const runSimulateForStudent = async (studentId: string, studentName: string) => {
    if (!active) return
    const predRaw = (predicates[studentId] || '').trim()
    if (!predRaw) {
      setError('Isi predikat dulu (mis. B+ atau A-), lalu tekan tombol petir.')
      return
    }
    setError('')
    setSimulatingIds((p) => ({ ...p, [studentId]: true }))
    try {
      let scores: Record<string, number>
      let note: string | undefined
      try {
        const res = await simulateScoresWithOpenAI({
          predicate: predRaw,
          activityTitle: active.title,
          activityDescription: active.description,
          components: active.components,
          studentName,
          subjectPerformanceNotes: buildSubjectPerformanceNotes(studentId, active),
        })
        scores = res.scores
        note = res.note
      } catch (aiErr: any) {
        scores = simulateScoresFromPredicateLocal(active.components, predRaw)
        note = `Simulasi lokal (AI: ${aiErr?.message || 'gagal'}).`
      }
      setLocalScores((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), ...scores },
      }))
      const tot = computeWeightedPercent(active.components, scores)
      const aligned = percentToPredicate(tot) || normalizePredicate(predRaw)
      if (aligned) {
        setPredicates((p) => ({ ...p, [studentId]: aligned }))
      }
      setScoreDirty(true)
      setNotice(
        `Simulasi ${studentName}: predikat ${predRaw} → skor komponen diisi.${note ? ` ${note}` : ''}`
      )
    } catch (e: any) {
      setError(e?.message || 'Gagal simulasi nilai.')
    } finally {
      setSimulatingIds((p) => {
        const n = { ...p }
        delete n[studentId]
        return n
      })
    }
  }

  const openDetail = async (act: AssessmentActivity) => {
    setActive(act)
    setView('detail')
    setNotice('')
    setError('')
    await openScores(act)
  }

  const setCellScore = (studentId: string, componentId: string, value: number | '') => {
    setLocalScores((prev) => {
      const next = { ...prev }
      const row = { ...(next[studentId] || {}) }
      if (value === '' || value == null) {
        delete row[componentId]
      } else {
        row[componentId] = clampScore(value)
      }
      next[studentId] = row
      return next
    })
    setScoreDirty(true)
  }

  const saveAllScores = async () => {
    if (!active?.id) return
    setSaving(true)
    setError('')
    try {
      const cls = (active.className || '').trim()
      const list = students.filter((s) => s.id && (!cls || (s.className || '').trim() === cls))
      const ops: { id: string; payload: Omit<AssessmentScore, 'id'> }[] = []
      for (const s of list) {
        const sid = s.id!
        const sc = localScores[sid] || {}
        if (Object.keys(sc).length === 0) continue
        ops.push({
          id: scoreDocId(active.id, sid),
          payload: {
            activityId: active.id,
            studentId: sid,
            studentName: s.fullName,
            studentClass: s.className || '',
            scores: sc,
            updatedAt: serverTimestamp(),
          },
        })
      }
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db)
        ops.slice(i, i + 400).forEach(({ id, payload }) => {
          batch.set(doc(db, 'assessmentScores', id), payload, { merge: true })
        })
        await batch.commit()
      }
      setScoreDirty(false)
      setNotice(`Nilai disimpan (${ops.length} siswa).`)
      await openScores(active)
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan nilai.')
    } finally {
      setSaving(false)
    }
  }

  const deleteActivity = async (act: AssessmentActivity) => {
    if (!act.id) return
    if (!confirm(`Hapus penilaian "${act.title}" beserta nilai terkait?`)) return
    setError('')
    try {
      const snap = await getDocs(collection(db, 'assessmentScores'))
      const related = snap.docs.filter((d) => (d.data() as AssessmentScore).activityId === act.id)
      for (let i = 0; i < related.length; i += 400) {
        const batch = writeBatch(db)
        related.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'assessmentActivities', act.id))
      setNotice('Penilaian dihapus.')
      if (active?.id === act.id) {
        setActive(null)
        setView('list')
      }
      await loadMeta()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus.')
    }
  }

  const exportScoresCsv = () => {
    if (!active) return
    const cls = (active.className || '').trim()
    const list = students.filter((s) => s.id && (!cls || (s.className || '').trim() === cls))
    const headers = [
      'No',
      'Nama Siswa',
      'Kelas',
      ...active.components.map((c) => c.label),
      'Total (%)',
      'Predikat',
    ]
    const rows = list.map((s, i) => {
      const sc = localScores[s.id!] || {}
      const cells = active.components.map((c) => sc[c.id] ?? '')
      const total = computeWeightedPercent(active.components, sc)
      const pred = predicates[s.id!] || percentToPredicate(total) || ''
      return [i + 1, s.fullName, s.className || '', ...cells, total ?? '', pred]
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
    downloadCsv(stampFilename(`nilai_${active.title.slice(0, 40)}`, 'csv'), '\uFEFF' + csv)
  }

  const updateDraftComponent = (idx: number, patch: Partial<AssessmentComponent>) => {
    if (!draft) return
    const components = draft.components.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    setDraft({ ...draft, components })
  }

  const tpByCode = useMemo(() => {
    const m = new Map<string, LearningObjective>()
    tps.forEach((t) => m.set(t.code, t))
    return m
  }, [tps])

  return (
    <Layout
      title="Input Nilai"
      subtitle="Penilaian aktivitas/proyek tertaut TP — dibantu AI, diisi guru"
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          {view !== 'list' && (
            <button
              type="button"
              onClick={() => {
                setView('list')
                setDraft(null)
                setActive(null)
                setError('')
              }}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700"
            >
              Daftar
            </button>
          )}
          {view === 'list' && (
            <button
              type="button"
              onClick={() => {
                setView('create')
                setDraft(null)
                setError('')
                setNotice('')
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
            >
              + Buat penilaian AI
            </button>
          )}
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{notice}</div>
      )}

      {view === 'list' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              Tuliskan aktivitas, pilih mapel, AI menautkan TP & merumuskan komponen + rubrik.
              Isi nilai (1–4, step 0,25) atau pakai predikat + tombol ⚡ untuk simulasi AI.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Memuat…</p>
          ) : activities.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="font-medium text-gray-800">Belum ada penilaian</p>
              <button type="button" onClick={() => setView('create')} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
                + Buat penilaian AI
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {(a.subjectKeys || []).map((k) => getSubject(k)?.shortName || k).join(' · ')}
                      {a.className ? ` · Kelas ${a.className}` : ''}
                      {` · ${a.components?.length || 0} komponen`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => openDetail(a)} className="text-xs font-medium px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                      Isi nilai
                    </button>
                    <button type="button" onClick={() => deleteActivity(a)} className="text-xs font-medium px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500">
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === 'create' && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500">Judul (opsional)</label>
              <input value={titleHint} onChange={(e) => setTitleHint(e.target.value)} placeholder="Mis. Penilaian Projek Kantin Kejujuran" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Deskripsi aktivitas <span className="text-red-500">*</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Contoh: penilaian projek kantin kejujuran untuk Pendidikan Pancasila dan Bahasa Indonesia…" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Mata pelajaran terkait <span className="text-red-500">*</span></p>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => {
                  const on = selectedSubjects.includes(s.key)
                  return (
                    <button key={s.key} type="button" onClick={() => toggleSubject(s.key)} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {s.icon} {s.shortName}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Kelas</label>
              <input value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm w-24" />
            </div>
            <button type="button" disabled={generating} onClick={runGenerate} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
              {generating ? 'AI menyusun…' : 'Generate dengan AI'}
            </button>
          </div>

          {draft && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Judul</label>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold" />
              </div>
              {draft.aiNotes && <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{draft.aiNotes}</p>}
              <div className="space-y-3">
                {draft.components.map((c, idx) => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-3">
                    <input value={c.label} onChange={(e) => updateDraftComponent(idx, { label: e.target.value })} className="w-full text-sm font-semibold border-0 border-b border-gray-100 pb-1 mb-2" />
                    <textarea value={c.description} onChange={(e) => updateDraftComponent(idx, { description: e.target.value })} rows={2} className="w-full text-xs text-gray-600 rounded-lg border border-gray-100 px-2 py-1" />
                    <p className="text-[11px] text-gray-400 mt-1">TP: {(c.tpCodes || []).join(', ') || '—'} · bobot {c.weight}</p>
                  </div>
                ))}
              </div>
              <button type="button" disabled={saving} onClick={saveActivity} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Menyimpan…' : 'Simpan & isi nilai'}
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'detail' && active && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{active.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {(active.subjectKeys || []).map((k) => getSubject(k)?.shortName || k).join(' · ')}
                {active.className ? ` · Kelas ${active.className}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button type="button" disabled={!scoreDirty || saving} onClick={saveAllScores} className="text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40">
                {saving ? 'Menyimpan…' : 'Simpan nilai'}
              </button>
              <button type="button" onClick={exportScoresCsv} className="text-xs font-medium px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {scoresLoading ? (
                <p className="p-10 text-center text-sm text-gray-400">Memuat tabel…</p>
              ) : (
                <div className="overflow-x-auto max-h-[70vh]">
                  <table className="text-xs border-collapse min-w-full">
                    <thead className="sticky top-0 z-20 bg-gray-50">
                      <tr className="text-gray-500">
                        <th className="sticky left-0 z-30 bg-gray-50 px-2 py-2.5 text-left border-b border-r w-8">#</th>
                        <th className="sticky left-8 z-30 bg-gray-50 px-3 py-2.5 text-left border-b border-r min-w-[130px]">Siswa</th>
                        {active.components.map((c) => (
                          <th key={c.id} className="px-2 py-2.5 text-center border-b min-w-[72px] cursor-pointer hover:bg-violet-50" title={c.description} onClick={() => setRubricFocus(c.id)}>
                            <span className="font-semibold text-gray-700 block truncate max-w-[100px]">{c.label}</span>
                            <span className="text-[10px] text-gray-400">bobot {c.weight}</span>
                          </th>
                        ))}
                        <th className="px-2 py-2.5 text-center border-b border-l bg-indigo-50/50 text-indigo-700 min-w-[52px]">Total</th>
                        <th className="px-2 py-2.5 text-center border-b bg-amber-50/80 text-amber-800 min-w-[108px]" title="Predikat lalu tekan petir untuk simulasi AI">Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsForTable
                        .filter((s) => {
                          const cls = (active.className || '').trim()
                          return !cls || (s.className || '').trim() === cls
                        })
                        .map((s, idx) => {
                          const sid = s.id!
                          const sc = localScores[sid] || {}
                          const total = computeWeightedPercent(active.components, sc)
                          const busy = Boolean(simulatingIds[sid])
                          return (
                            <tr key={sid} className="hover:bg-indigo-50/20">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-gray-400 border-b border-r tabular-nums">{idx + 1}</td>
                              <td className="sticky left-8 z-10 bg-white px-3 py-1.5 font-medium text-gray-900 border-b border-r truncate max-w-[150px]">{s.fullName}</td>
                              {active.components.map((c) => (
                                <td key={c.id} className="px-1 py-1 border-b text-center">
                                  <select
                                    value={sc[c.id] ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      setCellScore(sid, c.id, v === '' ? '' : Number(v))
                                    }}
                                    className="w-16 rounded-lg border border-gray-200 py-1 text-center text-xs font-semibold tabular-nums bg-white"
                                  >
                                    <option value="">—</option>
                                    {SCORE_OPTIONS.map((lv) => (
                                      <option key={lv} value={lv}>{formatScore(lv)}</option>
                                    ))}
                                  </select>
                                </td>
                              ))}
                              <td className="px-2 py-1.5 text-center border-b border-l font-bold tabular-nums text-indigo-700 bg-indigo-50/20">
                                {total != null ? total : '—'}
                              </td>
                              <td className="px-1.5 py-1 border-b bg-amber-50/30">
                                <div className="flex items-center justify-center gap-1">
                                  <select
                                    value={predicates[sid] || ''}
                                    onChange={(e) => setPredicates((p) => ({ ...p, [sid]: e.target.value }))}
                                    className="w-[4.25rem] rounded-lg border border-amber-200 py-1 text-center text-xs font-bold tabular-nums bg-white text-amber-900"
                                  >
                                    <option value="">—</option>
                                    {PREDICATE_OPTIONS.map((p) => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={busy || !(predicates[sid] || '').trim()}
                                    onClick={() => runSimulateForStudent(sid, s.fullName)}
                                    title="Simulasi skor komponen dengan AI dari predikat"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40"
                                  >
                                    {busy ? <span className="text-[10px] font-bold">…</span> : <span className="text-sm leading-none">⚡</span>}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">
                Predikat (E…A+) + ⚡: AI mengisi skor komponen (mempertimbangkan performa aktivitas mapel yang sama). Tanpa API key → simulasi lokal. Total = rata tertimbang %.
              </p>
            </div>

            <div className="xl:col-span-4 space-y-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Panduan rubrik</h3>
                <div className="flex flex-wrap gap-1 mb-3">
                  {active.components.map((c) => (
                    <button key={c.id} type="button" onClick={() => setRubricFocus(c.id)} className={`text-[11px] px-2 py-1 rounded-lg border ${rubricFocus === c.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {(() => {
                  const c = active.components.find((x) => x.id === rubricFocus) || active.components[0]
                  if (!c) return null
                  return (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-800">{c.label}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{c.description}</p>
                      <p className="text-[11px] text-gray-400">TP: {(c.tpCodes || []).map((code) => tpByCode.get(code)?.code || code).join(', ') || '—'}</p>
                      <ul className="space-y-1.5 mt-2">
                        {(c.rubric || []).map((r) => (
                          <li key={r.level} className="text-xs rounded-lg border border-gray-100 px-2 py-1.5">
                            <span className="font-semibold text-violet-700">L{r.level}</span>{' '}
                            <span className="text-gray-500">{r.label}</span>
                            <p className="text-gray-600 mt-0.5">{r.descriptor}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
