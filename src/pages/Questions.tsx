import { useEffect, useState, useRef } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Question } from '../types/question'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'

export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [questionText, setQuestionText] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctAnswer, setCorrectAnswer] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchQuestions = async () => {
    try {
      const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data: Question[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
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

  const resetForm = () => {
    setQuestionText('')
    setOptions(['', '', '', ''])
    setCorrectAnswer(0)
    setEditingId(null)
    setError('')
    setShowForm(false)
  }

  const handleEdit = (q: Question) => {
    setQuestionText(q.question)
    setOptions([...q.options])
    setCorrectAnswer(q.correctAnswer)
    setEditingId(q.id || null)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!questionText.trim()) {
      setError('Pertanyaan tidak boleh kosong')
      return
    }
    if (options.some((opt) => !opt.trim())) {
      setError('Semua pilihan jawaban harus diisi')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateDoc(doc(db, 'questions', editingId), {
          question: questionText.trim(),
          options: options.map((o) => o.trim()),
          correctAnswer,
        })
      } else {
        await addDoc(collection(db, 'questions'), {
          question: questionText.trim(),
          options: options.map((o) => o.trim()),
          correctAnswer,
          createdAt: serverTimestamp(),
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

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus soal ini?')) return

    try {
      await deleteDoc(doc(db, 'questions', id))
      setQuestions(questions.filter((q) => q.id !== id))
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus soal')
    }
  }

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

      let opts: string[] = []

      if (Array.isArray(item.options)) {
        opts = item.options
      } else {
        opts = [
          item.optionA || item.A || item.pilihanA || item['Pilihan A'] || '',
          item.optionB || item.B || item.pilihanB || item['Pilihan B'] || '',
          item.optionC || item.C || item.pilihanC || item['Pilihan C'] || '',
          item.optionD || item.D || item.pilihanD || item['Pilihan D'] || '',
        ]
      }

      if (opts.length < 4 || opts.some((o) => !String(o).trim())) return null

      const correct = parseCorrectAnswer(
        item.correctAnswer ?? item.jawaban ?? item.Jawaban ?? item.correct ?? 0
      )

      return {
        question: String(question).trim(),
        options: opts.map((o) => String(o).trim()),
        correctAnswer: correct,
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

      const colRef = collection(db, 'questions')
      let successCount = 0
      for (const q of validQuestions) {
        try {
          await addDoc(colRef, {
            ...q,
            createdAt: serverTimestamp(),
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
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm"
      >
        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {importing ? 'Mengimpor...' : 'Import'}
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
            Tambah Soal
          </>
        )}
      </button>
    </div>
  )

  return (
    <Layout
      title="Kelola Soal"
      subtitle={`${questions.length} soal tersimpan`}
      actions={headerActions}
    >
      {/* Form Tambah / Edit */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5">
            {editingId ? 'Edit Soal' : 'Tambah Soal Baru'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Pertanyaan
              </label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition text-gray-900 placeholder:text-gray-400"
                placeholder="Tulis pertanyaan di sini..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {options.map((opt, index) => (
                <div key={index}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Pilihan {String.fromCharCode(65 + index)}
                    {correctAnswer === index && (
                      <span className="ml-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        Jawaban benar
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...options]
                        next[index] = e.target.value
                        setOptions(next)
                      }}
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition text-gray-900 placeholder:text-gray-400"
                      placeholder={`Jawaban ${String.fromCharCode(65 + index)}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setCorrectAnswer(index)}
                      title="Tandai sebagai jawaban benar"
                      className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition ${
                        correctAnswer === index
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium px-6 py-2.5 rounded-xl transition shadow-sm shadow-indigo-200"
              >
                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Soal'}
              </button>
              {showForm && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-6 py-2.5 rounded-xl transition"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Daftar Soal */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Daftar Soal
          </h2>
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
            {questions.length} item
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">
            <svg className="animate-spin w-6 h-6 mx-auto mb-3 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Memuat soal...
          </div>
        ) : questions.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">Belum ada soal</p>
            <p className="text-sm text-gray-400 mt-1">
              Klik &quot;Tambah Soal&quot; atau &quot;Import&quot; untuk mulai.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="px-6 py-5 hover:bg-gray-50/70 transition"
              >
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-semibold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 leading-snug">
                      {q.question}
                    </p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {q.options.map((opt, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
                            i === q.correctAnswer
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <span
                            className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-xs font-semibold ${
                              i === q.correctAnswer
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-500'
                            }`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="leading-snug">{opt}</span>
                          {i === q.correctAnswer && (
                            <svg className="w-4 h-4 text-emerald-500 ml-auto shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5">
                    <button
                      onClick={() => handleEdit(q)}
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      title="Edit"
                    >
                      <svg className="w-4.5 h-4.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => q.id && handleDelete(q.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Hapus"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
