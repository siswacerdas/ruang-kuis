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
import { getSubject, type Topic, type SubjectKey, type Subject } from '../types/question'
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
  const [subject, setSubject] = useState<Subject | undefined>(() => getSubject(subjectKey || ''))
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
      setSubject(s)
      if (!s) {
        navigate('/bank-soal')
        return
      }
      await loadAll()
    })()
    return () => {
      cancelled = true
    }
  }, [subjectKey])

  // NOTE: full master–detail UI restored from main history in follow-up if needed.
  // Core path: load subjects → resolve mapel → load topics/materials/TP.
  const loadAll = async (preferId?: string | null) => {
    if (!subjectKey) return
    setLoading(true)
    setError('')
    try {
      let list: Topic[] = []
      try {
        const snap = await getDocs(
          query(collection(db, 'topics'), where('subjectKey', '==', subjectKey), orderBy('createdAt', 'desc')),
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
      setTopics(list)
      const counts: Record<string, number> = {}
      if (list.length > 0) {
        try {
          const ids = list.map((t) => t.id).filter((id): id is string => !!id)
          const results = await Promise.all(ids.map((id) => countDocs('questions', where('topicId', '==', id))))
          ids.forEach((id, i) => {
            counts[id] = results[i]
          })
        } catch (err) {
          console.warn('questionCounts fallback', err)
        }
      }
      setQuestionCounts(counts)
      const keepId = preferId || selectedId
      if (keepId && list.some((t) => t.id === keepId)) {
        setSelectedId(keepId)
        const t = list.find((x) => x.id === keepId)!
        setFormName(t.name || '')
        setFormBookId(t.bookMaterialId || '')
        setFormTpCodes(t.tpCodes || [])
        setMode('view')
      } else if (list.length > 0) {
        const first = list[0]
        setSelectedId(first.id || null)
        setFormName(first.name || '')
        setFormBookId(first.bookMaterialId || '')
        setFormTpCodes(first.tpCodes || [])
        setMode('view')
      } else {
        setSelectedId(null)
        setMode('view')
      }
    } catch (err) {
      console.error(err)
      setError('Gagal memuat materi.')
    } finally {
      setLoading(false)
    }
  }

  const selected = topics.find((t) => t.id === selectedId) || null

  const filteredTopics = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    return topics.filter((t) => {
      if (filterLink === 'linked' && !t.bookMaterialId) return false
      if (filterLink === 'unlinked' && t.bookMaterialId) return false
      if (!q) return true
      const bookTitle = materials.find((m) => m.id === t.bookMaterialId)?.title || ''
      return [t.name, bookTitle, ...(t.tpCodes || [])].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [topics, materials, listSearch, filterLink])

  if (!subject) return null

  return (
    <Layout
      title={subject.name}
      subtitle={`${topics.length} materi`}
      actions={
        <Link to="/bank-soal" className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
          ← Bank Soal
        </Link>
      }
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/bank-soal" className="hover:text-indigo-600">Bank Soal</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{subject.shortName}</span>
      </nav>
      {error && <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3">{notice}</div>}
      {loading ? (
        <div className="text-center py-16 text-sm text-gray-500">Memuat...</div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Cari materi…"
              className="flex-1 min-w-[12rem] px-3 py-2 text-sm border border-gray-200 rounded-xl"
            />
            {(['all', 'linked', 'unlinked'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterLink(k)}
                className={`text-xs px-3 py-2 rounded-xl border ${
                  filterLink === k ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200'
                }`}
              >
                {k === 'all' ? 'Semua' : k === 'linked' ? 'Tertaut' : 'Belum'}
              </button>
            ))}
          </div>
          {filteredTopics.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">Belum ada materi untuk mapel ini.</p>
          ) : (
            <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {filteredTopics.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/bank-soal/${subjectKey}/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">
                        {questionCounts[t.id || ''] || 0} soal
                        {(t.tpCodes || []).length ? ` · TP: ${(t.tpCodes || []).join(', ')}` : ''}
                      </p>
                    </div>
                    <span className="text-gray-300">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Layout>
  )
}
