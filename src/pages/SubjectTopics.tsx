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

/**
 * Daftar materi bank soal per mapel — layout master–detail.
 * Fokus: kelola nama, tautan ke materi buku, dan kode TP (dari master), bukan hanya daftar pasif.
 */
export default function SubjectTopics() {
  const { subjectKey } = useParams<{ subjectKey: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')

  const [topics, setTopics] = useState<Topic[]>([])
  const [materials, setMaterials] = useState<BookMaterial[]>([])
  const [tpList, setTpList] = useState<LearningObjective[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // UI state
  const [listSearch, setListSearch] = useState('')
  const [filterLink, setFilterLink] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view')

  // Form edit / baru
  const [formName, setFormName] = useState('')
  const [formBookId, setFormBookId] = useState('')
  const [formTpCodes, setFormTpCodes] = useState<string[]>([])
  const [tpQuery, setTpQuery] = useState('')

  useEffect(() => {
    if (!subject) {
      navigate('/bank-soal')
      return
    }
    loadAll()
  }, [subjectKey])

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
      const mats: BookMaterial[] = matSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookMaterial))
      setMaterials(mats)

      const tps: LearningObjective[] = tpSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LearningObjective, 'id'>) }))
        .filter((t) => t.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.code.localeCompare(b.code))
      setTpList(tps)

      // Auto-link & pastikan materi buku yang belum ada ikut tercipta (perilaku lama, non-destruktif)
      const linked = await autoLink(list, mats)
      const withMissing = await ensureTopics(subjectKey, linked, mats)
      setTopics(withMissing)

      const counts: Record<string, number> = {}
      if (withMissing.length > 0) {
        try {
          // Hitung per materi di server (tanpa mengunduh soal beserta gambarnya)
          const ids = withMissing.map((t) => t.id).filter((id): id is string => !!id)
          const results = await Promise.all(
            ids.map((id) => countDocs('questions', where('topicId', '==', id)))
          )
          ids.forEach((id, i) => {
            counts[id] = results[i]
          })
        } catch (err) {
          // Cadangan: cara lama (baca semua soal mapel ini)
          console.warn('questionCounts fallback', err)
          const qSnap = await getDocs(
            query(collection(db, 'questions'), where('subjectKey', '==', subjectKey))
          )
          qSnap.docs.forEach((d) => {
            const tid = d.data().topicId as string
            counts[tid] = (counts[tid] || 0) + 1
          })
        }
      }
      setQuestionCounts(counts)

      // Pertahankan seleksi
      const keepId = preferId || selectedId
      if (keepId && withMissing.some((t) => t.id === keepId)) {
        setSelectedId(keepId)
        if (mode !== 'new') {
          const t = withMissing.find((x) => x.id === keepId)!
          fillFormFromTopic(t, mats)
          setMode('view')
        }
      } else if (withMissing.length > 0) {
        const first = withMissing[0]
        setSelectedId(first.id || null)
        fillFormFromTopic(first, mats)
        setMode('view')
      } else {
        setSelectedId(null)
        setMode('view')
        resetForm()
      }
    } catch (err) {
      console.error(err)
      setError('Gagal memuat materi.')
    } finally {
      setLoading(false)
    }
  }

  const fillFormFromTopic = (t: Topic, mats: BookMaterial[] = materials) => {
    setFormName(t.name || '')
    setFormBookId(t.bookMaterialId || '')
    const fromTopic = t.tpCodes || []
    const fromBook = mats.find((m) => m.id === t.bookMaterialId)?.suggestedTpCodes || []
    setFormTpCodes(fromTopic.length ? [...fromTopic] : [...fromBook])
    setTpQuery('')
  }

  const resetForm = () => {
    setFormName('')
    setFormBookId('')
    setFormTpCodes([])
    setTpQuery('')
  }

  const selected = topics.find((t) => t.id === selectedId) || null
  const selectedBook = materials.find((m) => m.id === (mode === 'edit' || mode === 'new' ? formBookId : selected?.bookMaterialId))

  const filteredTopics = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    return topics.filter((t) => {
      if (filterLink === 'linked' && !t.bookMaterialId) return false
      if (filterLink === 'unlinked' && t.bookMaterialId) return false
      if (!q) return true
      const bookTitle = materials.find((m) => m.id === t.bookMaterialId)?.title || ''
      const codes = (t.tpCodes || []).join(' ')
      return [t.name, bookTitle, codes].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [topics, materials, listSearch, filterLink])

  const linkedCount = topics.filter((t) => t.bookMaterialId).length
  const withTpCount = topics.filter((t) => (t.tpCodes || []).length > 0).length

  // TP yang bisa dipilih (filter pencarian di panel)
  const selectableTp = useMemo(() => {
    const q = tpQuery.trim().toLowerCase()
    if (!q) return tpList
    return tpList.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        (t.statement || '').toLowerCase().includes(q) ||
        (t.element || '').toLowerCase().includes(q)
    )
  }, [tpList, tpQuery])

  const tpByCode = useMemo(() => {
    const map = new Map<string, LearningObjective>()
    tpList.forEach((t) => map.set(t.code, t))
    return map
  }, [tpList])

  const openNew = () => {
    setMode('new')
    setSelectedId(null)
    resetForm()
    setError('')
    setNotice('')
  }

  const selectTopic = (t: Topic) => {
    setSelectedId(t.id || null)
    fillFormFromTopic(t)
    setMode('view')
    setError('')
  }

  const startEdit = () => {
    if (!selected) return
    fillFormFromTopic(selected)
    setMode('edit')
    setError('')
  }

  const cancelEdit = () => {
    if (mode === 'new') {
      setMode('view')
      if (topics[0]) {
        setSelectedId(topics[0].id || null)
        fillFormFromTopic(topics[0])
      } else {
        resetForm()
      }
    } else if (selected) {
      fillFormFromTopic(selected)
      setMode('view')
    }
    setError('')
  }

  const toggleTp = (code: string) => {
    setFormTpCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const applyBookSuggestedTp = () => {
    const book = materials.find((m) => m.id === formBookId)
    if (!book?.suggestedTpCodes?.length) {
      setNotice('Materi buku ini belum punya usulan TP.')
      return
    }
    setFormTpCodes((prev) => [...new Set([...prev, ...book.suggestedTpCodes!])])
    setNotice(`Ditambahkan ${book.suggestedTpCodes.length} kode TP dari materi buku.`)
  }

  const onBookChange = (bookId: string) => {
    setFormBookId(bookId)
    // Saat ganti tautan di mode edit/new: tawarkan salin TP usulan (tidak paksa timpa jika sudah ada)
    const book = materials.find((m) => m.id === bookId)
    if (book?.suggestedTpCodes?.length && formTpCodes.length === 0) {
      setFormTpCodes([...book.suggestedTpCodes])
    }
  }

  const handleSave = async () => {
    setError('')
    const name = formName.trim()
    if (!name) {
      setError('Nama materi tidak boleh kosong.')
      return
    }
    if (!subjectKey) return
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
      setError('Gagal menyimpan materi.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.id) return
    const count = questionCounts[selected.id] || 0
    const msg =
      count > 0
        ? `Materi "${selected.name}" memiliki ${count} soal. Hapus materi beserta semua soalnya?`
        : `Hapus materi "${selected.name}"?`
    if (!confirm(msg)) return
    try {
      const qSnap = await getDocs(query(collection(db, 'questions'), where('topicId', '==', selected.id)))
      // Batch delete soal (chunk 400)
      const ids = qSnap.docs.map((d) => d.id)
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'topics', selected.id))
      setNotice(`Materi "${selected.name}" dihapus.`)
      setSelectedId(null)
      setMode('view')
      resetForm()
      await loadAll()
    } catch (err) {
      console.error(err)
      setError('Gagal menghapus materi.')
    }
  }

  const syncFromBooks = async () => {
    if (!subjectKey) return
    setSyncing(true)
    setError('')
    try {
      const taken = new Set(topics.map((t) => t.bookMaterialId).filter(Boolean))
      const missing = materials.filter(
        (m) => m.id && !taken.has(m.id) && !topics.some((t) => sameName(t.name, m.title))
      )
      if (missing.length === 0) {
        setNotice('Semua materi buku mapel ini sudah ada di bank soal.')
        setSyncing(false)
        return
      }
      const batch = writeBatch(db)
      let lastId: string | null = null
      missing.forEach((m) => {
        const ref = doc(collection(db, 'topics'))
        batch.set(ref, {
          subjectKey,
          name: m.title,
          bookMaterialId: m.id,
          tpCodes: m.suggestedTpCodes || [],
          createdAt: serverTimestamp(),
        })
        lastId = ref.id
      })
      await batch.commit()
      setNotice(`${missing.length} materi buku disalin ke bank soal dan ditautkan. Materi lama tidak diubah.`)
      await loadAll(lastId)
    } catch (err) {
      console.error(err)
      setError('Gagal menyinkronkan materi.')
    } finally {
      setSyncing(false)
    }
  }

  if (!subject) return null

  const isEditing = mode === 'edit' || mode === 'new'
  const displayCodes = isEditing ? formTpCodes : selected?.tpCodes || []

  return (
    <Layout
      title={subject.name}
      subtitle={`${topics.length} materi · ${linkedCount} tertaut buku · ${withTpCount} punya TP`}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Link
            to="/tujuan-pembelajaran"
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Master TP & materi buku
          </Link>
          <button
            type="button"
            onClick={syncFromBooks}
            disabled={syncing || materials.length === 0}
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50"
          >
            {syncing ? 'Menyalin...' : 'Salin materi buku'}
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium"
          >
            + Materi baru
          </button>
        </div>
      }
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/bank-soal" className="hover:text-indigo-600">
          Bank Soal
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{subject.shortName}</span>
      </nav>

      {notice && (
        <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" className="text-emerald-600 shrink-0 text-xs font-medium" onClick={() => setNotice('')}>
            Tutup
          </button>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {materials.length === 0 && (
        <div className="mb-3 rounded-xl bg-amber-50 text-amber-900 text-sm px-4 py-3">
          Daftar materi buku mapel ini masih kosong. Impor dulu di{' '}
          <Link to="/tujuan-pembelajaran" className="font-semibold underline">
            Tujuan Pembelajaran
          </Link>
          , lalu gunakan “Salin materi buku”.
        </div>
      )}

      {/* Master–detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:items-stretch">
        {/* ===== LIST ===== */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[22rem] lg:h-[calc(100vh-12rem)]">
          <div className="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">Daftar materi</span>
              <span className="text-[11px] text-gray-500">{filteredTopics.length}/{topics.length}</span>
            </div>
            <div className="relative">
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Cari nama, tautan, atau kode TP…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              />
              <svg
                className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['all', 'Semua'],
                  ['linked', 'Tertaut'],
                  ['unlinked', 'Belum'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterLink(key)}
                  className={`flex-1 text-[11px] font-medium py-1 rounded-lg border transition ${
                    filterLink === key
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex-1 p-8 text-center text-sm text-gray-500">Memuat...</div>
          ) : topics.length === 0 ? (
            <div className="flex-1 p-8 text-center text-sm text-gray-500">
              Belum ada materi.
              <button type="button" onClick={openNew} className="block mx-auto mt-3 text-indigo-600 font-medium hover:underline">
                + Tambah materi pertama
              </button>
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="flex-1 p-8 text-center text-sm text-gray-500">Tidak ada yang cocok filter.</div>
          ) : (
            <div className="divide-y divide-gray-50 flex-1 min-h-0 overflow-y-auto">
              {filteredTopics.map((t) => {
                const active = t.id === selectedId && mode !== 'new'
                const count = questionCounts[t.id || ''] || 0
                const codes = t.tpCodes || []
                const linked = !!t.bookMaterialId
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTopic(t)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition border-l-2 ${
                      active ? 'bg-indigo-50/70 border-indigo-500' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{t.name}</p>
                      <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">{count} soal</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          linked ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {linked ? 'Tertaut' : 'Belum taut'}
                      </span>
                      {codes.length === 0 ? (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Tanpa TP</span>
                      ) : (
                        codes.slice(0, 3).map((c) => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {c}
                          </span>
                        ))
                      )}
                      {codes.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{codes.length - 3}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== DETAIL / EDITOR ===== */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[22rem] lg:h-[calc(100vh-12rem)]">
          {mode === 'new' || (selected && isEditing) || selected ? (
            <>
              {/* Toolbar detail */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {mode === 'new' ? 'Materi baru' : isEditing ? 'Edit materi' : selected?.name}
                  </p>
                  {!isEditing && selected && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {questionCounts[selected.id || ''] || 0} soal ·{' '}
                      {selected.bookMaterialId ? 'Tertaut materi buku' : 'Belum tertaut'} ·{' '}
                      {(selected.tpCodes || []).length} TP
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!isEditing && selected && (
                    <>
                      <Link
                        to={`/bank-soal/${subjectKey}/${selected.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg"
                      >
                        Kelola soal →
                      </Link>
                      <button
                        type="button"
                        onClick={startEdit}
                        className="text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
                      >
                        Hapus
                      </button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 py-1.5 rounded-lg"
                      >
                        {saving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                      >
                        Batal
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-6">
                {/* --- Nama --- */}
                <section>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Nama materi bank soal
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Contoh: Informasi, Ekosistem, Bilangan…"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm text-gray-900"
                      autoFocus={mode === 'new'}
                    />
                  ) : (
                    <p className="text-base font-medium text-gray-900">{selected?.name}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    Nama di bank soal boleh berbeda dari judul materi buku; yang penting tautan dan kode TP jelas.
                  </p>
                </section>

                {/* --- Tautan materi buku --- */}
                <section className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Tautan ke materi buku
                    </label>
                    {!isEditing && selectedBook && (
                      <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
                        Aktif
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <select
                        value={formBookId}
                        onChange={(e) => onBookChange(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
                      >
                        <option value="">— Tanpa tautan —</option>
                        {materials.map((m) => {
                          const usedByOther = topics.some(
                            (t) => t.bookMaterialId === m.id && t.id !== selectedId
                          )
                          return (
                            <option key={m.id} value={m.id} disabled={usedByOther}>
                              {m.title}
                              {usedByOther ? ' (sudah dipakai materi lain)' : ''}
                            </option>
                          )
                        })}
                      </select>
                      {formBookId && (
                        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 text-sm text-gray-600">
                          <p className="text-xs text-gray-400 mb-0.5">Ringkas materi buku</p>
                          <p>{materials.find((m) => m.id === formBookId)?.summary || '—'}</p>
                          {(materials.find((m) => m.id === formBookId)?.suggestedTpCodes || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-gray-400">Usulan TP:</span>
                              {(materials.find((m) => m.id === formBookId)?.suggestedTpCodes || []).map((c) => (
                                <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                                  {c}
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={applyBookSuggestedTp}
                                className="ml-1 text-[11px] font-medium text-indigo-600 hover:underline"
                              >
                                + Tambahkan ke pilihan TP
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {materials.length === 0 && (
                        <p className="text-xs text-amber-700">
                          Belum ada materi buku. Impor di Tujuan Pembelajaran terlebih dahulu.
                        </p>
                      )}
                    </div>
                  ) : selectedBook ? (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedBook.title}</p>
                      {selectedBook.summary && (
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{selectedBook.summary}</p>
                      )}
                      {(selectedBook.suggestedTpCodes || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="text-[11px] text-gray-400 self-center">Usulan dari buku:</span>
                          {selectedBook.suggestedTpCodes!.map((c) => (
                            <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Belum tertaut ke materi buku. Klik <strong>Edit</strong> untuk memilih pasangan dari database
                      materi.
                    </p>
                  )}
                </section>

                {/* --- Kode TP --- */}
                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Tujuan pembelajaran (TP) terkait
                    </label>
                    <span className="text-[11px] text-gray-400">{displayCodes.length} dipilih</span>
                  </div>

                  {/* Chip terpilih */}
                  {displayCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {displayCodes.map((code) => {
                        const meta = tpByCode.get(code)
                        return (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-100"
                            title={meta?.statement || code}
                          >
                            {code}
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => toggleTp(code)}
                                className="text-indigo-400 hover:text-red-500 ml-0.5"
                                title="Lepas"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                      Belum ada TP. Soal di materi ini akan memakai ringkasan TP kosong kecuali diisi per soal.
                    </p>
                  )}

                  {/* Daftar rumusan (view) */}
                  {!isEditing && displayCodes.length > 0 && (
                    <ul className="space-y-2 mb-1">
                      {displayCodes.map((code) => {
                        const meta = tpByCode.get(code)
                        return (
                          <li key={code} className="rounded-xl border border-gray-100 px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                                {code}
                              </span>
                              <div className="min-w-0">
                                {meta?.element && (
                                  <p className="text-[11px] text-gray-400">{meta.element}</p>
                                )}
                                <p className="text-sm text-gray-800 leading-relaxed">
                                  {meta?.statement || (
                                    <span className="text-gray-400 italic">
                                      Kode tidak ada di master TP mapel ini (mungkin diimpor manual / typo).
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {/* Picker TP (edit/new) */}
                  {isEditing && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
                        <input
                          type="search"
                          value={tpQuery}
                          onChange={(e) => setTpQuery(e.target.value)}
                          placeholder="Cari kode, elemen, atau rumusan TP…"
                          className="flex-1 min-w-[10rem] text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        {formBookId && (
                          <button
                            type="button"
                            onClick={applyBookSuggestedTp}
                            className="text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg"
                          >
                            Ambil usulan dari materi buku
                          </button>
                        )}
                      </div>
                      {tpList.length === 0 ? (
                        <p className="p-4 text-sm text-amber-800">
                          Master TP mapel ini kosong. Impor seed di{' '}
                          <Link to="/tujuan-pembelajaran" className="underline font-medium">
                            Tujuan Pembelajaran
                          </Link>
                          .
                        </p>
                      ) : selectableTp.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">Tidak ada TP yang cocok pencarian.</p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                          {selectableTp.map((tp) => {
                            const on = formTpCodes.includes(tp.code)
                            return (
                              <button
                                key={tp.code}
                                type="button"
                                onClick={() => toggleTp(tp.code)}
                                className={`w-full text-left px-3 py-2.5 flex gap-3 hover:bg-gray-50 transition ${
                                  on ? 'bg-indigo-50/60' : ''
                                }`}
                              >
                                <span
                                  className={`shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold ${
                                    on
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'border-gray-300 text-transparent'
                                  }`}
                                >
                                  ✓
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-indigo-700">{tp.code}</span>
                                    {tp.element && (
                                      <span className="text-[10px] text-gray-400">{tp.element}</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 leading-snug mt-0.5 line-clamp-2">
                                    {tp.statement}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* --- Aksi cepat (view) --- */}
                {!isEditing && selected && (
                  <section className="rounded-xl border border-dashed border-gray-200 px-4 py-3 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-gray-400 mr-1">Lanjut:</span>
                    <Link
                      to={`/bank-soal/${subjectKey}/${selected.id}`}
                      className="text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg"
                    >
                      Buka bank soal materi ini
                    </Link>
                    <button
                      type="button"
                      onClick={startEdit}
                      className="text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                    >
                      Ubah nama / tautan / TP
                    </button>
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-10 text-center">
              <div>
                <p className="text-sm text-gray-500 mb-3">Pilih materi di daftar, atau buat materi baru.</p>
                <button
                  type="button"
                  onClick={openNew}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  + Materi baru
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

/* ========== Helpers (perilaku non-destruktif, sama seperti sebelumnya) ========== */

async function ensureTopics(subjectKey: string, topics: Topic[], materials: BookMaterial[]) {
  const taken = new Set(topics.map((t) => t.bookMaterialId).filter(Boolean))
  const missing = materials.filter(
    (m) => m.id && !taken.has(m.id) && !topics.some((t) => sameName(t.name, m.title))
  )
  if (missing.length === 0) return topics
  const batch = writeBatch(db)
  const created: Topic[] = []
  missing.forEach((m) => {
    const ref = doc(collection(db, 'topics'))
    batch.set(ref, {
      subjectKey,
      name: m.title,
      bookMaterialId: m.id,
      tpCodes: m.suggestedTpCodes || [],
      createdAt: serverTimestamp(),
    })
    created.push({
      id: ref.id,
      subjectKey: subjectKey as SubjectKey,
      name: m.title,
      bookMaterialId: m.id,
      tpCodes: m.suggestedTpCodes || [],
    })
  })
  await batch.commit()
  return [...created, ...topics]
}

async function autoLink(topics: Topic[], materials: BookMaterial[]) {
  const next = [...topics]
  for (const topic of next) {
    if (!topic.id || topic.bookMaterialId) continue
    const match = uniqueMatch(
      topic.name,
      materials,
      next.filter((t) => t.id !== topic.id)
    )
    if (!match?.id) continue
    await updateDoc(doc(db, 'topics', topic.id), {
      bookMaterialId: match.id,
      tpCodes: match.suggestedTpCodes || [],
    })
    topic.bookMaterialId = match.id
    topic.tpCodes = match.suggestedTpCodes || []
  }
  return next
}

function uniqueMatch(name: string, materials: BookMaterial[], topics: Topic[]) {
  const hits = materials.filter((m) => sameName(name, m.title))
  if (hits.length !== 1) return null
  const used = topics.some((t) => t.bookMaterialId === hits[0].id)
  return used ? null : hits[0]
}

function sameName(a: string, b: string) {
  const left = norm(a)
  const right = norm(b)
  if (!left || !right) return false
  if (left === right) return true
  const shorter = left.length < right.length ? left : right
  const longer = left.length < right.length ? right : left
  return shorter.length >= 8 && longer.includes(shorter)
}

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
