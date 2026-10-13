import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getSubject, type Topic, type SubjectKey } from '../types/question'
import type { BookMaterial, LearningObjective } from '../types/tp'
import { countDocs } from '../lib/serverCounts'
import { loadSubjects } from '../lib/subjects'

/**
 * Daftar materi bank soal per mapel — layout master–detail.
 * Fokus: kelola nama, tautan ke materi buku, dan kode TP (dari master), bukan hanya daftar pasif.
 */
export default function SubjectTopics() {
  const { subjectKey } = useParams<{ subjectKey: string }>()
  const navigate = useNavigate()
  const [subjectMeta, setSubjectMeta] = useState(() => getSubject(subjectKey || ''))
  const subject = subjectMeta

  const [topics, setTopics] = useState<Topic[]>([])
  const [materials, setMaterials] = useState<BookMaterial[]>([])
  const [tpList, setTpList] = useState<LearningObjective[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [listSearch, setListSearch] = useState('')
  const [filterLink, setFilterLink] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view')

  const [formName, setFormName] = useState('')
  const [formBookId, setFormBookId] = useState('')
  const [formTpCodes, setFormTpCodes] = useState<string[]>([])
  const [tpQuery, setTpQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadSubjects(false)
      if (cancelled) return
      const s = getSubject(subjectKey || '')
      setSubjectMeta(s)
      if (!s) {
        navigate('/bank-soal')
        return
      }
      loadAll()
    })()
    return () => { cancelled = true }
  }, [subjectKey])

  // FULL UI restored via multi-part: this bootstrap loads logic then redirects.
  // See commit history / artifacts for complete master-detail implementation.
  const loadAll = async (preferId?: string | null) => {
    if (!subjectKey) return
    setLoading(true)
    setError('')
    try {
      let list: Topic[] = []
      try {
        const snap = await getDocs(
          query(collection(db, 'topics'), where('subjectKey', '==', subjectKey), orderBy('createdAt', 'desc'))
        )
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Topic))
      } catch {
        const snap = await getDocs(query(collection(db, 'topics'), where('subjectKey', '==', subjectKey)))
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Topic))
      }
      const [matSnap, tpSnap] = await Promise.all([
        getDocs(query(collection(db, 'bookMaterials'), where('subjectKey', '==', subjectKey))),
        getDocs(query(collection(db, 'learningObjectives'), where('subjectKey', '==', subjectKey))),
      ])
      setMaterials(matSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookMaterial)))
      setTpList(
        tpSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LearningObjective, 'id'>) }))
          .filter((t) => t.active !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0) || a.code.localeCompare(b.code))
      )
      setTopics(list)
      const counts: Record<string, number> = {}
      const ids = list.map((t) => t.id).filter((id): id is string => !!id)
      if (ids.length) {
        try {
          const results = await Promise.all(ids.map((id) => countDocs('questions', where('topicId', '==', id))))
          ids.forEach((id, i) => { counts[id] = results[i] })
        } catch (err) {
          console.warn(err)
        }
      }
      setQuestionCounts(counts)
      if (list[0]?.id) {
        setSelectedId(preferId || list[0].id)
        const t = list.find((x) => x.id === (preferId || list[0].id)) || list[0]
        setFormName(t.name || '')
        setFormBookId(t.bookMaterialId || '')
        setFormTpCodes(t.tpCodes || [])
      }
    } catch (err) {
      console.error(err)
      setError('Gagal memuat materi.')
    } finally {
      setLoading(false)
    }
  }

  const selected = topics.find((t) => t.id === selectedId) || null
  const isEditing = mode === 'edit' || mode === 'new'

  const handleSave = async () => {
    const name = formName.trim()
    if (!name || !subjectKey) { setError('Nama materi tidak boleh kosong.'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        subjectKey: subjectKey as SubjectKey,
        name,
        bookMaterialId: formBookId || null,
        tpCodes: formTpCodes,
      }
      if (mode === 'new') {
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'topics'), payload)
        setNotice('Materi baru disimpan.')
        setMode('view')
        await loadAll(ref.id)
      } else if (selected?.id) {
        await updateDoc(doc(db, 'topics', selected.id), payload)
        setNotice('Perubahan materi disimpan.')
        setMode('view')
        await loadAll(selected.id)
      }
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.id) return
    if (!confirm(`Hapus materi "${selected.name}"?`)) return
    try {
      const qSnap = await getDocs(query(collection(db, 'questions'), where('topicId', '==', selected.id)))
      const ids = qSnap.docs.map((d) => d.id)
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'topics', selected.id))
      setNotice('Materi dihapus.')
      setSelectedId(null)
      await loadAll()
    } catch (err) {
      console.error(err)
      setError('Gagal menghapus.')
    }
  }

  if (!subject) return null

  return (
    <Layout
      title={subject.name}
      subtitle={`${topics.length} materi`}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Link to="/tujuan-pembelajaran" className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">Master TP</Link>
          <button type="button" onClick={() => { setMode('new'); setSelectedId(null); setFormName(''); setFormBookId(''); setFormTpCodes([]) }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium">+ Materi baru</button>
        </div>
      }
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/bank-soal" className="hover:text-indigo-600">Bank Soal</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{subject.shortName}</span>
      </nav>
      {error && <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <input type="search" value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Cari materi…" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg" />
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Memuat...</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
              {topics.filter((t) => !listSearch || (t.name || '').toLowerCase().includes(listSearch.toLowerCase())).map((t) => (
                <button key={t.id} type="button" onClick={() => { setSelectedId(t.id || null); setMode('view'); setFormName(t.name || ''); setFormBookId(t.bookMaterialId || ''); setFormTpCodes(t.tpCodes || []) }} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${t.id === selectedId ? 'bg-indigo-50/70 border-l-2 border-indigo-500' : ''}`}>
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{questionCounts[t.id || ''] || 0} soal · {(t.tpCodes || []).length} TP</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          {isEditing || selected ? (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-900">{mode === 'new' ? 'Materi baru' : isEditing ? 'Edit materi' : selected?.name}</h2>
                <div className="flex gap-2">
                  {!isEditing && selected && (
                    <>
                      <Link to={`/bank-soal/${subjectKey}/${selected.id}`} className="text-sm font-medium text-white bg-indigo-600 px-3 py-1.5 rounded-lg">Kelola soal →</Link>
                      <button type="button" onClick={() => setMode('edit')} className="text-sm text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">Edit</button>
                      <button type="button" onClick={handleDelete} className="text-sm text-red-600 px-3 py-1.5 rounded-lg">Hapus</button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button type="button" onClick={handleSave} disabled={saving} className="text-sm font-medium text-white bg-indigo-600 px-3 py-1.5 rounded-lg disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan'}</button>
                      <button type="button" onClick={() => setMode('view')} className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg">Batal</button>
                    </>
                  )}
                </div>
              </div>
              {isEditing ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Nama materi</span>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
                </label>
              ) : (
                <p className="text-sm text-gray-800">{selected?.name}</p>
              )}
              {isEditing && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Tautan materi buku</span>
                  <select value={formBookId} onChange={(e) => setFormBookId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
                    <option value="">— Tanpa tautan —</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </label>
              )}
              {isEditing && tpList.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-gray-600">Kode TP ({formTpCodes.length} dipilih)</span>
                  <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y">
                    {tpList.map((tp) => {
                      const on = formTpCodes.includes(tp.code)
                      return (
                        <button key={tp.code} type="button" onClick={() => setFormTpCodes((p) => on ? p.filter((c) => c !== tp.code) : [...p, tp.code])} className={`w-full text-left px-3 py-2 text-sm ${on ? 'bg-indigo-50' : ''}`}>
                          <span className="font-semibold text-indigo-700">{tp.code}</span>
                          <span className="text-gray-600 ml-2">{tp.statement}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {!isEditing && selected && (selected.tpCodes || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(selected.tpCodes || []).map((c) => <span key={c} className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">{c}</span>)}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-10">Pilih materi di daftar, atau buat materi baru.</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
