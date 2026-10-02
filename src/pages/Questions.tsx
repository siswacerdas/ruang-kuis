import { useEffect, useState, useRef } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Question } from '../types/question'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'

export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Reset form
  const resetForm = () => {
    setQuestionText('')
    setOptions(['', '', '', ''])
    setCorrectAnswer(0)
    setEditingId(null)
    setError('')
    setShowForm(false)
  }

  // Buka form untuk edit
  const handleEdit = (q: Question) => {
    setQuestionText(q.question)
    setOptions([...q.options])
    setCorrectAnswer(q.correctAnswer)
    setEditingId(q.id || null)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tambah atau Update soal
  const handleSubmit = async (e: React.FormEvent) => {
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
      if (editingId) {
        await updateDoc(doc(db, 'questions', editingId), {
          question: questionText.trim(),
          options: options.map(o => o.trim()),
          correctAnswer
        })
      } else {
        await addDoc(collection(db, 'questions'), {
          question: questionText.trim(),
          options: options.map(o => o.trim()),
          correctAnswer,
          createdAt: serverTimestamp()
        })
      }

      resetForm()
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

  // ========== IMPORT SOAL ==========
  const parseCorrectAnswer = (value: any): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const upper = value.trim().toUpperCase()
      if (upper === 'A') return 0
      if (upper === 'B') return 1
      if (upper === 'C') return 2
      if (upper === 'D') return 3
      const num = parseInt(value, 10)
      if (!isNaN(num) && num >= 0 && num <= 3) return num
    }
    return 0
  }

  const normalizeQuestion = (item: any): Question | null => {
    try {
      const question = item.question || item.Pertanyaan || item.pertanyaan || ''
      if (!question.trim()) return null

      let options: string[] = []

      if (Array.isArray(item.options)) {
        options = item.options
      } else {
        options = [
          item.optionA || item.A || item.pilihanA || item['Pilihan A'] || '',
          item.optionB || item.B || item.pilihanB || item['Pilihan B'] || '',
          item.optionC || item.C || item.pilihanC || item['Pilihan C'] || '',
          item.optionD || item.D || item.pilihanD || item['Pilihan D'] || ''
        ]
      }

      if (options.length < 4 || options.some(o => !String(o).trim())) return null

      const correctAnswer = parseCorrectAnswer(
        item.correctAnswer ?? item.jawaban ?? item.Jawaban ?? item.correct ?? 0
      )

      return {
        question: String(question).trim(),
        options: options.map(o => String(o).trim()),
        correctAnswer
      }
    } catch {
      return null
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError('')

    try {
      const fileName = file.name.toLowerCase()
      let rawData: any[] = []

      if (fileName.endsWith('.json')) {
        const text = await file.text()
        const parsed = JSON.parse(text)
        rawData = Array.isArray(parsed) ? parsed : [parsed]
      } else if (fileName.endsWith('.csv')) {
        const text = await file.text()
        const workbook = XLSX.read(text, { type: 'string' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rawData = XLSX.utils.sheet_to_json(sheet)
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rawData = XLSX.utils.sheet_to_json(sheet)
      } else {
        alert('Format file tidak didukung. Gunakan .json, .csv, atau .xlsx')
        return
      }

      const validQuestions: Question[] = []
      for (const item of rawData) {
        const q = normalizeQuestion(item)
        if (q) validQuestions.push(q)
      }

      if (validQuestions.length === 0) {
        alert('Tidak ada soal valid yang ditemukan di file.')
        return
      }

      // Simpan ke Firestore (batch)
      const batch = writeBatch(db)
      const colRef = collection(db, 'questions')

      // Karena writeBatch terbatas 500, kita pakai addDoc satu per satu untuk aman
      let successCount = 0
      for (const q of validQuestions) {
        try {
          await addDoc(colRef, {
            ...q,
            createdAt: serverTimestamp()
          })
          successCount++
        } catch (err) {
          console.error('Gagal import satu soal:', err)
        }
      }

      alert(`Berhasil mengimpor ${successCount} dari ${validQuestions.length} soal.`)
      await fetchQuestions()
    } catch (err) {
      console.error(err)
      alert('Gagal membaca file. Pastikan format file benar.')
    } finally {
      setImporting(false)
      // Reset input file
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
          <div className="flex items-center gap-2">
            {/* Tombol Import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              {importing ? 'Mengimpor...' : 'Import Soal'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.xlsx,.xls"
              onChange={handleImportFile}
              className="hidden"
            />

            <button
              onClick={() => {
                if (showForm) {
                  resetForm()
                } else {
                  setShowForm(true)
                  setEditingId(null)
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Soal'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Form Tambah / Edit Soal */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Soal' : 'Tambah Soal Baru'}
            </h2>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-2.5 rounded-lg transition"
                >
                  {saving ? 'Menyimpan...' : (editingId ? 'Update Soal' : 'Simpan Soal')}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2.5 rounded-lg transition"
                  >
                    Batal
                  </button>
                )}
              </div>
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
            <p className="text-gray-500">Belum ada soal. Klik "+ Tambah Soal" atau "Import Soal" untuk mulai.</p>
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
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleEdit(q)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => q.id && handleDelete(q.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Hapus
                      </button>
                    </div>
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
