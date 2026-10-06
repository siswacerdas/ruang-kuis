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

function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'materi'
}

function SummaryBlock({ text, className = '' }: { text?: string; className?: string }) {
  const t = (text || '').trim()
  if (!t) return <p className={`text-sm text-gray-400 ${className}`}>—</p>
  return (
    <pre className={`text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed m-0 ${className}`}>
      {t}
    </pre>
  )
}

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
  const [tpPickerQuery, setTpPickerQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedTpCodes, setSelectedTpCodes] = useState<string[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
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
          .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.order - b.order || a.code.localeCompare(b.code)),
      )
      setMaterials(
        matSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<BookMaterial, 'id'>) }))
          .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.title.localeCompare(b.title, 'id')),
      )
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    setSelectedTpCodes([])
    setSelectedMaterialIds([])
  }, [tab, subjectFilter, queryText])

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
      const element = (row.element || '').trim() || 'Umum'
      const last = groups[groups.length - 1]
      if (last && last.subjectKey === row.subjectKey && last.element === element) last.rows.push(row)
      else groups.push({ subjectKey: row.subjectKey, element, rows: [row] })
    })
    return groups
  }, [filteredTp])

  const tpCountBySubject = useMemo(() => {
    const map: Record<string, number> = {}
    items.forEach((t) => { map[t.subjectKey] = (map[t.subjectKey] || 0) + 1 })
    return map
  }, [items])

  const materialCountBySubject = useMemo(() => {
    const map: Record<string, number> = {}
    materials.forEach((m) => { map[m.subjectKey] = (map[m.subjectKey] || 0) + 1 })
    return map
  }, [materials])

  const filteredMaterials = useMemo(() => {
    const q = queryText.trim().toLowerCase()
    return materials.filter((m) => {
      if (subjectFilter !== 'semua' && m.subjectKey !== subjectFilter) return false
      if (!q) return true
      return [m.title, m.summary, ...(m.suggestedTpCodes || [])].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [materials, subjectFilter, queryText])

  const tpOptionsForMaterial = useMemo(() => {
    if (!materialEditor) return []
    const q = tpPickerQuery.trim().toLowerCase()
    return items.filter((t) => {
      if (t.subjectKey !== materialEditor.subjectKey) return false
      if (t.active === false) return false
      if (!q) return true
      return [t.code, t.statement, t.element].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [items, materialEditor, tpPickerQuery])

  const tpByCode = useMemo(() => {
    const map = new Map<string, LearningObjective>()
    items.forEach((t) => map.set(t.code, t))
    return map
  }, [items])

  const deleteTpBatch = async (rows: LearningObjective[]) => {
    const codes = [...new Set(rows.map((r) => r.code).filter(Boolean))]
    if (codes.length === 0) return
    const codeSet = new Set(codes)
    for (let i = 0; i < codes.length; i += 400) {
      const batch = writeBatch(db)
      codes.slice(i, i + 400).forEach((code) => batch.delete(doc(db, 'learningObjectives', code)))
      await batch.commit()
    }
    const matsToUpdate = materials.filter((m) => m.id && (m.suggestedTpCodes || []).some((c) => codeSet.has(c)))
    for (let i = 0; i < matsToUpdate.length; i += 400) {
      const batch = writeBatch(db)
      matsToUpdate.slice(i, i + 400).forEach((m) => {
        batch.set(doc(db, 'bookMaterials', m.id!), {
          suggestedTpCodes: (m.suggestedTpCodes || []).filter((c) => !codeSet.has(c)),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      })
      await batch.commit()
    }
  }

  const deleteMaterialBatch = async (mats: BookMaterial[]) => {
    const list = mats.filter((m) => m.id)
    if (list.length === 0) return
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db)
      list.slice(i, i + 400).forEach((m) => batch.delete(doc(db, 'bookMaterials', m.id!)))
      await batch.commit()
    }
    const titlesByCode = new Map<string, Set<string>>()
    list.forEach((m) => {
      ;(m.suggestedTpCodes || []).forEach((code) => {
        const set = titlesByCode.get(code) || new Set<string>()
        set.add(m.title)
        titlesByCode.set(code, set)
      })
    })
    const entries = [...titlesByCode.entries()]
    for (let i = 0; i < entries.length; i += 400) {
      const batch = writeBatch(db)
      entries.slice(i, i + 400).forEach(([code, titles]) => {
        const tp = tpByCode.get(code)
        if (!tp) return
        batch.set(doc(db, 'learningObjectives', code), {
          relatedMaterials: (tp.relatedMaterials || []).filter((t) => !titles.has(t)),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      })
      await batch.commit()
    }
  }

  const deleteTp = async (row: LearningObjective) => {
    if (!row.code) return
    const related = (row.relatedMaterials || []).length
    if (!confirm(related > 0
      ? `Hapus TP ${row.code}?\n\nTP terkait ${related} materi. Kode dilepas dari materi terkait.`
      : `Hapus TP ${row.code}?\n\nTidak bisa dibatalkan.`)) return
    setDeletingId(row.code)
    setError('')
    try {
      await deleteTpBatch([row])
      setEditor(null)
      setSelectedTpCodes((p) => p.filter((c) => c !== row.code))
      setNotice(`TP ${row.code} dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus TP.')
    } finally {
      setDeletingId(null)
    }
  }

  const deleteMaterial = async (m: BookMaterial) => {
    if (!m.id) return
    const codes = m.suggestedTpCodes || []
    if (!confirm(codes.length > 0
      ? `Hapus materi "${m.title}"?\n\nTerkait ${codes.length} TP.`
      : `Hapus materi "${m.title}"?`)) return
    setDeletingId(m.id)
    setError('')
    try {
      await deleteMaterialBatch([m])
      setMaterialEditor(null)
      setSelectedMaterialIds((p) => p.filter((id) => id !== m.id))
      setNotice(`Materi "${m.title}" dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus materi.')
    } finally {
      setDeletingId(null)
    }
  }

  const allVisibleTpSelected = filteredTp.length > 0 && filteredTp.every((t) => selectedTpCodes.includes(t.code))
  const allVisibleMatSelected = filteredMaterials.length > 0 && filteredMaterials.every((m) => m.id && selectedMaterialIds.includes(m.id))

  const deleteSelectedTp = async () => {
    const rows = items.filter((t) => selectedTpCodes.includes(t.code))
    if (!rows.length) { setError('Centang minimal satu TP.'); return }
    if (!confirm(`Hapus ${rows.length} TP terpilih?`)) return
    setBulkBusy(true)
    try {
      await deleteTpBatch(rows)
      setSelectedTpCodes([])
      setNotice(`${rows.length} TP dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus.')
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteAllFilteredTp = async () => {
    if (!filteredTp.length) return
    if (!confirm(`Hapus ${filteredTp.length} TP yang tampil (ikut filter)?`)) return
    if (filteredTp.length >= 20 && !confirm(`Konfirmasi: hapus ${filteredTp.length} TP?`)) return
    setBulkBusy(true)
    try {
      await deleteTpBatch(filteredTp)
      setSelectedTpCodes([])
      setNotice(`${filteredTp.length} TP dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus.')
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteSelectedMaterials = async () => {
    const mats = materials.filter((m) => m.id && selectedMaterialIds.includes(m.id))
    if (!mats.length) { setError('Centang minimal satu materi.'); return }
    if (!confirm(`Hapus ${mats.length} materi terpilih?`)) return
    setBulkBusy(true)
    try {
      await deleteMaterialBatch(mats)
      setSelectedMaterialIds([])
      setNotice(`${mats.length} materi dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus.')
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteAllFilteredMaterials = async () => {
    if (!filteredMaterials.length) return
    if (!confirm(`Hapus ${filteredMaterials.length} materi yang tampil?`)) return
    if (filteredMaterials.length >= 20 && !confirm(`Konfirmasi: hapus ${filteredMaterials.length} materi?`)) return
    setBulkBusy(true)
    try {
      await deleteMaterialBatch(filteredMaterials)
      setSelectedMaterialIds([])
      setNotice(`${filteredMaterials.length} materi dihapus.`)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus.')
    } finally {
      setBulkBusy(false)
    }
  }

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
          batch.set(doc(db, 'learningObjectives', code), {
            code, subjectKey: raw.subjectKey, element: raw.element || '', order: Number(raw.order) || 0,
            statement: String(raw.statement).trim(), weight: Number(raw.weight) || 1, active: raw.active !== false,
            className: raw.className || data.className || '5A', phase: raw.phase || data.phase || 'C',
            source: raw.source || data.version || 'import', updatedAt: serverTimestamp(),
          }, { merge: true })
          tpCount += 1
        })
        await batch.commit()
      }
      const mats = data.materiBuku || []
      for (let i = 0; i < mats.length; i += 400) {
        const batch = writeBatch(db)
        mats.slice(i, i + 400).forEach((m) => {
          batch.set(doc(db, 'bookMaterials', `${m.subjectKey}__${slug(m.title)}`), {
            subjectKey: m.subjectKey, title: m.title, summary: m.summary || '',
            suggestedTpCodes: m.suggestedTpCodes || [], linkNote: m.linkNote || '', updatedAt: serverTimestamp(),
          }, { merge: true })
        })
        await batch.commit()
      }
      setNotice(`Impor: ${tpCount} TP dan ${mats.length} materi.`)
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
    if (!code || !editor.statement.trim()) { setError('Kode dan rumusan wajib.'); return }
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, 'learningObjectives', code), {
        code, subjectKey: editor.subjectKey, element: editor.element.trim(), order: Number(editor.order) || 0,
        statement: editor.statement.trim(), weight: Number(editor.weight) || 1, active: !!editor.active,
        className: editor.className || '5A', phase: editor.phase || 'C', updatedAt: serverTimestamp(),
      }, { merge: true })
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
    if (!materialEditor.title.trim()) { setError('Judul wajib.'); return }
    setSaving(true)
    setError('')
    try {
      const id = materialEditor.id || `${materialEditor.subjectKey}__${slug(materialEditor.title)}`
      const title = materialEditor.title.trim()
      const codes = [...new Set((materialEditor.suggestedTpCodes || []).map((c) => c.trim()).filter(Boolean))]
      const prev = materials.find((m) => m.id === id)
      const prevCodes = prev?.suggestedTpCodes || []
      const batch = writeBatch(db)
      batch.set(doc(db, 'bookMaterials', id), {
        subjectKey: materialEditor.subjectKey, title, summary: materialEditor.summary.trim(),
        suggestedTpCodes: codes, linkNote: materialEditor.linkNote || '', updatedAt: serverTimestamp(),
      }, { merge: true })
      const affected = new Set([...prevCodes, ...codes])
      affected.forEach((code) => {
        const tp = tpByCode.get(code)
        const existing = [...(tp?.relatedMaterials || [])]
        let next = existing.filter((t) => t !== title && t !== prev?.title)
        if (codes.includes(code)) next.push(title)
        next = [...new Set(next)]
        batch.set(doc(db, 'learningObjectives', code), { relatedMaterials: next, updatedAt: serverTimestamp() }, { merge: true })
      })
      await batch.commit()
      setMaterialEditor(null)
      setTpPickerQuery('')
      setNotice('Materi disimpan.')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan materi.')
    } finally {
      setSaving(false)
    }
  }

  const toggleTpCode = (code: string) => {
    if (!materialEditor) return
    const cur = materialEditor.suggestedTpCodes || []
    setMaterialEditor({ ...materialEditor, suggestedTpCodes: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] })
  }

  return (
    <Layout
      title="Tujuan Pembelajaran"
      subtitle="Master TP dan materi buku. Impor/ekspor; edit, hapus satu, atau hapus massal."
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={() => tab === 'tp' ? setEditor(emptyTp()) : setMaterialEditor({ subjectKey: 'ipas', title: '', summary: '', suggestedTpCodes: [] })}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700">Tambah</button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importing}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60">{importing ? 'Mengimpor...' : 'Impor JSON'}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f) }} />
        </div>
      }
    >
      {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {notice && <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{notice}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-2">
        <FilterChip active={subjectFilter === 'semua'} onClick={() => setSubjectFilter('semua')}
          label={tab === 'tp' ? `Semua (${items.length})` : `Semua (${materials.length})`} />
        {SUBJECTS.map((s) => (
          <FilterChip key={s.key} active={subjectFilter === s.key} onClick={() => setSubjectFilter(s.key)}
            label={tab === 'tp' ? `${s.shortName} (${tpCountBySubject[s.key] || 0})` : `${s.shortName} (${materialCountBySubject[s.key] || 0})`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TabButton active={tab === 'tp'} onClick={() => setTab('tp')} label="Tujuan Pembelajaran" />
        <TabButton active={tab === 'materi'} onClick={() => setTab('materi')} label="Materi buku" />
        <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Cari kode, rumusan, atau materi"
          className="ml-auto w-full sm:w-72 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
      </div>

      {tab === 'tp' ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={allVisibleTpSelected} disabled={!filteredTp.length || bulkBusy}
              onChange={() => {
                if (allVisibleTpSelected) {
                  const vis = new Set(filteredTp.map((t) => t.code))
                  setSelectedTpCodes((p) => p.filter((c) => !vis.has(c)))
                } else setSelectedTpCodes((p) => [...new Set([...p, ...filteredTp.map((t) => t.code)])])
              }} className="rounded border-gray-300 text-indigo-600" />
            Pilih semua yang tampil ({filteredTp.length})
          </label>
          <span className="text-xs text-gray-400">{selectedTpCodes.length ? `${selectedTpCodes.length} dipilih` : ''}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={deleteSelectedTp} disabled={bulkBusy || !selectedTpCodes.length}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40">Hapus terpilih</button>
            <button type="button" onClick={deleteAllFilteredTp} disabled={bulkBusy || !filteredTp.length}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-800 border border-red-300 hover:bg-red-50 disabled:opacity-40">Hapus semua yang tampil</button>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={allVisibleMatSelected} disabled={!filteredMaterials.length || bulkBusy}
              onChange={() => {
                const ids = filteredMaterials.map((m) => m.id).filter(Boolean) as string[]
                if (allVisibleMatSelected) {
                  const vis = new Set(ids)
                  setSelectedMaterialIds((p) => p.filter((id) => !vis.has(id)))
                } else setSelectedMaterialIds((p) => [...new Set([...p, ...ids])])
              }} className="rounded border-gray-300 text-indigo-600" />
            Pilih semua yang tampil ({filteredMaterials.length})
          </label>
          <span className="text-xs text-gray-400">{selectedMaterialIds.length ? `${selectedMaterialIds.length} dipilih` : ''}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={deleteSelectedMaterials} disabled={bulkBusy || !selectedMaterialIds.length}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40">Hapus terpilih</button>
            <button type="button" onClick={deleteAllFilteredMaterials} disabled={bulkBusy || !filteredMaterials.length}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-800 border border-red-300 hover:bg-red-50 disabled:opacity-40">Hapus semua yang tampil</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Memuat...</p>
      ) : tab === 'tp' ? (
        groupedTp.length === 0 ? (
          <Empty text="Belum ada TP. Impor JSON seed atau klik Tambah." />
        ) : (
          <div className="space-y-4">
            {groupedTp.map((group, gi) => (
              <section key={`${group.subjectKey}__${group.element}__${gi}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <header className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{getSubject(group.subjectKey)?.name || group.subjectKey}</p>
                    <h3 className="text-sm font-semibold text-gray-900">{group.element}</h3>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{group.rows.length} TP</span>
                </header>
                <div className="divide-y divide-gray-100">
                  {group.rows.map((row) => (
                    <div key={row.code} className="px-4 py-3 flex gap-3 items-start">
                      <input type="checkbox" checked={selectedTpCodes.includes(row.code)} onChange={() =>
                        setSelectedTpCodes((p) => p.includes(row.code) ? p.filter((c) => c !== row.code) : [...p, row.code])
                      } disabled={bulkBusy} className="mt-1 rounded border-gray-300 text-indigo-600 shrink-0" />
                      <span className="shrink-0 mt-0.5 text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{row.code}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed ${row.active !== false ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{row.statement}</p>
                        {(row.relatedMaterials || []).length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Materi: {row.relatedMaterials!.join(' · ')}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button type="button" onClick={() => setEditor(row)} className="text-sm font-medium text-indigo-600">Edit</button>
                        <button type="button" onClick={() => deleteTp(row)} disabled={deletingId === row.code || bulkBusy}
                          className="text-sm font-medium text-red-600 disabled:opacity-50">{deletingId === row.code ? '...' : 'Hapus'}</button>
                      </div>
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
                <div className="flex items-start gap-2 min-w-0">
                  {m.id && (
                    <input type="checkbox" checked={selectedMaterialIds.includes(m.id)} onChange={() =>
                      setSelectedMaterialIds((p) => p.includes(m.id!) ? p.filter((x) => x !== m.id) : [...p, m.id!])
                    } disabled={bulkBusy} className="mt-1 rounded border-gray-300 text-indigo-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{getSubject(m.subjectKey)?.name || m.subjectKey}</p>
                    <h3 className="font-semibold text-gray-900">{m.title}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => { setTpPickerQuery(''); setMaterialEditor(m) }} className="text-sm font-medium text-indigo-600">Edit</button>
                  <button type="button" onClick={() => deleteMaterial(m)} disabled={deletingId === m.id || bulkBusy}
                    className="text-sm font-medium text-red-600 disabled:opacity-50">{deletingId === m.id ? '...' : 'Hapus'}</button>
                </div>
              </div>
              <div className="mt-2 flex-1 max-h-40 overflow-y-auto rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-100">
                <SummaryBlock text={m.summary} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(m.suggestedTpCodes || []).length === 0 ? (
                  <span className="text-xs text-gray-400">Belum dikaitkan ke TP</span>
                ) : m.suggestedTpCodes.map((code) => {
                  const tp = tpByCode.get(code)
                  return (
                    <span key={code} className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800" title={tp?.statement || code}>
                      <span className="font-semibold">{code}</span>
                      {tp?.statement ? <span className="text-indigo-600/80"> · {tp.statement.slice(0, 48)}{tp.statement.length > 48 ? '…' : ''}</span> : null}
                    </span>
                  )
                })}
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
            <Field label="Bobot">
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
          <div className="flex justify-between gap-2 pt-2">
            <div>
              {(editor.id || items.some((t) => t.code === editor.code)) && (
                <button type="button" onClick={() => deleteTp(editor)} disabled={saving || deletingId === editor.code}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-100 hover:bg-red-50 disabled:opacity-50">
                  {deletingId === editor.code ? 'Menghapus...' : 'Hapus TP'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditor(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600">Batal</button>
              <button type="button" onClick={saveTp} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </Modal>
      )}

      {materialEditor && (
        <Modal title={materialEditor.id ? 'Edit materi' : 'Tambah materi buku'} onClose={() => { setMaterialEditor(null); setTpPickerQuery('') }} size="lg">
          <Field label="Mapel">
            <select value={materialEditor.subjectKey} onChange={(e) => setMaterialEditor({ ...materialEditor, subjectKey: e.target.value as SubjectKey })} className="field">
              {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Judul">
            <input value={materialEditor.title} onChange={(e) => setMaterialEditor({ ...materialEditor, title: e.target.value })} className="field" />
          </Field>
          <Field label="Ringkasan">
            <textarea value={materialEditor.summary} onChange={(e) => setMaterialEditor({ ...materialEditor, summary: e.target.value })} rows={5} className="field" />
          </Field>
          <Field label="TP terkait">
            <input value={tpPickerQuery} onChange={(e) => setTpPickerQuery(e.target.value)} placeholder="Filter TP" className="field mb-2" />
            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y">
              {tpOptionsForMaterial.map((t) => {
                const checked = (materialEditor.suggestedTpCodes || []).includes(t.code)
                return (
                  <label key={t.code} className={`flex gap-2 px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-indigo-50/60' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTpCode(t.code)} className="mt-1 rounded text-indigo-600" />
                    <span><span className="font-semibold text-indigo-700">{t.code}</span> — {t.statement}</span>
                  </label>
                )
              })}
            </div>
          </Field>
          <div className="flex justify-between gap-2 pt-2">
            <div>
              {materialEditor.id && (
                <button type="button" onClick={() => deleteMaterial(materialEditor)} disabled={saving || deletingId === materialEditor.id}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-100 hover:bg-red-50 disabled:opacity-50">
                  {deletingId === materialEditor.id ? 'Menghapus...' : 'Hapus materi'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setMaterialEditor(null); setTpPickerQuery('') }} className="px-4 py-2 rounded-xl text-sm text-gray-600">Batal</button>
              <button type="button" onClick={saveMaterial} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </Modal>
      )}
      <style>{`.field{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-size:14px;background:white}`}</style>
    </Layout>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-600'}`}>
      {label}
    </button>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm font-medium ${active ? 'bg-slate-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
      {label}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">{text}</div>
  )
}

function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const width = size === 'xl' ? 'sm:max-w-3xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className={`bg-white w-full ${width} sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[94vh] flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">Tutup</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3 flex-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
