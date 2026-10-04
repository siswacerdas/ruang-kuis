import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import { SUBJECTS, getSubject } from '../types/question'
import type { BookMaterial, LearningObjective, SubjectKey, TpSeedFile } from '../types/tp'

type Tab = 'tp' | 'materi'

const emptyTp = (): LearningObjective => ({
  code: '',
  subjectKey: 'bahasa-indonesia',
  element: '',
  order: 1,
  statement: '',
  weight: 1,
  active: true,
  className: '5A',
  phase: 'C',
})

export default function TujuanPembelajaran() {
  const [tab, setTab] = useState<Tab>('tp')
  const [items, setItems] = useState<LearningObjective[]>([])
  const [materials, setMaterials] = useState<BookMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('semua')
  const [queryText, setQueryText] = useState('')
  const [importing, setImporting] = useState(false)
  const [editor, setEditor] = useState<LearningObjective | null>(null)
  const [materialEditor, setMaterialEditor] = useState<BookMaterial | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tpSnap, matSnap] = await Promise.all([
        getDocs(collection(db, 'learningObjectives')),
        getDocs(collection(db, 'bookMaterials')),
      ])
      setItems(
        tpSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LearningObjective, 'id'>) }))
          .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.order - b.order || a.code.localeCompare(b.code))
      )
      setMaterials(
        matSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<BookMaterial, 'id'>) }))
          .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.title.localeCompare(b.title, 'id'))
      )
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredTp = useMemo(() => {
    const q = queryText.trim().toLowerCase()
    return items.filter((t) => {
      if (subjectFilter !== 'semua' && t.subjectKey !== subjectFilter) return false
      if (!q) return true
      return [t.code, t.statement, t.element].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [items, subjectFilter, queryText])

  const groupedTp = useMemo(() => {
    const groups: { subjectKey: string; element: string; rows: LearningObjective[] }[] = []
    filteredTp.forEach((row) => {
      const last = groups[groups.length - 1]
      if (last && last.subjectKey === row.subjectKey && last.element === row.element) last.rows.push(row)
      else groups.push({ subjectKey: row.subjectKey, element: row.element || 'Umum', rows: [row] })
    })
    return groups
  }, [filteredTp])

  const filteredMaterials = useMemo(() => {
    const q = queryText.trim().toLowerCase()
    return materials.filter((m) => {
      if (subjectFilter !== 'semua' && m.subjectKey !== subjectFilter) return false
      if (!q) return true
      return [m.title, m.summary, ...(m.suggestedTpCodes || [])].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [materials, subjectFilter, queryText])

  const importJson = async (file: File) => {
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const data = JSON.parse(await file.text()) as TpSeedFile
      if (!Array.isArray(data.tp) || data.tp.length === 0) throw new Error('File tidak berisi array tp.')
      let tpCount = 0
      for (let i = 0; i < data.tp.length; i += 400) {
        const batch = writeBatch(db)
        data.tp.slice(i, i + 400).forEach((raw) => {
          const code = String(raw.code || '').trim()
          if (!code || !raw.statement || !raw.subjectKey) return
          batch.set(
            doc(db, 'learningObjectives', code),
            {
              code,
              subjectKey: raw.subjectKey,
              element: raw.element || '',
              order: Number(raw.order) || 0,
              statement: String(raw.statement).trim(),
              weight: Number(raw.weight) || 1,
              active: raw.active !== false,
              className: raw.className || data.className || '5A',
              phase: raw.phase || data.phase || 'C',
              source: raw.source || data.version || 'import',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
          tpCount += 1
        })
        await batch.commit()
      }
      const mats = data.materiBuku || []
      for (let i = 0; i < mats.length; i += 400) {
        const batch = writeBatch(db)
        mats.slice(i, i + 400).forEach((m) => {
          batch.set(
            doc(db, 'bookMaterials', `${m.subjectKey}__${slug(m.title)}`),
            {
              subjectKey: m.subjectKey,
              title: m.title,
              summary: m.summary || '',
              suggestedTpCodes: m.suggestedTpCodes || [],
              linkNote: m.linkNote || '',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        })
        await batch.commit()
      }
      const byTp = new Map<string, string[]>()
      mats.forEach((m) => {
        ;(m.suggestedTpCodes || []).forEach((code) => {
          const list = byTp.get(code) || []
          list.push(m.title)
          byTp.set(code, list)
        })
      })
      const tpCodes = [...byTp.keys()]
      for (let i = 0; i < tpCodes.length; i += 400) {
        const batch = writeBatch(db)
        tpCodes.slice(i, i + 400).forEach((code) => {
          batch.set(doc(db, 'learningObjectives', code), { relatedMaterials: byTp.get(code) || [], updatedAt: serverTimestamp() }, { merge: true })
        })
        await batch.commit()
      }
      setNotice(`Impor langsung tersimpan: ${tpCount} TP dan ${mats.length} materi. Satu TP boleh terkait lebih dari satu materi.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal membaca JSON.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const saveTp = async () => {
    if (!editor) return
    const code = editor.code.trim()
    if (!code || !editor.statement.trim()) {
      setError('Kode dan rumusan wajib diisi.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.set(
        doc(db, 'learningObjectives', code),
        {
          code,
          subjectKey: editor.subjectKey,
          element: editor.element.trim(),
          order: Number(editor.order) || 0,
          statement: editor.statement.trim(),
          weight: Number(editor.weight) || 1,
          active: !!editor.active,
          className: editor.className || '5A',
          phase: editor.phase || 'C',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      await batch.commit()
      setEditor(null)
      setNotice(`TP ${code} disimpan.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan TP.')
    } finally {
      setSaving(false)
    }
  }

  const saveMaterial = async () => {
    if (!materialEditor) return
    if (!materialEditor.title.trim()) {
      setError('Judul materi wajib diisi.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const id = materialEditor.id || `${materialEditor.subjectKey}__${slug(materialEditor.title)}`
      const batch = writeBatch(db)
      batch.set(
        doc(db, 'bookMaterials', id),
        {
          subjectKey: materialEditor.subjectKey,
          title: materialEditor.title.trim(),
          summary: materialEditor.summary.trim(),
          suggestedTpCodes: materialEditor.suggestedTpCodes,
          linkNote: materialEditor.linkNote || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      await batch.commit()
      setMaterialEditor(null)
      setNotice('Materi disimpan.')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan materi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout
      title="Tujuan Pembelajaran"
      subtitle="Master TP dan materi buku. Impor langsung tersimpan; ubah lewat Edit kapan saja."
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (tab === 'tp' ? setEditor(emptyTp()) : setMaterialEditor({ subjectKey: 'ipas', title: '', summary: '', suggestedTpCodes: [] }))}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700"
          >
            Tambah
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {importing ? 'Mengimpor...' : 'Impor JSON'}
          </button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) importJson(file)
        }}
      />

      {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {notice && <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{notice}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-2">
        <FilterChip active={subjectFilter === 'semua'} onClick={() => setSubjectFilter('semua')} label={`Semua (${items.length})`} />
        {SUBJECTS.map((s) => (
          <FilterChip
            key={s.key}
            active={subjectFilter === s.key}
            onClick={() => setSubjectFilter(s.key)}
            label={`${s.shortName} (${items.filter((t) => t.subjectKey === s.key).length})`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TabButton active={tab === 'tp'} onClick={() => setTab('tp')} label="Tujuan Pembelajaran" />
        <TabButton active={tab === 'materi'} onClick={() => setTab('materi')} label="Materi buku" />
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Cari kode, rumusan, atau materi"
          className="ml-auto w-full sm:w-72 rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : tab === 'tp' ? (
        groupedTp.length === 0 ? (
          <Empty text="Belum ada TP. Impor tp-kelas5-seed.json — data langsung tersimpan." />
        ) : (
          <div className="space-y-4">
            {groupedTp.map((group) => (
              <section key={`${group.subjectKey}-${group.element}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <header className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{getSubject(group.subjectKey)?.name}</p>
                    <h3 className="text-sm font-semibold text-gray-900">{group.element}</h3>
                  </div>
                  <span className="text-xs text-gray-400">{group.rows.length} TP</span>
                </header>
                <div className="divide-y divide-gray-100">
                  {group.rows.map((row) => (
                    <div key={row.id} className="px-4 py-3 flex gap-3 items-start">
                      <span className="shrink-0 mt-0.5 text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{row.code}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed ${row.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{row.statement}</p>
                        {(row.relatedMaterials || []).length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Materi: {row.relatedMaterials!.join(' · ')}</p>
                        )}
                      </div>
                      <button type="button" onClick={() => setEditor(row)} className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : filteredMaterials.length === 0 ? (
        <Empty text="Belum ada materi buku." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredMaterials.map((m) => (
            <article key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">{getSubject(m.subjectKey)?.name}</p>
                  <h3 className="font-semibold text-gray-900">{m.title}</h3>
                </div>
                <button type="button" onClick={() => setMaterialEditor(m)} className="text-sm font-medium text-indigo-600">
                  Edit
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2 flex-1">{m.summary || '—'}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(m.suggestedTpCodes || []).length === 0 ? (
                  <span className="text-xs text-gray-400">Belum dikaitkan ke TP</span>
                ) : (
                  m.suggestedTpCodes.map((code) => (
                    <span key={code} className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{code}</span>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editor && (
        <Modal title={editor.id ? `Edit ${editor.code}` : 'Tambah TP'} onClose={() => setEditor(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kode">
              <input value={editor.code} disabled={!!editor.id} onChange={(e) => setEditor({ ...editor, code: e.target.value.toUpperCase() })} className="field" />
            </Field>
            <Field label="Mapel">
              <select value={editor.subjectKey} onChange={(e) => setEditor({ ...editor, subjectKey: e.target.value as SubjectKey })} className="field">
                {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Elemen / tema">
              <input value={editor.element} onChange={(e) => setEditor({ ...editor, element: e.target.value })} className="field" />
            </Field>
            <Field label="Urutan">
              <input type="number" value={editor.order} onChange={(e) => setEditor({ ...editor, order: Number(e.target.value) })} className="field" />
            </Field>
            <Field label="Bobot nilai">
              <input type="number" min={0} step={0.1} value={editor.weight} onChange={(e) => setEditor({ ...editor, weight: Number(e.target.value) })} className="field" />
            </Field>
            <Field label="Status">
              <select value={editor.active ? 'ya' : 'tidak'} onChange={(e) => setEditor({ ...editor, active: e.target.value === 'ya' })} className="field">
                <option value="ya">Aktif</option>
                <option value="tidak">Nonaktif</option>
              </select>
            </Field>
          </div>
          <Field label="Rumusan">
            <textarea value={editor.statement} onChange={(e) => setEditor({ ...editor, statement: e.target.value })} rows={4} className="field" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditor(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600">Batal</button>
            <button type="button" onClick={saveTp} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </Modal>
      )}

      {materialEditor && (
        <Modal title="Edit materi" onClose={() => setMaterialEditor(null)}>
          <Field label="Mapel">
            <select value={materialEditor.subjectKey} onChange={(e) => setMaterialEditor({ ...materialEditor, subjectKey: e.target.value as SubjectKey })} className="field">
              {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Judul">
            <input value={materialEditor.title} onChange={(e) => setMaterialEditor({ ...materialEditor, title: e.target.value })} className="field" />
          </Field>
          <Field label="Ringkas isi">
            <textarea value={materialEditor.summary} onChange={(e) => setMaterialEditor({ ...materialEditor, summary: e.target.value })} rows={3} className="field" />
          </Field>
          <Field label="Kode TP terkait (pisahkan koma)">
            <input
              value={(materialEditor.suggestedTpCodes || []).join(', ')}
              onChange={(e) => setMaterialEditor({ ...materialEditor, suggestedTpCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              className="field"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setMaterialEditor(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600">Batal</button>
            <button type="button" onClick={saveMaterial} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </Modal>
      )}
      <style>{`.field{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-size:14px;background:white}`}</style>
    </Layout>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-600'}`}>
      {label}
    </button>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-medium ${active ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
      {label}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">{text}</div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-sm">Tutup</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-gray-500 space-y-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}
