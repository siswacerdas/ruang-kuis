import { useEffect, useState } from 'react'
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
import type { BookMaterial } from '../types/tp'

export default function SubjectTopics() {
  const { subjectKey } = useParams<{ subjectKey: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')

  const [topics, setTopics] = useState<Topic[]>([])
  const [materials, setMaterials] = useState<BookMaterial[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!subject) {
      navigate('/bank-soal')
      return
    }
    loadTopics()
  }, [subjectKey])

  const loadTopics = async () => {
    if (!subjectKey) return
    setLoading(true)
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

      const matSnap = await getDocs(query(collection(db, 'bookMaterials'), where('subjectKey', '==', subjectKey)))
      const mats: BookMaterial[] = matSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookMaterial))
      setMaterials(mats)

      const linked = await autoLink(list, mats)
      setTopics(linked)

      const counts: Record<string, number> = {}
      if (linked.length > 0) {
        const qSnap = await getDocs(query(collection(db, 'questions'), where('subjectKey', '==', subjectKey)))
        qSnap.docs.forEach((d) => {
          const tid = d.data().topicId as string
          counts[tid] = (counts[tid] || 0) + 1
        })
      }
      setQuestionCounts(counts)
    } catch (err) {
      console.error(err)
      setError('Gagal memuat materi.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!topicName.trim() || !subjectKey) {
      setError('Nama materi tidak boleh kosong')
      return
    }
    setSaving(true)
    try {
      const match = uniqueMatch(topicName, materials, topics)
      await addDoc(collection(db, 'topics'), {
        subjectKey: subjectKey as SubjectKey,
        name: topicName.trim(),
        ...(match
          ? { bookMaterialId: match.id, tpCodes: match.suggestedTpCodes || [] }
          : {}),
        createdAt: serverTimestamp(),
      })
      setTopicName('')
      setShowForm(false)
      setNotice(match ? `Materi ditautkan otomatis ke “${match.title}”.` : 'Materi ditambahkan tanpa pasangan di daftar buku.')
      await loadTopics()
    } catch (err) {
      console.error(err)
      setError('Gagal menambah materi. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const syncFromBooks = async () => {
    if (!subjectKey) return
    setSyncing(true)
    setError('')
    try {
      const taken = new Set(topics.map((t) => t.bookMaterialId).filter(Boolean))
      const missing = materials.filter((m) => m.id && !taken.has(m.id) && !topics.some((t) => sameName(t.name, m.title)))
      if (missing.length === 0) {
        setNotice('Semua materi buku mapel ini sudah ada di bank soal.')
        setSyncing(false)
        return
      }
      const batch = writeBatch(db)
      missing.forEach((m) => {
        const ref = doc(collection(db, 'topics'))
        batch.set(ref, {
          subjectKey,
          name: m.title,
          bookMaterialId: m.id,
          tpCodes: m.suggestedTpCodes || [],
          createdAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setNotice(`${missing.length} materi buku disalin ke bank soal dan ditautkan. Materi lama tidak diubah.`)
      await loadTopics()
    } catch (err) {
      console.error(err)
      setError('Gagal menyinkronkan materi.')
    } finally {
      setSyncing(false)
    }
  }

  const relink = async (topic: Topic, materialId: string) => {
    if (!topic.id) return
    const material = materials.find((m) => m.id === materialId)
    try {
      await updateDoc(doc(db, 'topics', topic.id), {
        bookMaterialId: materialId || null,
        tpCodes: material?.suggestedTpCodes || [],
      })
      await loadTopics()
    } catch (err) {
      console.error(err)
      setError('Gagal mengubah tautan.')
    }
  }

  const handleDeleteTopic = async (topic: Topic) => {
    if (!topic.id) return
    const count = questionCounts[topic.id] || 0
    const msg = count > 0
      ? `Materi "${topic.name}" memiliki ${count} soal. Hapus materi beserta semua soalnya?`
      : `Hapus materi "${topic.name}"?`
    if (!confirm(msg)) return
    try {
      const qSnap = await getDocs(query(collection(db, 'questions'), where('topicId', '==', topic.id)))
      for (const d of qSnap.docs) await deleteDoc(doc(db, 'questions', d.id))
      await deleteDoc(doc(db, 'topics', topic.id))
      await loadTopics()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus materi')
    }
  }

  if (!subject) return null

  const linkedCount = topics.filter((t) => t.bookMaterialId).length

  return (
    <Layout
      title={subject.name}
      subtitle={`${topics.length} materi bank soal · ${linkedCount} tertaut ke daftar materi`}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={syncFromBooks}
            disabled={syncing || materials.length === 0}
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {syncing ? 'Menyalin...' : 'Salin materi buku'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setError(''); setTopicName('') }}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium"
          >
            {showForm ? 'Tutup' : 'Tambah Materi'}
          </button>
        </div>
      }
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/bank-soal" className="hover:text-indigo-600">Bank Soal</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{subject.shortName}</span>
      </nav>

      {notice && <div className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm px-4 py-3">{notice}</div>}
      {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      {materials.length === 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">
          Daftar materi buku mapel ini masih kosong. Impor dulu di Tujuan Pembelajaran.
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Materi baru</h2>
          <form onSubmit={handleAddTopic} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="Nama materi. Jika mirip daftar buku, tautan diisi otomatis."
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              autoFocus
            />
            <button type="submit" disabled={saving} className="bg-indigo-600 text-white font-medium px-5 py-2.5 rounded-xl">
              {saving ? 'Menyimpan...' : 'Simpan Materi'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Daftar Materi</h2>
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{topics.length} item</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">Memuat materi...</div>
        ) : topics.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">Belum ada materi. Salin dari daftar buku atau tambah manual.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {topics.map((topic) => {
              const material = materials.find((m) => m.id === topic.bookMaterialId)
              const codes = topic.tpCodes || material?.suggestedTpCodes || []
              return (
                <div key={topic.id} className="px-6 py-4 flex items-start gap-4">
                  <Link to={`/bank-soal/${subjectKey}/${topic.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{topic.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{questionCounts[topic.id || ''] || 0} soal</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {material ? (
                        <span className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">Tertaut: {material.title}</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500">Belum tertaut</span>
                      )}
                      {codes.map((code) => (
                        <span key={code} className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{code}</span>
                      ))}
                    </div>
                  </Link>
                  <select
                    value={topic.bookMaterialId || ''}
                    onChange={(e) => relink(topic, e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2 py-2 max-w-[180px]"
                    title="Ubah tautan materi buku"
                  >
                    <option value="">Tanpa tautan</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                  <button onClick={() => handleDeleteTopic(topic)} className="p-2 rounded-lg text-gray-400 hover:text-red-600" title="Hapus materi">
                    Hapus
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}

async function autoLink(topics: Topic[], materials: BookMaterial[]) {
  const next = [...topics]
  for (const topic of next) {
    if (!topic.id || topic.bookMaterialId) continue
    const match = uniqueMatch(topic.name, materials, next.filter((t) => t.id !== topic.id))
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
