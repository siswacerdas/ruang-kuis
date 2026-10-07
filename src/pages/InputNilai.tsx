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
import { generateAssessmentWithOpenAI } from '../lib/openaiAssessment'
import { downloadCsv, stampFilename } from '../lib/exportGrades'
import {
  computeWeightedPercent,
  RUBRIC_LEVEL_LABELS,
  type AssessmentActivity,
  type AssessmentComponent,
  type AssessmentScore,
  type RubricLevel,
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

  // Create form
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

  // Detail / scores
  const [active, setActive] = useState<AssessmentActivity | null>(null)
  const [, setScores] = useState<AssessmentScore[]>([])
  const [scoresLoading, setScoresLoading] = useState(false)
  const [scoreDirty, setScoreDirty] = useState(false)
  const [localScores, setLocalScores] = useState<Record<string, Record<string, number>>>({})
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
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AssessmentScore, 'id'>) }))
        .filter((s) => s.activityId === act.id)
      setScores(rows)
      const map: Record<string, Record<string, number>> = {}
      rows.forEach((r) => {
        map[r.studentId] = { ...(r.scores || {}) }
      })
      // Pastikan semua siswa kelas punya entry lokal
      const cls = (act.className || '').trim()
      students
        .filter((s) => s.id && (!cls || (s.className || '').trim() === cls))
        .forEach((s) => {
          if (!map[s.id!]) map[s.id!] = {}
        })
      setLocalScores(map)
      setScoreDirty(false)
      setRubricFocus(act.components[0]?.id || null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat nilai.')
    } finally {
      setScoresLoading(false)
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
        row[componentId] = Math.min(4, Math.max(1, Math.round(value)))
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
    ]
    const rows = list.map((s, i) => {
      const sc = localScores[s.id!] || {}
      const cells = active.components.map((c) => sc[c.id] ?? '')
      const total = computeWeightedPercent(active.components, sc)
      return [i + 1, s.fullName, s.className || '', ...cells, total ?? '']
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
        <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">
          {notice}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              Tuliskan aktivitas (mis. projek kantin kejujuran), pilih mapel yang relevan, lalu AI
              menautkan <strong>hanya</strong> TP mapel tersebut dan merumuskan komponen + rubrik
              sederhana. Isi nilai siswa di tabel (skala 1–4).
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Memuat…</p>
          ) : activities.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="font-medium text-gray-800">Belum ada penilaian</p>
              <p className="text-sm text-gray-400 mt-1">
                Buat penilaian baru dengan bantuan AI dari deskripsi aktivitas.
              </p>
              <button
                type="button"
                onClick={() => setView('create')}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
              >
                + Buat penilaian AI
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li
                  key={a.id}
                  className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {(a.subjectKeys || [])
                        .map((k) => getSubject(k)?.shortName || k)
                        .join(' · ')}
                      {a.className ? ` · Kelas ${a.className}` : ''}
                      {` · ${a.components?.length || 0} komponen`}
                      {a.linkedTpCodes?.length ? ` · ${a.linkedTpCodes.length} TP` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openDetail(a)}
                      className="text-xs font-medium px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100"
                    >
                      Isi nilai
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteActivity(a)}
                      className="text-xs font-medium px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200"
                    >
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
              <input
                value={titleHint}
                onChange={(e) => setTitleHint(e.target.value)}
                placeholder="Mis. Penilaian Projek Kantin Kejujuran"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">
                Deskripsi aktivitas <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder='Contoh: Saya ingin membuat penilaian untuk projek kantin kejujuran yang berkaitan dengan Pendidikan Pancasila dan Bahasa Indonesia…'
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                Mata pelajaran terkait <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400">
                  {' '}
                  — AI hanya memilih TP dari mapel ini
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => {
                  const on = selectedSubjects.includes(s.key)
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggleSubject(s.key)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                        on
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {s.icon} {s.shortName}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                TP tersedia untuk mapel terpilih: {availableTpsForCreate.length}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500">Kelas</label>
                <input
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="mt-1 block w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={runGenerate}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60"
              >
                {generating ? 'AI merumuskan…' : 'Generate dengan AI'}
              </button>
            </div>
          </div>

          {draft && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500">Judul penilaian</label>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="mt-1 w-full sm:w-96 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveActivity}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-60"
                >
                  {saving ? 'Menyimpan…' : 'Simpan & buka tabel nilai'}
                </button>
              </div>

              {draft.aiNotes && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{draft.aiNotes}</p>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  TP tertaut ({draft.linkedTpCodes.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.linkedTpCodes.map((code) => {
                    const tp = tpByCode.get(code)
                    return (
                      <span
                        key={code}
                        title={tp?.statement || code}
                        className="text-[11px] px-2 py-1 rounded-lg bg-violet-50 text-violet-800 font-medium"
                      >
                        {code}
                      </span>
                    )
                  })}
                  {draft.linkedTpCodes.length === 0 && (
                    <span className="text-xs text-amber-600">
                      Belum ada TP — edit komponen atau generate ulang.
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Komponen penilaian
                </p>
                {draft.components.map((c, idx) => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={c.label}
                        onChange={(e) => updateDraftComponent(idx, { label: e.target.value })}
                        className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium"
                      />
                      <input
                        type="number"
                        min={0.5}
                        max={5}
                        step={0.5}
                        value={c.weight}
                        onChange={(e) =>
                          updateDraftComponent(idx, { weight: Number(e.target.value) || 1 })
                        }
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        title="Bobot"
                      />
                    </div>
                    <textarea
                      value={c.description}
                      onChange={(e) => updateDraftComponent(idx, { description: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
                    />
                    <p className="text-[11px] text-gray-400">
                      TP: {c.tpCodes.join(', ') || '—'} · Rubrik 4 level siap
                    </p>
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer text-indigo-600 font-medium">
                        Lihat rubrik
                      </summary>
                      <ul className="mt-2 space-y-1 pl-1">
                        {c.rubric.map((r) => (
                          <li key={r.level}>
                            <strong>
                              {r.level}. {r.label}:
                            </strong>{' '}
                            {r.descriptor}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'detail' && active && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">{active.title}</h2>
              <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{active.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(active.subjectKeys || []).map((k) => (
                  <span
                    key={k}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                  >
                    {getSubject(k)?.shortName || k}
                  </span>
                ))}
                {(active.linkedTpCodes || []).map((code) => (
                  <span
                    key={code}
                    title={tpByCode.get(code)?.statement}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                disabled={!scoreDirty || saving}
                onClick={saveAllScores}
                className="text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40"
              >
                {saving ? 'Menyimpan…' : 'Simpan nilai'}
              </button>
              <button
                type="button"
                onClick={exportScoresCsv}
                className="text-xs font-medium px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700"
              >
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
                        <th className="sticky left-0 z-30 bg-gray-50 px-2 py-2.5 text-left border-b border-r w-8">
                          #
                        </th>
                        <th className="sticky left-8 z-30 bg-gray-50 px-3 py-2.5 text-left border-b border-r min-w-[130px]">
                          Siswa
                        </th>
                        {active.components.map((c) => (
                          <th
                            key={c.id}
                            className="px-2 py-2.5 text-center border-b min-w-[72px] cursor-pointer hover:bg-violet-50"
                            title={c.description}
                            onClick={() => setRubricFocus(c.id)}
                          >
                            <span className="font-semibold text-gray-700 block truncate max-w-[100px]">
                              {c.label}
                            </span>
                            <span className="text-[10px] text-gray-400">bobot {c.weight}</span>
                          </th>
                        ))}
                        <th className="px-2 py-2.5 text-center border-b border-l bg-indigo-50/50 text-indigo-700 min-w-[52px]">
                          Total
                        </th>
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
                          return (
                            <tr key={sid} className="hover:bg-indigo-50/20">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-gray-400 border-b border-r tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="sticky left-8 z-10 bg-white px-3 py-1.5 font-medium text-gray-900 border-b border-r truncate max-w-[150px]">
                                {s.fullName}
                              </td>
                              {active.components.map((c) => (
                                <td key={c.id} className="px-1 py-1 border-b text-center">
                                  <select
                                    value={sc[c.id] ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      setCellScore(sid, c.id, v === '' ? '' : Number(v))
                                    }}
                                    className="w-14 rounded-lg border border-gray-200 py-1 text-center text-xs font-semibold tabular-nums bg-white"
                                  >
                                    <option value="">—</option>
                                    {([1, 2, 3, 4] as RubricLevel[]).map((lv) => (
                                      <option key={lv} value={lv}>
                                        {lv}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              ))}
                              <td className="px-2 py-1.5 text-center border-b border-l font-bold tabular-nums text-indigo-700 bg-indigo-50/20">
                                {total != null ? total : '—'}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">
                Skala 1–4 ({Object.entries(RUBRIC_LEVEL_LABELS).map(([k, v]) => `${k}=${v}`).join(', ')}
                ). Total = rata tertimbang → persen. Klik header komponen untuk fokus rubrik.
              </p>
            </div>

            <div className="xl:col-span-4 space-y-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Panduan rubrik</h3>
                <div className="flex flex-wrap gap-1 mb-3">
                  {active.components.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setRubricFocus(c.id)}
                      className={`text-[11px] px-2 py-1 rounded-lg border ${
                        rubricFocus === c.id
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {(() => {
                  const c = active.components.find((x) => x.id === rubricFocus) || active.components[0]
                  if (!c) return <p className="text-xs text-gray-400">Tidak ada komponen.</p>
                  return (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.label}</p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{c.description}</p>
                      {c.tpCodes.length > 0 && (
                        <p className="text-[11px] text-violet-700 mt-2 font-medium">
                          TP: {c.tpCodes.join(', ')}
                        </p>
                      )}
                      <ul className="mt-3 space-y-2">
                        {c.rubric.map((r) => (
                          <li
                            key={r.level}
                            className="text-xs rounded-xl border border-gray-100 px-3 py-2"
                          >
                            <span className="font-semibold text-gray-800">
                              {r.level}. {r.label}
                            </span>
                            <p className="text-gray-600 mt-0.5 leading-relaxed">{r.descriptor}</p>
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
