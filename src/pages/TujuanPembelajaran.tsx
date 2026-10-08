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
          .sort(
          (a, b) =>
            a.subjectKey.localeCompare(b.subjectKey) ||
            (a.element || '').localeCompare(b.element || '', 'id') ||
            a.order - b.order ||
            a.code.localeCompare(b.code),
        ),
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
    // Group by subject + element (Map), bukan adjacency setelah sort,
    // agar elemen yang sama tidak terpecah saat order antar-elemen saling silang.
    const map = new Map<string, { subjectKey: string; element: string; rows: LearningObjective[] }>()
    const orderKeys: string[] = []
    filteredTp.forEach((row) => {
      const element = (row.element || '').trim() || 'Umum'
      const key = `${row.subjectKey}\0${element}`
      let g = map.get(key)
      if (!g) {
        g = { subjectKey: row.subjectKey, element, rows: [] }
        map.set(key, g)
        orderKeys.push(key)
      }
      g.rows.push(row)
    })
    orderKeys.forEach((k) => {
      const g = map.get(k)!
      g.rows.sort(
        (a, b) => a.order - b.order || a.code.localeCompare(b.code),
      )
    })
    // Urutkan grup: subject lalu nama elemen
    return orderKeys
      .map((k) => map.get(k)!)
      .sort(
        (a, b) =>
          a.subjectKey.localeCompare(b.subjectKey) ||
          a.element.localeCompare(b.element, 'id'),
      )
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
    const code = editor.code.trim().toUpperCase()
    if (!code || !editor.statement.trim()) { setError('Kode dan rumusan wajib.'); return }

    // Doc ID = code. Kode ganda menimpa TP lain (sering terjadi di Al-Islam
    // saat nomor urut/kode mirip antar elemen). Tolak overwrite silang.
    const existing = items.find((t) => t.code === code)
    const isEditSameDoc = !!editor.id && (editor.id === code || editor.code === code)
    if (existing && !isEditSameDoc) {
      const el = (existing.element || '').trim() || '—'
      setError(
        `Kode "${code}" sudah dipakai TP lain (elemen: ${el}). ` +
          `Ganti kode unik — doc Firestore di-key oleh kode, bukan nomor urut.`,
      )
      return
    }

    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, 'learningObjectives', code), {
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

      <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">
          {tab === 'tp' ? 'Filter mapel · angka = jumlah TP' : 'Filter mapel · angka = jumlah materi buku'}
        </p>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={subjectFilter === 'semua'}
            onClick={() => setSubjectFilter('semua')}
            label={
              tab === 'tp'
                ? `Semua (${items.length} TP)`
                : `Semua (${materials.length} materi)`
            }
          />
          {SUBJECTS.map((s) => (
            <FilterChip
              key={s.key}
              active={subjectFilter === s.key}
              onClick={() => setSubjectFilter(s.key)}
              label={
                tab === 'tp'
                  ? `${s.shortName} (${tpCountBySubject[s.key] || 0} TP)`
                  : `${s.shortName} (${materialCountBySubject[s.key] || 0} materi)`
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TabButton active={tab === 'tp'} onClick={() => setTab('tp')}>Tujuan Pembelajaran</TabButton>
        <TabButton active={tab === 'materi'} onClick={() => setTab('materi')}>Materi Buku</TabButton>
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder={tab === 'tp' ? 'Cari kode / rumusan / elemen…' : 'Cari judul / ringkasan / kode TP…'}
          className="ml-auto min-w-[200px] flex-1 max-w-sm rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : tab === 'tp' ? (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={deleteSelectedTp} disabled={bulkBusy || !selectedTpCodes.length}
              className="px-3 py-1.5 rounded-lg text-sm border border-red-100 text-red-600 disabled:opacity-40">Hapus terpilih</button>
            <button type="button" onClick={deleteAllFilteredTp} disabled={bulkBusy || !filteredTp.length}
              className="px-3 py-1.5 rounded-lg text-sm border border-red-100 text-red-600 disabled:opacity-40">Hapus semua yang tampil</button>
            <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
              <input type="checkbox" checked={allVisibleTpSelected} onChange={(e) => {
                if (e.target.checked) setSelectedTpCodes(filteredTp.map((t) => t.code))
                else setSelectedTpCodes([])
              }} />
              Pilih semua tampilan
            </label>
          </div>
          {groupedTp.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada TP.</p>
          ) : (
            <div className="space-y-4">
              {groupedTp.map((group, gi) => (
              <section key={`${group.subjectKey}__${group.element}__${gi}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/80 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">{getSubject(group.subjectKey)?.name || group.subjectKey}</p>
                    <h3 className="text-sm font-semibold text-gray-900">{group.element}</h3>
                  </div>
                  <span className="text-xs text-gray-400">{group.rows.length} TP</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {group.rows.map((row) => (
                    <li key={row.code} className="px-4 py-3 flex flex-wrap items-start gap-3">
                      <input type="checkbox" className="mt-1" checked={selectedTpCodes.includes(row.code)}
                        onChange={(e) => setSelectedTpCodes((p) => e.target.checked ? [...p, row.code] : p.filter((c) => c !== row.code))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{row.code}</span>
                          <span className="text-[11px] text-gray-400">urut {row.order}</span>
                          {row.active === false && <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">nonaktif</span>}
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{row.statement}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => setEditor(row)} className="text-sm font-medium text-indigo-600">Edit</button>
                        <button type="button" onClick={() => deleteTp(row)} disabled={deletingId === row.code}
                          className="text-sm font-medium text-red-600 disabled:opacity-50">Hapus</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={deleteSelectedMaterials} disabled={bulkBusy || !selectedMaterialIds.length}
              className="px-3 py-1.5 rounded-lg text-sm border border-red-100 text-red-600 disabled:opacity-40">Hapus terpilih</button>
            <button type="button" onClick={deleteAllFilteredMaterials} disabled={bulkBusy || !filteredMaterials.length}
              className="px-3 py-1.5 rounded-lg text-sm border border-red-100 text-red-600 disabled:opacity-40">Hapus semua yang tampil</button>
            <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
              <input type="checkbox" checked={allVisibleMatSelected} onChange={(e) => {
                if (e.target.checked) setSelectedMaterialIds(filteredMaterials.map((m) => m.id!).filter(Boolean))
                else setSelectedMaterialIds([])
              }} />
              Pilih semua tampilan
            </label>
          </div>
          {filteredMaterials.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada materi buku.</p>
          ) : (
            <div className="space-y-3">
              {filteredMaterials.map((m) => (
                <article key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1" checked={!!m.id && selectedMaterialIds.includes(m.id)}
                      onChange={(e) => m.id && setSelectedMaterialIds((p) => e.target.checked ? [...p, m.id!] : p.filter((id) => id !== m.id))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">{getSubject(m.subjectKey)?.name || m.subjectKey}</p>
                      <h3 className="text-sm font-semibold text-gray-900">{m.title}</h3>
                      <SummaryBlock text={m.summary} className="mt-2" />
                      {(m.suggestedTpCodes || []).length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">TP: {(m.suggestedTpCodes || []).join(', ')}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => setMaterialEditor({ ...m })} className="text-sm font-medium text-indigo-600">Edit</button>
                      <button type="button" onClick={() => deleteMaterial(m)} disabled={deletingId === m.id}
                        className="text-sm font-medium text-red-600 disabled:opacity-50">Hapus</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {editor && (
        <Modal title={editor.id ? `Edit ${editor.code}` : 'Tambah TP'} onClose={() => setEditor(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Kode">
              <input value={editor.code} disabled={!!editor.id} onChange={(e) => setEditor({ ...editor, code: e.target.value.toUpperCase() })} className="field" placeholder="Unik global, mis. AI-QH-01" />
              {!editor.id && editor.code.trim() && items.some((t) => t.code === editor.code.trim().toUpperCase()) && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                  Kode ini sudah dipakai TP lain. Menyimpan akan ditolak — pilih kode unik (disarankan sertakan singkatan elemen).
                </p>
              )}
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
          <Field label="Catatan tautan (opsional)">
            <input value={materialEditor.linkNote || ''} onChange={(e) => setMaterialEditor({ ...materialEditor, linkNote: e.target.value })} className="field" />
          </Field>
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Kaitkan TP</p>
            <input value={tpPickerQuery} onChange={(e) => setTpPickerQuery(e.target.value)} placeholder="Cari TP…" className="field mb-2" />
            <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {tpOptionsForMaterial.map((t) => (
                <label key={t.code} className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" className="mt-1" checked={(materialEditor.suggestedTpCodes || []).includes(t.code)} onChange={() => toggleTpCode(t.code)} />
                  <span><span className="font-mono text-xs text-indigo-600">{t.code}</span> — {t.statement}</span>
                </label>
              ))}
              {tpOptionsForMaterial.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Tidak ada TP mapel ini.</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={() => { setMaterialEditor(null); setTpPickerQuery('') }} className="px-4 py-2 rounded-xl text-sm text-gray-600">Batal</button>
            <button type="button" onClick={saveMaterial} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
      {children}
    </button>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
      {label}
    </button>
  )
}

function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
