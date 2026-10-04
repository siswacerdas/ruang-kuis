import { useEffect, useState } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getSubject,
  QUESTION_TYPE_LABELS,
  DEFAULT_CATEGORY_LABELS,
  type Question,
  type QuestionType,
  type Topic,
  type SubjectKey,
} from '../types/question'

const emptyForm = () => ({
  type: 'single' as QuestionType,
  question: '',
  options: ['', '', '', ''],
  correctAnswers: [] as number[],
  categoryLabels: [...DEFAULT_CATEGORY_LABELS] as string[],
  explanation: '',
})

export default function TopicQuestions() {
  const { subjectKey, topicId } = useParams<{ subjectKey: string; topicId: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')

  const [topic, setTopic] = useState<Topic | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!subject || !topicId) {
      navigate('/bank-soal')
      return
    }
    loadData()
  }, [subjectKey, topicId])

  const loadData = async () => {
    if (!topicId || !subjectKey) return
    setLoading(true)
    try {
      const topicDoc = await getDoc(doc(db, 'topics', topicId))
      if (!topicDoc.exists()) {
        navigate(`/bank-soal/${subjectKey}`)
        return
      }
      setTopic({ id: topicDoc.id, ...topicDoc.data() } as Topic)

      let list: Question[] = []
      try {
        const q = query(
          collection(db, 'questions'),
          where('topicId', '==', topicId),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q)
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question))
      } catch {
        const snap = await getDocs(
          query(collection(db, 'questions'), where('topicId', '==', topicId))
        )
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question))
      }
      setQuestions(list)
      if (list.length > 0) setSelectedIndex(0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setError('')
    setShowEditor(true)
  }

  const openEdit = (q: Question) => {
    setEditingId(q.id || null)
    setForm({
      type: q.type || 'single',
      question: q.question,
      options: [...q.options],
      correctAnswers: [...q.correctAnswers],
      categoryLabels: q.categoryLabels ? [...q.categoryLabels] : [...DEFAULT_CATEGORY_LABELS],
      explanation: q.explanation || '',
    })
    setError('')
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditingId(null)
    setError('')
  }

  const setOption = (index: number, value: string) => {
    const next = [...form.options]
    next[index] = value
    setForm({ ...form, options: next })
  }

  const addOption = () => {
    if (form.options.length >= 6) return
    setForm({ ...form, options: [...form.options, ''] })
  }

  const removeOption = (index: number) => {
    if (form.options.length <= 2) return
    const next = form.options.filter((_, i) => i !== index)
    const nextCorrect = form.correctAnswers
      .filter((c) => c !== index)
      .map((c) => (c > index ? c - 1 : c))
    setForm({ ...form, options: next, correctAnswers: nextCorrect })
  }

  const toggleCorrect = (index: number) => {
    if (form.type === 'single' || form.type === 'category') {
      setForm({ ...form, correctAnswers: [index] })
    } else {
      // multiple
      const has = form.correctAnswers.includes(index)
      setForm({
        ...form,
        correctAnswers: has
          ? form.correctAnswers.filter((c) => c !== index)
          : [...form.correctAnswers, index].sort((a, b) => a - b),
      })
    }
  }

  /** Untuk category: set label index (0/1) untuk statement ke-i */
  const setCategoryAnswer = (statementIndex: number, labelIndex: number) => {
    const next = [...form.correctAnswers]
    while (next.length < form.options.length) next.push(0)
    next[statementIndex] = labelIndex
    setForm({ ...form, correctAnswers: next.slice(0, form.options.length) })
  }

  const changeType = (type: QuestionType) => {
    if (type === 'category') {
      setForm({
        ...form,
        type,
        options: form.options.length >= 1 ? form.options : [''],
        correctAnswers: form.options.map(() => 0),
        categoryLabels: form.categoryLabels.length >= 2 ? form.categoryLabels : [...DEFAULT_CATEGORY_LABELS],
      })
    } else if (type === 'single') {
      setForm({
        ...form,
        type,
        options: form.options.length >= 2 ? form.options : ['', '', '', ''],
        correctAnswers: form.correctAnswers.length === 1 ? form.correctAnswers : [],
      })
    } else {
      setForm({
        ...form,
        type,
        options: form.options.length >= 2 ? form.options : ['', '', '', ''],
        correctAnswers: form.correctAnswers,
      })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.question.trim()) {
      setError('Teks pertanyaan tidak boleh kosong')
      return
    }
    if (form.options.some((o) => !o.trim())) {
      setError(form.type === 'category' ? 'Semua pernyataan harus diisi' : 'Semua opsi jawaban harus diisi')
      return
    }
    if (form.type === 'single' && form.correctAnswers.length !== 1) {
      setError('Pilih satu jawaban benar')
      return
    }
    if (form.type === 'multiple' && form.correctAnswers.length < 1) {
      setError('Pilih minimal satu jawaban benar')
      return
    }
    if (form.type === 'category') {
      if (form.categoryLabels.some((l) => !l.trim())) {
        setError('Label kategori harus diisi (contoh: Benar / Salah)')
        return
      }
      if (form.correctAnswers.length !== form.options.length) {
        setError('Tandai kategori untuk setiap pernyataan')
        return
      }
    }

    if (!topicId || !subjectKey) return
    setSaving(true)
    try {
      const payload: Omit<Question, 'id' | 'createdAt'> & { createdAt?: any } = {
        topicId,
        subjectKey: subjectKey as SubjectKey,
        type: form.type,
        question: form.question.trim(),
        options: form.options.map((o) => o.trim()),
        correctAnswers: form.correctAnswers,
        explanation: form.explanation.trim() || undefined,
      }
      if (form.type === 'category') {
        payload.categoryLabels = form.categoryLabels.map((l) => l.trim())
      }

      if (editingId) {
        await updateDoc(doc(db, 'questions', editingId), payload)
      } else {
        payload.createdAt = serverTimestamp()
        await addDoc(collection(db, 'questions'), payload)
      }
      closeEditor()
      await loadData()
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
      await loadData()
      if (showEditor && editingId === id) closeEditor()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus soal')
    }
  }

  if (!subject) return null

  const selected = questions[selectedIndex]

  const actions = (
    <button
      onClick={openNew}
      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm shadow-indigo-200"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Tambah Soal
    </button>
  )

  return (
    <Layout
      title={topic?.name || 'Materi'}
      subtitle={`${subject.name} · ${questions.length} soal`}
      actions={actions}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <Link to="/bank-soal" className="hover:text-indigo-600 transition">
          Bank Soal
        </Link>
        <span className="text-gray-300">/</span>
        <Link to={`/bank-soal/${subjectKey}`} className="hover:text-indigo-600 transition">
          {subject.shortName}
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium truncate">{topic?.name}</span>
      </nav>

      {/* ===== EDITOR (overlay style inspired by reference) ===== */}
      {showEditor && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Tutup
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {editingId ? 'Edit Soal' : 'Soal Baru'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-500">Tipe</label>
              <select
                value={form.type}
                onChange={(e) => changeType(e.target.value as QuestionType)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {/* Pertanyaan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Pertanyaan
              </label>
              <textarea
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition text-gray-900 placeholder:text-gray-400"
                placeholder="Tulis pertanyaan di sini..."
                required
              />
            </div>

            {/* Category labels (hanya tipe kategori) */}
            {form.type === 'category' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Label kategori
                </label>
                <div className="flex gap-3">
                  {form.categoryLabels.map((label, i) => (
                    <input
                      key={i}
                      type="text"
                      value={label}
                      onChange={(e) => {
                        const next = [...form.categoryLabels]
                        next[i] = e.target.value
                        setForm({ ...form, categoryLabels: next })
                      }}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                      placeholder={i === 0 ? 'Benar / Sesuai' : 'Salah / Tidak Sesuai'}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Contoh: Benar–Salah, Sesuai–Tidak Sesuai, Ya–Tidak
                </p>
              </div>
            )}

            {/* Opsi / Pernyataan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  {form.type === 'category' ? 'Pernyataan' : 'Pilihan jawaban'}
                </label>
                {form.type !== 'category' && (
                  <span className="text-xs text-gray-400">
                    {form.type === 'single' ? 'Pilih 1 jawaban benar' : 'Pilih ≥1 jawaban benar'}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {form.options.map((opt, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {form.type === 'category' ? (
                      /* Kategori: radio pair per statement */
                      <div className="flex gap-1 shrink-0">
                        {[0, 1].map((li) => (
                          <button
                            key={li}
                            type="button"
                            onClick={() => setCategoryAnswer(index, li)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition ${
                              form.correctAnswers[index] === li
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'
                            }`}
                          >
                            {form.categoryLabels[li] || (li === 0 ? 'A' : 'B')}
                          </button>
                        ))}
                      </div>
                    ) : form.type === 'single' ? (
                      <button
                        type="button"
                        onClick={() => toggleCorrect(index)}
                        className={`shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition ${
                          form.correctAnswers.includes(index)
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300'
                        }`}
                      >
                        {String.fromCharCode(65 + index)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCorrect(index)}
                        className={`shrink-0 w-9 h-9 rounded-lg border-2 flex items-center justify-center transition ${
                          form.correctAnswers.includes(index)
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300'
                        }`}
                      >
                        {form.correctAnswers.includes(index) ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-xs font-semibold">{String.fromCharCode(65 + index)}</span>
                        )}
                      </button>
                    )}

                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => setOption(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                      placeholder={
                        form.type === 'category'
                          ? `Pernyataan ${index + 1}`
                          : `Opsi ${String.fromCharCode(65 + index)}`
                      }
                    />

                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      disabled={form.options.length <= 2}
                      className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30 transition"
                      title="Hapus"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {form.options.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Tambah {form.type === 'category' ? 'pernyataan' : 'opsi'}
                </button>
              )}
            </div>

            {/* Explanation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Pembahasan <span className="text-gray-400 font-normal">(opsional)</span>
              </label>
              <textarea
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none transition text-sm text-gray-900 placeholder:text-gray-400"
                placeholder="Jelaskan mengapa jawaban tersebut benar..."
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium px-6 py-2.5 rounded-xl transition shadow-sm shadow-indigo-200"
              >
                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Soal'}
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-6 py-2.5 rounded-xl transition"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== LIST + PREVIEW ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Outline kiri */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Daftar soal</span>
            <span className="text-xs text-gray-500">{questions.length}</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Memuat...</div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">Belum ada soal</p>
              <button
                onClick={openNew}
                className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
              >
                + Tambah soal pertama
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition ${
                    selectedIndex === idx ? 'bg-indigo-50/70 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-xs font-semibold text-gray-400 w-5 shrink-0 pt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{q.question}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {QUESTION_TYPE_LABELS[q.type] || q.type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview kanan */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              Pilih soal di daftar atau tambah soal baru
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>
                    Soal {selectedIndex + 1}/{questions.length}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                    {QUESTION_TYPE_LABELS[selected.type]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(selected)}
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => selected.id && handleDelete(selected.id)}
                    className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Hapus
                  </button>
                </div>
              </div>

              <div className="p-6">
                <p className="text-base font-medium text-gray-900 leading-relaxed mb-5">
                  {selected.question}
                </p>

                {selected.type === 'category' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400 mb-2">
                      Kategori: {(selected.categoryLabels || DEFAULT_CATEGORY_LABELS).join(' / ')}
                    </p>
                    {selected.options.map((stmt, i) => {
                      const labels = selected.categoryLabels || DEFAULT_CATEGORY_LABELS
                      const ans = selected.correctAnswers[i]
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                        >
                          <span className="text-xs font-semibold text-gray-400 pt-0.5">{i + 1}.</span>
                          <p className="flex-1 text-sm text-gray-800">{stmt}</p>
                          <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                            {labels[ans] ?? '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.options.map((opt, i) => {
                      const correct = selected.correctAnswers.includes(i)
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
                            correct
                              ? 'bg-emerald-50 border-emerald-200'
                              : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <span
                            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                              correct
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-500'
                            }`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <p className={`text-sm ${correct ? 'text-emerald-900 font-medium' : 'text-gray-700'}`}>
                            {opt}
                          </p>
                          {correct && (
                            <svg className="w-4 h-4 text-emerald-500 ml-auto shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {selected.explanation && (
                  <div className="mt-6 pt-5 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Pembahasan
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">{selected.explanation}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
