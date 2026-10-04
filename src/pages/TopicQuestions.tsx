import { useEffect, useState, useRef } from 'react'
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
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
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
  tp: '',
  tpCodes: '',
  materialName: '',
})

function parseCorrectAnswers(value: any, type: QuestionType, optionCount: number): number[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'number') return v
        const s = String(v).trim().toUpperCase()
        if (s >= 'A' && s <= 'Z') return s.charCodeAt(0) - 65
        const n = parseInt(s, 10)
        return isNaN(n) ? -1 : n
      })
      .filter((n) => n >= 0 && n < optionCount)
  }
  if (typeof value === 'number') return value >= 0 && value < optionCount ? [value] : []
  if (typeof value === 'string') {
    const parts = value.split(/[,;|]/).map((p) => p.trim()).filter(Boolean)
    return parts
      .map((p) => {
        const u = p.toUpperCase()
        if (u >= 'A' && u <= 'Z') return u.charCodeAt(0) - 65
        const n = parseInt(p, 10)
        return isNaN(n) ? -1 : n
      })
      .filter((n) => n >= 0 && n < Math.max(optionCount, 10))
  }
  return type === 'category' ? Array(optionCount).fill(0) : []
}

function parseTpCodes(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return String(value || '')
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function downloadTemplate() {
  const header = 'materi,tp,type,question,optionA,optionB,optionC,optionD,correctAnswers,explanation'
  const row = 'Ekosistem,"IPAS-2.1, IPAS-2.2",single,Komponen berikut yang termasuk abiotik adalah...,Cahaya matahari,Pohon,Burung,Jamur,0,Abiotik adalah komponen tak hidup.'
  const blob = new Blob([`${header}\n${row}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_import_soal.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeImportItem(item: any): Omit<Question, 'id' | 'topicId' | 'subjectKey' | 'createdAt'> | null {
  try {
    const question = String(item.question || item.Pertanyaan || item.pertanyaan || '').trim()
    if (!question) return null

    let type: QuestionType = 'single'
    const rawType = String(item.type || item.tipe || item.Type || 'single').toLowerCase()
    if (rawType.includes('multi') || rawType.includes('kompleks')) type = 'multiple'
    else if (rawType.includes('categor') || rawType.includes('kategori') || rawType.includes('benar')) type = 'category'

    let options: string[] = []
    if (Array.isArray(item.options)) {
      options = item.options.map((o: any) => String(o).trim())
    } else if (Array.isArray(item.statements) || Array.isArray(item.pernyataan)) {
      options = (item.statements || item.pernyataan).map((o: any) => String(o).trim())
    } else {
      options = [
        item.optionA || item.A || item.pilihanA || item['Pilihan A'] || '',
        item.optionB || item.B || item.pilihanB || item['Pilihan B'] || '',
        item.optionC || item.C || item.pilihanC || item['Pilihan C'] || '',
        item.optionD || item.D || item.pilihanD || item['Pilihan D'] || '',
        item.optionE || item.E || '',
        item.optionF || item.F || '',
      ]
        .map((o) => String(o).trim())
        .filter((o, i) => o || i < 2)
      // keep trailing empty only if needed — filter empty from end
      while (options.length > 2 && !options[options.length - 1]) options.pop()
    }

    if (options.length < 2 || options.some((o) => !o)) return null

    let categoryLabels: string[] | undefined
    if (type === 'category') {
      if (Array.isArray(item.categoryLabels)) {
        categoryLabels = item.categoryLabels.map((l: any) => String(l).trim())
      } else {
        categoryLabels = [
          String(item.categoryLabelA || item.labelA || item.kategoriA || 'Benar').trim(),
          String(item.categoryLabelB || item.labelB || item.kategoriB || 'Salah').trim(),
        ]
      }
    }

    const correctAnswers = parseCorrectAnswers(
      item.correctAnswers ?? item.correctAnswer ?? item.jawaban ?? item.Jawaban ?? item.correct ?? 0,
      type,
      options.length
    )

    if (type === 'single' && correctAnswers.length === 0) return null
    if (type === 'multiple' && correctAnswers.length === 0) return null
    if (type === 'category' && correctAnswers.length !== options.length) {
      // pad with 0
      while (correctAnswers.length < options.length) correctAnswers.push(0)
    }

    const tpCodes = parseTpCodes(item.tpCodes ?? item.tp ?? item.TP ?? item.tujuanPembelajaran ?? item.tujuan)
    const materialName = String(item.materi || item.material || item.topic || item.namaMateri || '').trim() || undefined
    const explanation = String(item.explanation || item.pembahasan || item.Pembahasan || '').trim() || undefined
    const stimulus = String(item.stimulus || item.Stimulus || item.konteks || '').trim() || undefined

    return {
      type,
      question,
      options,
      correctAnswers,
      ...(type === 'category' ? { categoryLabels } : {}),
      ...(explanation ? { explanation } : {}),
      ...(stimulus ? { stimulus } : {}),
      ...(tpCodes[0] ? { tp: tpCodes[0] } : {}),
      tpCodes,
      ...(materialName ? { materialName } : {}),
      importKey: questionKey(question, type, options),
    }
  } catch {
    return null
  }
}

function questionKey(question: string, type: string, options: string[]) {
  const text = `${type}|${question}|${options.join('|')}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

function cleanPayload(data: Record<string, any>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

async function resolveTopicId(
  subjectKey: string,
  fallbackId: string,
  materialName: string | undefined,
  cache: Map<string, string>,
  current: Topic | null
) {
  const name = (materialName || current?.name || '').trim()
  if (!name) return fallbackId
  const key = name.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const snap = await getDocs(query(collection(db, 'topics'), where('subjectKey', '==', subjectKey)))
  const found = snap.docs.find((d) => String(d.data().name || '').trim().toLowerCase() === key)
  if (found) {
    cache.set(key, found.id)
    return found.id
  }
  const created = await addDoc(collection(db, 'topics'), {
    subjectKey,
    name,
    tpCodes: current?.tpCodes || [],
    createdAt: serverTimestamp(),
  })
  cache.set(key, created.id)
  return created.id
}

async function removeDuplicateQuestions(topicId: string) {
  const snap = await getDocs(query(collection(db, 'questions'), where('topicId', '==', topicId)))
  const seen = new Map<string, string>()
  const extra: string[] = []
  snap.docs.forEach((d) => {
    const data = d.data()
    const key = String(data.importKey || questionKey(data.question || '', data.type || '', data.options || []))
    if (seen.has(key)) extra.push(d.id)
    else seen.set(key, d.id)
  })
  for (let i = 0; i < extra.length; i += 400) {
    const batch = writeBatch(db)
    extra.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)))
    await batch.commit()
  }
  return extra.length
}

export default function TopicQuestions() {
  const { subjectKey, topicId } = useParams<{ subjectKey: string; topicId: string }>()
  const navigate = useNavigate()
  const subject = getSubject(subjectKey || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [topic, setTopic] = useState<Topic | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [checkedIds, setCheckedIds] = useState<string[]>([])

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
      tp: q.tp || (q.tpCodes || []).join(', '),
      tpCodes: (q.tpCodes || (q.tp ? [q.tp] : [])).join(', '),
      materialName: q.materialName || topic?.name || '',
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
      const has = form.correctAnswers.includes(index)
      setForm({
        ...form,
        correctAnswers: has
          ? form.correctAnswers.filter((c) => c !== index)
          : [...form.correctAnswers, index].sort((a, b) => a - b),
      })
    }
  }

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
      const payload: Record<string, any> = {
        topicId,
        subjectKey: subjectKey as SubjectKey,
        type: form.type,
        question: form.question.trim(),
        options: form.options.map((o) => o.trim()),
        correctAnswers: form.correctAnswers,
        explanation: form.explanation.trim() || null,
        tp: parseTpCodes(form.tpCodes || form.tp)[0] || null,
        tpCodes: parseTpCodes(form.tpCodes || form.tp),
        materialName: form.materialName.trim() || topic?.name || null,
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

  const deleteIds = async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length === 0) return
    if (!confirm(`Hapus ${unique.length} soal? Tindakan ini tidak dapat dibatalkan.`)) return
    for (let i = 0; i < unique.length; i += 400) {
      const batch = writeBatch(db)
      unique.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)))
      await batch.commit()
    }
    setCheckedIds([])
    await loadData()
  }

  const handleDelete = async (id: string) => {
    await deleteIds([id])
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !topicId || !subjectKey) return

    setImporting(true)
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
        const sheetName = workbook.SheetNames.find((n) => n.toLowerCase() === 'soal') || workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        rawData = XLSX.utils.sheet_to_json(sheet)
      } else {
        alert('Format tidak didukung. Gunakan .json, .csv, atau .xlsx')
        return
      }

      const valid = rawData
        .map((item) => normalizeImportItem(item))
        .filter((q): q is NonNullable<ReturnType<typeof normalizeImportItem>> => q !== null)

      if (valid.length === 0) {
        alert('Tidak ada soal valid. Periksa format (lihat panduan import).')
        return
      }

      let success = 0
      let skipped = 0
      const topicCache = new Map<string, string>()
      if (topicId) topicCache.set((topic?.name || '').toLowerCase(), topicId)
      const removed = await removeDuplicateQuestions(topicId)
      const existingSnap = await getDocs(query(collection(db, 'questions'), where('subjectKey', '==', subjectKey)))
      const seen = new Set(
        existingSnap.docs.map((d) => String(d.data().importKey || questionKey(d.data().question || '', d.data().type || '', d.data().options || [])))
      )
      const pending: Record<string, any>[] = []
      for (const q of valid) {
        const key = q.importKey || questionKey(q.question, q.type, q.options)
        if (seen.has(key)) {
          skipped++
          continue
        }
        seen.add(key)
        const targetTopicId = await resolveTopicId(subjectKey, topicId, q.materialName, topicCache, topic)
        const codes = q.tpCodes?.length ? q.tpCodes : topic?.tpCodes || []
        pending.push(cleanPayload({
          ...q,
          importKey: key,
          tp: codes[0] || null,
          tpCodes: codes,
          materialName: q.materialName || topic?.name || null,
          topicId: targetTopicId,
          subjectKey,
          createdAt: serverTimestamp(),
        }))
      }
      for (let i = 0; i < pending.length; i += 400) {
        const batch = writeBatch(db)
        pending.slice(i, i + 400).forEach((payload) => {
          batch.set(doc(collection(db, 'questions')), payload)
        })
        await batch.commit()
        success += Math.min(400, pending.length - i)
      }
      alert(`Impor selesai: ${success} soal baru, ${skipped} dilewati karena sudah ada${removed ? `, ${removed} duplikat lama dihapus` : ''}.`)
      await loadData()
    } catch (err) {
      console.error(err)
      alert('Gagal membaca file. Pastikan format benar.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const cleanDuplicates = async () => {
    if (!topicId) return
    setImporting(true)
    try {
      const removed = await removeDuplicateQuestions(topicId)
      alert(removed ? `${removed} soal duplikat dihapus. Satu salinan setiap soal tetap disimpan.` : 'Tidak ada duplikat pada materi ini.')
      await loadData()
    } catch (err) {
      console.error(err)
      alert('Gagal membersihkan duplikat.')
    } finally {
      setImporting(false)
    }
  }

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const spreadKeys = async () => {
    if (!topicId) return
    if (!confirm('Sebar posisi kunci jawaban pada soal pilihan di materi ini? Isi jawaban tidak berubah, hanya urutan opsi.')) return
    setImporting(true)
    try {
      let n = 0
      for (let i = 0; i < questions.length; i += 400) {
        const batch = writeBatch(db)
        questions.slice(i, i + 400).forEach((q, offset) => {
          if (!q.id || q.type === 'category' || !q.options?.length) return
          const shift = (i + offset) % q.options.length
          if (shift === 0) return
          const options = q.options.map((_, idx) => q.options[(idx + shift) % q.options.length])
          const correctAnswers = q.correctAnswers.map((ans) => (ans - shift + q.options.length) % q.options.length)
          batch.update(doc(db, 'questions', q.id), { options, correctAnswers })
          n++
        })
        await batch.commit()
      }
      alert(n ? `Kunci ${n} soal disebar ke opsi yang berbeda.` : 'Tidak ada soal yang perlu digeser.')
      await loadData()
    } catch (err) {
      console.error(err)
      alert('Gagal menyebar kunci.')
    } finally {
      setImporting(false)
    }
  }

  if (!subject) return null

  const selected = questions[selectedIndex]

  const actions = (
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
      <button
        type="button"
        onClick={cleanDuplicates}
        disabled={importing}
        className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium"
      >
        Bersihkan duplikat
      </button>
      <button
        type="button"
        onClick={spreadKeys}
        disabled={importing || questions.length === 0}
        className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium"
      >
        Sebar kunci
      </button>
      <button
        type="button"
        onClick={() => deleteIds(checkedIds)}
        disabled={importing || checkedIds.length === 0}
        className="inline-flex items-center gap-1.5 bg-white border border-red-100 hover:bg-red-50 disabled:opacity-60 text-red-600 px-3.5 py-2 rounded-xl text-sm font-medium"
      >
        Hapus terpilih ({checkedIds.length})
      </button>
      <button
        type="button"
        onClick={() => deleteIds(questions.map((q) => q.id || ''))}
        disabled={importing || questions.length === 0}
        className="inline-flex items-center gap-1.5 bg-white border border-red-100 hover:bg-red-50 disabled:opacity-60 text-red-600 px-3.5 py-2 rounded-xl text-sm font-medium"
      >
        Hapus semua
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,.xlsx,.xls"
        onChange={handleImportFile}
        className="hidden"
      />
      <button
        onClick={openNew}
        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm shadow-indigo-200"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Tambah Soal
      </button>
    </div>
  )

  return (
    <Layout
      title={topic?.name || 'Materi'}
      subtitle={`${subject.name} · ${questions.length} soal`}
      actions={actions}
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link to="/bank-soal" className="hover:text-indigo-600 transition">Bank Soal</Link>
        <span className="text-gray-300">/</span>
        <Link to={`/bank-soal/${subjectKey}`} className="hover:text-indigo-600 transition">{subject.shortName}</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium truncate">{topic?.name}</span>
      </nav>

      {/* Panduan import singkat */}
      <details className="mb-5 bg-white rounded-xl border border-gray-100 shadow-sm">
        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer select-none">
          Format import soal (JSON / CSV / Excel)
        </summary>
        <div className="px-4 pb-4 text-xs text-gray-600 space-y-2 border-t border-gray-50 pt-3">
          <p>Kolom: <code className="bg-gray-100 px-1 rounded">materi</code>, <code className="bg-gray-100 px-1 rounded">tp</code> (boleh beberapa, pisahkan koma), <code className="bg-gray-100 px-1 rounded">type</code>, <code className="bg-gray-100 px-1 rounded">question</code>, <code className="bg-gray-100 px-1 rounded">optionA–D</code>, <code className="bg-gray-100 px-1 rounded">correctAnswers</code>, <code className="bg-gray-100 px-1 rounded">explanation</code>. Materi yang belum ada akan dibuat di mapel ini.</p>
          <button type="button" onClick={downloadTemplate} className="mt-2 text-indigo-700 font-medium">Unduh template CSV</button>
          <p>Soal yang diimpor otomatis masuk ke materi ini dan pool mapel <strong>{subject.shortName}</strong>.</p>
        </div>
      </details>

      {showEditor && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button type="button" onClick={closeEditor} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Tutup
              </button>
              <span className="text-sm font-semibold text-gray-900">{editingId ? 'Edit Soal' : 'Soal Baru'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-500">Tipe</label>
              <select
                value={form.type}
                onChange={(e) => changeType(e.target.value as QuestionType)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pertanyaan</label>
                <textarea
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none transition text-gray-900 placeholder:text-gray-400"
                  placeholder="Tulis pertanyaan di sini..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">TP (boleh lebih dari satu, pisahkan koma)</label>
                <input
                  type="text"
                  value={form.tpCodes}
                  onChange={(e) => setForm({ ...form, tpCodes: e.target.value, tp: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  placeholder="IPAS-2.1, IPAS-2.2"
                />
                <p className="text-xs text-gray-400 mt-1">Kosongkan untuk memakai TP materi ini: {(topic?.tpCodes || []).join(', ') || 'belum ada'}</p>
              </div>
            </div>

            {form.type === 'category' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Label kategori</label>
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
              </div>
            )}

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
                      placeholder={form.type === 'category' ? `Pernyataan ${index + 1}` : `Opsi ${String.fromCharCode(65 + index)}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      disabled={form.options.length <= 2}
                      className="p-2 text-gray-300 hover:text-red-500 disabled:opacity-30 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {form.options.length < 6 && (
                <button type="button" onClick={addOption} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                  + Tambah {form.type === 'category' ? 'pernyataan' : 'opsi'}
                </button>
              )}
            </div>

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
              <button type="button" onClick={closeEditor} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-6 py-2.5 rounded-xl transition">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Daftar soal</span>
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <input
                type="checkbox"
                checked={questions.length > 0 && checkedIds.length === questions.length}
                onChange={(e) => setCheckedIds(e.target.checked ? questions.map((q) => q.id || '') : [])}
              />
              Pilih semua
            </label>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Memuat...</div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">Belum ada soal</p>
              <button onClick={openNew} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">+ Tambah soal pertama</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition ${
                    selectedIndex === idx ? 'bg-indigo-50/70 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedIds.includes(q.id || '')}
                    onChange={() => q.id && toggleChecked(q.id)}
                    className="mt-1"
                  />
                  <button type="button" onClick={() => setSelectedIndex(idx)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{q.question}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {QUESTION_TYPE_LABELS[q.type] || q.type}
                      {!q.stimulus ? ' · tanpa stimulus' : ''}
                      {(q.tpCodes || (q.tp ? [q.tp] : [])).join(', ') ? ` · TP ${(q.tpCodes || [q.tp]).filter(Boolean).join(', ')}` : ''}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-gray-400 text-sm">Pilih soal di daftar atau tambah soal baru</div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                  <span>Soal {selectedIndex + 1}/{questions.length}</span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                    {QUESTION_TYPE_LABELS[selected.type]}
                  </span>
                  {selected.tp && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-50 text-xs font-medium text-violet-700">
                      TP {selected.tp}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(selected)} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition">
                    Edit
                  </button>
                  <button onClick={() => selected.id && handleDelete(selected.id)} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition">
                    Hapus
                  </button>
                </div>
              </div>
              <div className="p-6">
                {selected.stimulus ? (
                  <div className="mb-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{selected.stimulus}</div>
                ) : (
                  <p className="mb-4 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Soal ini belum punya stimulus. Tambahkan jika jawaban bergantung pada teks.</p>
                )}
                <p className="text-base font-medium text-gray-900 leading-relaxed mb-5">{selected.question}</p>
                {selected.type === 'category' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400 mb-2">
                      Kategori: {(selected.categoryLabels || DEFAULT_CATEGORY_LABELS).join(' / ')}
                    </p>
                    {selected.options.map((stmt, i) => {
                      const labels = selected.categoryLabels || DEFAULT_CATEGORY_LABELS
                      const ans = selected.correctAnswers[i]
                      return (
                        <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
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
                            correct ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                            correct ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-gray-500'
                          }`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <p className={`text-sm ${correct ? 'text-emerald-900 font-medium' : 'text-gray-700'}`}>{opt}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
                {selected.explanation && (
                  <div className="mt-6 pt-5 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pembahasan</p>
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
