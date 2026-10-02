import { useEffect, useState } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Question } from '../types/question'
import { Link } from 'react-router-dom'

export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [questionText, setQuestionText] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctAnswer, setCorrectAnswer] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Ambil data soal dari Firestore
  const fetchQuestions = async () => {
    try {
      const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data: Question[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      } as Question))
      setQuestions(data)
    } catch (err) {
      console.error('Gagal mengambil soal:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [])

  // Tambah soal baru
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!questionText.trim()) {
      setError('Pertanyaan tidak boleh kosong')
      return
    }
    if (options.some(opt => !opt.trim())) {
      setError('Semua pilihan jawaban harus diisi')
      return
    }

    setSaving(true)
    try {
      await addDoc(collection(db, 'questions'), {
        question: questionText.trim(),
        options: options.map(o => o.trim()),
        correctAnswer,
        createdAt: serverTimestamp()
      })

      // Reset form
      setQuestionText('')
      setOptions(['', '', '', ''])
      setCorrectAnswer(0)
      setShowForm(false)

      // Refresh daftar
      await fetchQuestions()
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan soal. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // Hapus soal
  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus soal ini?')) return

    try {
      await deleteDoc(doc(db, 'questions', id))
      setQuestions(questions.filter(q => q.id !== id))
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus soal')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-800">Kelola Soal</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            {showForm ? 'Tutup Form' : '+ Tambah Soal'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Form Tambah Soal */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Tambah Soal Baru</h2>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pertanyaan
                </label>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Tulis pertanyaan di sini..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {options.map((opt, index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pilihan {String.fromCharCode(65 + index)}
                      {correctAnswer === index && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Jawaban Benar
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...options]
                          newOptions[index] = e.target.value
                          setOptions(newOptions)
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={`Pilihan ${String.fromCharCode(65 + index)}`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setCorrectAnswer(index)}
                        className={`px-3 py-2 rounded-lg text-sm ${correctAnswer === index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        Benar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2.5 rounded-lg transition"
              >
                {saving ? 'Menyimpan...' : 'Simpan Soal'}
              </button>
            </form>
          </div>
        )}

        {/* Daftar Soal */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">
            Daftar Soal ({questions.length})
          </h2>

          {loading ? (
            <p className="text-gray-500">Memuat soal...</p>
          ) : questions.length === 0 ? (
            <p className="text-gray-500">Belum ada soal. Klik "+ Tambah Soal" untuk mulai.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-gray-200 rounded-lg p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">
                        {idx + 1}. {q.question}
                      </p>
                      <div className="mt-3 space-y-1">
                        {q.options.map((opt, i) => (
                          <p
                            key={i}
                            className={`text-sm ${i === q.correctAnswer
                              ? 'text-green-600 font-medium'
                              : 'text-gray-600'
                              }`}
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                            {i === q.correctAnswer && ' ✓'}
                          </p>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => q.id && handleDelete(q.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
