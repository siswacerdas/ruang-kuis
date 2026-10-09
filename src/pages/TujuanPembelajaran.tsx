import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import * as XLSX from 'xlsx'
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


function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
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
    // Kumpulkan per elemen resmi (CP pemerintah), bukan hanya baris bersebelahan.
    // Nama elemen TIDAK diubah — hanya digabung agar header elemen tidak terpecah.
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
      g.rows.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    })
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
    const code = editor.code.trim()
    if (!code || !editor.statement.trim()) { setError('Kode dan rumusan wajib.'); return }

    const existing = items.find((t) => t.code === code)
    const isEditSameDoc = !!editor.id && (editor.id === code || editor.code === code)
    if (existing && !isEditSameDoc) {
      const el = (existing.element || '').trim() || '—'
      setError(
        `Kode "${code}" sudah dipakai TP lain (elemen: ${el}). ` +
          `Pakai kode unik; elemen CP pemerintah diisi di field Elemen, bukan diganti lewat kode yang sama.`,
      )
      return
    }

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


  const exportBundle = () => {
    const tps = tab === 'tp'
      ? (selectedTpCodes.length ? items.filter((t) => selectedTpCodes.includes(t.code)) : filteredTp)
      : items.filter((t) => {
          const mats = selectedMaterialIds.length
            ? materials.filter((m) => m.id && selectedMaterialIds.includes(m.id))
            : filteredMaterials
          const codes = new Set(mats.flatMap((m) => m.suggestedTpCodes || []))
          return codes.has(t.code)
        })
    const mats = tab === 'materi'
      ? (selectedMaterialIds.length
          ? materials.filter((m) => m.id && selectedMaterialIds.includes(m.id))
          : filteredMaterials)
      : materials.filter((m) => (m.suggestedTpCodes || []).some((c) => tps.some((t) => t.code === c)))
    return { tps, mats }
  }

  const exportJson = () => {
    const { tps, mats } = exportBundle()
    if (!tps.length && !mats.length) {
      setError('Tidak ada data untuk diekspor. Ubah filter atau centang baris.')
      return
    }
    setError('')
    const payload: TpSeedFile = {
      version: `export-${stamp()}`,
      className: tps[0]?.className || '5A',
      phase: tps[0]?.phase || 'C',
      tp: tps.map((t) => ({
        code: t.code,
        subjectKey: t.subjectKey,
        element: t.element || '',
        order: Number(t.order) || 0,
        statement: t.statement,
        weight: Number(t.weight) || 1,
        active: t.active !== false,
        className: t.className || '5A',
        phase: t.phase || 'C',
        source: t.source,
      })),
      materiBuku: mats.map((m) => ({
        subjectKey: m.subjectKey,
        title: m.title,
        summary: m.summary || '',
        suggestedTpCodes: m.suggestedTpCodes || [],
        linkNote: m.linkNote || '',
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(`tujuan-pembelajaran-${stamp()}.json`, blob)
    setNotice(`Ekspor JSON: ${tps.length} TP dan ${mats.length} materi. File ini bisa diimpor ulang.`)
  }

  const exportExcel = () => {
    const { tps, mats } = exportBundle()
    if (!tps.length && !mats.length) {
      setError('Tidak ada data untuk diekspor. Ubah filter atau centang baris.')
      return
    }
    setError('')
    const tpRows = tps.map((t) => ({
      Kode: t.code,
      Mapel: getSubject(t.subjectKey)?.name || t.subjectKey,
      'Kunci mapel': t.subjectKey,
      Elemen: t.element || '',
      Urutan: Number(t.order) || 0,
      Rumusan: t.statement,
      Bobot: Number(t.weight) || 1,
      Aktif: t.active === false ? 'tidak' : 'ya',
      Kelas: t.className || '5A',
      Fase: t.phase || 'C',
      'Materi terkait': (t.relatedMaterials || []).join('; '),
    }))
    const matRows = mats.map((m) => ({
      Judul: m.title,
      Mapel: getSubject(m.subjectKey)?.name || m.subjectKey,
      'Kunci mapel': m.subjectKey,
      Ringkasan: m.summary || '',
      'Kode TP': (m.suggestedTpCodes || []).join(', '),
      Catatan: m.linkNote || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tpRows.length ? tpRows : [{ Kode: '' }]), 'Tujuan Pembelajaran')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matRows.length ? matRows : [{ Judul: '' }]), 'Materi Buku')
    XLSX.writeFile(wb, `tujuan-pembelajaran-${stamp()}.xlsx`)
    setNotice(`Ekspor Excel: ${tps.length} TP dan ${mats.length} materi.`)
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
          <button type="button" onClick={exportJson} disabled={loading}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-60">Ekspor JSON</button>
          <button type="button" onClick={exportExcel} disabled={loading}
            className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-medium text-indigo-700 disabled:opacity-60">Ekspor Excel</button>
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
            label={tab === 'tp' ? `Semua (${items.length} TP)` : `Semua (${materials.length} materi)`}
          />
          {SUBJECTS.map((s) => (
            <FilterChip
              key={s.key}
              active={subjectFilter === s.key}
              onClick={() => setSubjectFilter(s.key)}
              label={tab === 'tp' ? `${s.shortName} (${tpCountBySubject[s.key] || 0} TP)` : `${s.shortName} (${materialCountBySubject[s.key] || 0} materi)`}
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
          className="ml-auto w-full sm:w-72 rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Memuat…</p>
      ) : tab === 'tp' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allVisibleTpSelected} onChange={(e) => {
                if (e.target.checked) setSelectedTpCodes(filteredTp.map((t) => t.code))
                else setSelectedTpCodes([])
              }} className="rounded border-gray-300 text-indigo-600" />
              Pilih semua yang tampil ({filteredTp.length})
            </label>
            <span className="text-xs text-gray-400">{selectedTpCodes.length ? `${selectedTpCodes.length} dipilih` : ''}</span>
            <div className="ml-auto flex gap-2">
              <button type="button" disabled={bulkBusy || !selectedTpCodes.length} onClick={deleteSelectedTp}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40">Hapus terpilih</button>
              <button type="button" disabled={bulkBusy || !filteredTp.length} onClick={deleteAllFilteredTp}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-800 border border-red-300 hover:bg-red-50 disabled:opacity-40">Hapus semua yang tampil</button>
            </div>
          </div>
          {groupedTp.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada TP{subjectFilter !== 'semua' ? ' untuk filter ini' : ''}.</p>
          ) : (
            <div className="space-y-4">
              {groupedTp.map((group, gi) => (
                <section key={`${group.subjectKey}__${group.element}__${gi}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-700">{getSubject(group.subjectKey)?.shortName || group.subjectKey}</span>
                    <span className="text-sm font-medium text-gray-800">{group.element}</span>
                    <span className="text-xs text-gray-400 ml-auto">{group.rows.length} TP</span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {group.rows.map((row) => (
                      <li key={row.code} className="px-4 py-3 flex flex-wrap gap-3 items-start">
                        <input type="checkbox" className="mt-1" checked={selectedTpCodes.includes(row.code)}
                          onChange={(e) => setSelectedTpCodes((p) => e.target.checked ? [...p, row.code] : p.filter((c) => c !== row.code))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-indigo-600">{row.code}</span>
                            <span className="text-[11px] text-gray-400">#{row.order}</span>
                            {row.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">nonaktif</span>}
                          </div>
                          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{row.statement}</p>
                          {(row.relatedMaterials || []).length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">Materi: {(row.relatedMaterials || []).join(', ')}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={() => setEditor({ ...row })} className="text-xs font-medium text-indigo-600">Edit</button>
                          <button type="button" onClick={() => deleteTp(row)} disabled={deletingId === row.code}
                            className="text-xs font-medium text-red-600 disabled:opacity-50">Hapus</button>
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
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allVisibleMatSelected} onChange={(e) => {
                if (e.target.checked) setSelectedMaterialIds(filteredMaterials.map((m) => m.id!).filter(Boolean))
                else setSelectedMaterialIds([])
              }} className="rounded border-gray-300 text-indigo-600" />
              Pilih semua yang tampil ({filteredMaterials.length})
            </label>
            <div className="ml-auto flex gap-2">
              <button type="button" disabled={bulkBusy || !selectedMaterialIds.length} onClick={deleteSelectedMaterials}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40">Hapus terpilih</button>
              <button type="button" disabled={bulkBusy || !filteredMaterials.length} onClick={deleteAllFilteredMaterials}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-800 border border-red-300 hover:bg-red-50 disabled:opacity-40">Hapus semua yang tampil</button>
            </div>
          </div>
          {filteredMaterials.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada materi buku.</p>
          ) : (
            <div className="space-y-3">
              {filteredMaterials.map((m) => (
                <article key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex gap-3">
                    <input type="checkbox" className="mt-1" checked={!!m.id && selectedMaterialIds.includes(m.id)}
                      onChange={(e) => m.id && setSelectedMaterialIds((p) => e.target.checked ? [...p, m.id!] : p.filter((id) => id !== m.id))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-indigo-700">{getSubject(m.subjectKey)?.shortName}</span>
                        <h3 className="text-sm font-semibold text-gray-900">{m.title}</h3>
                      </div>
                      <SummaryBlock text={m.summary} className="mt-2" />
                      {(m.suggestedTpCodes || []).length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">TP: {(m.suggestedTpCodes || []).join(', ')}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => { setMaterialEditor({ ...m }); setTpPickerQuery('') }} className="text-xs font-medium text-indigo-600">Edit</button>
                      <button type="button" onClick={() => deleteMaterial(m)} disabled={deletingId === m.id}
                        className="text-xs font-medium text-red-600 disabled:opacity-50">Hapus</button>
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
              <input value={editor.code} disabled={!!editor.id} onChange={(e) => setEditor({ ...editor, code: e.target.value.toUpperCase() })} className="field" placeholder="Unik, mis. ISL-QH.1" />
            </Field>
            <Field label="Mapel">
              <select value={editor.subjectKey} onChange={(e) => setEditor({ ...editor, subjectKey: e.target.value as SubjectKey })} className="field">
                {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Elemen / tema">
              <input value={editor.element} onChange={(e) => setEditor({ ...editor, element: e.target.value })} className="field" placeholder="Sesuai CP, mis. Al-Qur'an dan Hadis" />
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
            <textarea value={editor.statement} onChange={(e) => setEditor({ ...editor, statement: e.target.value })} rows={4} className="field" placeholder="Rumusan tujuan pembelajaran…" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100 mt-1">
            <div>
              {(editor.id || items.some((t) => t.code === editor.code)) && (
                <button type="button" onClick={() => deleteTp(editor)} disabled={saving || deletingId === editor.code}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-100 hover:bg-red-50 disabled:opacity-50">
                  {deletingId === editor.code ? 'Menghapus…' : 'Hapus TP'}
                </button>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setEditor(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Batal</button>
              <button type="button" onClick={saveTp} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </div>
        </Modal>
      )}

      {materialEditor && (
        <Modal title={materialEditor.id ? 'Edit materi buku' : 'Tambah materi buku'} onClose={() => { setMaterialEditor(null); setTpPickerQuery('') }} size="lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mapel">
              <select value={materialEditor.subjectKey} onChange={(e) => setMaterialEditor({ ...materialEditor, subjectKey: e.target.value as SubjectKey })} className="field">
                {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Judul">
              <input value={materialEditor.title} onChange={(e) => setMaterialEditor({ ...materialEditor, title: e.target.value })} className="field" placeholder="Judul materi buku" />
            </Field>
          </div>
          <Field label="Ringkasan">
            <textarea value={materialEditor.summary} onChange={(e) => setMaterialEditor({ ...materialEditor, summary: e.target.value })} rows={5} className="field" placeholder="Ringkasan / poin utama materi…" />
          </Field>
          <Field label="Catatan tautan (opsional)">
            <input value={materialEditor.linkNote || ''} onChange={(e) => setMaterialEditor({ ...materialEditor, linkNote: e.target.value })} className="field" placeholder="Catatan atau tautan buku" />
          </Field>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Kaitkan TP</p>
            <input value={tpPickerQuery} onChange={(e) => setTpPickerQuery(e.target.value)} placeholder="Cari kode / rumusan / elemen…" className="field mb-2" />
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {tpOptionsForMaterial.map((t) => {
                const checked = (materialEditor.suggestedTpCodes || []).includes(t.code)
                return (
                  <label key={t.code} className={`flex items-start gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 ${checked ? 'bg-indigo-50/70' : ''}`}>
                    <input type="checkbox" className="mt-1 rounded border-gray-300 text-indigo-600" checked={checked} onChange={() => toggleTpCode(t.code)} />
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-indigo-700">{t.code}</span>
                      {t.element ? <span className="text-[11px] text-gray-400 ml-1.5">{t.element}</span> : null}
                      <span className="block text-gray-700 mt-0.5 leading-snug">{t.statement}</span>
                    </span>
                  </label>
                )
              })}
              {tpOptionsForMaterial.length === 0 && (
                <p className="px-3 py-3 text-sm text-gray-400">Tidak ada TP untuk mapel ini.</p>
              )}
            </div>
            {(materialEditor.suggestedTpCodes || []).length > 0 && (
              <p className="mt-2 text-xs text-gray-500">Terpilih: {(materialEditor.suggestedTpCodes || []).join(', ')}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-gray-100 mt-1">
            <button type="button" onClick={() => { setMaterialEditor(null); setTpPickerQuery('') }} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Batal</button>
            <button type="button" onClick={saveMaterial} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </Modal>
      )}

      <style>{`.field{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-size:14px;background:white;outline:none}.field:focus{border-color:#a5b4fc;box-shadow:0 0 0 3px rgba(99,102,241,.15)}.field:disabled{background:#f9fafb;color:#6b7280}`}</style>
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

function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const width = size === 'xl' ? 'sm:max-w-3xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40" onClick={onClose}>
      <div className={`bg-white w-full ${width} sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[94vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700 px-1">Tutup</button>
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
