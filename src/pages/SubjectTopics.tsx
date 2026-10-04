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
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getSubject, type Topic, type SubjectKey } from '../types/question'

export default function SubjectTopics() {
  const { subjectKey } = useParams<{ subjectKey: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')

  const [topics, setTopics] = useState<Topic[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      const q = query(
        collection(db, 'topics'),
        where('subjectKey', '==', subjectKey),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      const list: Topic[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Topic))
      setTopics(list)

      // Hitung soal per topic
      const counts: Record<string, number> = {}
      if (list.length > 0) {
        const qSnap = await getDocs(
          query(collection(db, 'questions'), where('subjectKey', '==', subjectKey))
        )
        qSnap.docs.forEach((d) => {
          const tid = d.data().topicId as string
          counts[tid] = (counts[tid] || 0) + 1
        })
      }
      setQuestionCounts(counts)
    } catch (err) {
      console.error(err)
      // Fallback tanpa orderBy jika index belum ada
      try {
        const snap = await getDocs(
          query(collection(db, 'topics'), where('subjectKey', '==', subjectKey))
        )
        const list: Topic[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Topic))
        setTopics(list)
      } catch (e2) {
        console.error(e2)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!topicName.trim()) {
      setError('Nama materi tidak boleh kosong')
      return
    }
    if (!subjectKey) return

    setSaving(true)
    try {
      await addDoc(collection(db, 'topics'), {
        subjectKey: subjectKey as SubjectKey,
        name: topicName.trim(),
        createdAt: serverTimestamp(),
      })
      setTopicName('')
      setShowForm(false)
      await loadTopics()
    } catch (err) {
      console.error(err)
      setError('Gagal menambah materi. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTopic = async (topic: Topic) => {
    if (!topic.id) return
    const count = questionCounts[topic.id] || 0
    const msg =
      count > 0
        ? `Materi "${topic.name}" memiliki ${count} soal. Hapus materi beserta semua soalnya?`
        : `Hapus materi "${topic.name}"?`
    if (!confirm(msg)) return

    try {
      // Hapus soal di bawah materi ini
      const qSnap = await getDocs(
        query(collection(db, 'questions'), where('topicId', '==', topic.id))
      )
      for (const d of qSnap.docs) {
        await deleteDoc(doc(db, 'questions', d.id))
      }
      await deleteDoc(doc(db, 'topics', topic.id))
      await loadTopics()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus materi')
    }
  }

  if (!subject) return null

  const actions = (
    <button
      onClick={() => {
        setShowForm(!showForm)
        setError('')
        setTopicName('')
      }}
      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm shadow-indigo-200"
    >
      {showForm ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Tutup
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Tambah Materi
        </>
      )}
    </button>
  )

  return (
    <Layout
      title={subject.name}
      subtitle={`${topics.length} materi · Pool soal mapel ini siap untuk ATS / AS`}
      actions={actions}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/bank-soal" className="hover:text-indigo-600 transition">
          Bank Soal
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{subject.shortName}</span>
      </nav>

      {/* Form tambah materi */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Materi baru</h2>
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleAddTopic} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="Contoh: Ekosistem, Bunyi dan Cahaya, ..."
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition text-gray-900 placeholder:text-gray-400"
              autoFocus
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium px-5 py-2.5 rounded-xl transition shrink-0"
            >
              {saving ? 'Menyimpan...' : 'Simpan Materi'}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-3">
            Materi akan masuk ke pool soal <strong>{subject.name}</strong>. Guru bisa membuat materi bebas tanpa mengubah kode.
          </p>
        </div>
      )}

      {/* Daftar materi */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Daftar Materi</h2>
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
            {topics.length} item
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">Memuat materi...</div>
        ) : topics.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4 text-2xl">
              {subject.icon}
            </div>
            <p className="text-gray-600 font-medium">Belum ada materi</p>
            <p className="text-sm text-gray-400 mt-1">
              Klik &quot;Tambah Materi&quot; untuk membuat topik pertama (misalnya Ekosistem).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {topics.map((topic) => {
              const qCount = questionCounts[topic.id || ''] || 0
              return (
                <div
                  key={topic.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/70 transition group"
                >
                  <Link
                    to={`/bank-soal/${subjectKey}/${topic.id}`}
                    className="flex-1 min-w-0 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 group-hover:text-indigo-700 transition truncate">
                        {topic.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {qCount} soal
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      to={`/bank-soal/${subjectKey}/${topic.id}`}
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      title="Buka soal"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleDeleteTopic(topic)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Hapus materi"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
