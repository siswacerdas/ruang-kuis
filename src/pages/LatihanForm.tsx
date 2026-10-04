import { useEffect, useState, useMemo } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  generateToken,
  formatDateTime,
  QUESTION_TYPE_LABELS,
  type LatihanPaket,
  type LatihanStatus,
  type Question,
  type SubjectKey,
  type Topic,
} from '../types/question'

function toLocalInputValue(v: any): string {
  if (!v) return ''
  let d: Date
  if (v?.toDate) d = v.toDate()
  else if (v?.seconds) d = new Date(v.seconds * 1000)
  else d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(s: string): Timestamp | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return Timestamp.fromDate(d)
}

export default function LatihanForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'baru'
  const navigate = useNavigate()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subjectKey, setSubjectKey] = useState<SubjectKey | ''>('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [token, setToken] = useState(generateToken())
  const [status, setStatus] = useState<LatihanStatus>('draft')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0)
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [showScoreImmediately, setShowScoreImmediately] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Bank data for picker
  const [topics, setTopics] = useState<Topic[]>([])
  const [bankQuestions, setBankQuestions] = useState<Question[]>([])
  const [filterTopicId, setFilterTopicId] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bankLoading, setBankLoading] = useState(false)

  useEffect(() => {
    if (!isNew && id) loadPaket(id)
  }, [id])

  useEffect(() => {
    if (subjectKey) loadBank(subjectKey)
    else {
      setTopics([])
      setBankQuestions([])
    }
  }, [subjectKey])

  const loadPaket = async (paketId: string) => {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'latihan', paketId))
      if (!snap.exists()) {
        navigate('/latihan-soal')
        return
      }
      const p = { id: snap.id, ...snap.data() } as LatihanPaket
      setTitle(p.title)
      setDescription(p.description || '')
      setSubjectKey(p.subjectKey || '')
      setStartAt(toLocalInputValue(p.startAt))
      setEndAt(toLocalInputValue(p.endAt))
      setToken(p.token)
      setStatus(p.status)
      setTimeLimitMinutes(p.timeLimitMinutes || 0)
      setShuffleQuestions(!!p.shuffleQuestions)
      setShuffleOptions(!!p.shuffleOptions)
      setShowScoreImmediately(p.showScoreImmediately !== false)
      setSelectedIds(p.questionIds || [])
    } catch (err) {
      console.error(err)
      navigate('/latihan-soal')
    } finally {
      setLoading(false)
    }
  }

  const loadBank = async (sk: SubjectKey) => {
    setBankLoading(true)
    try {
      const [tSnap, qSnap] = await Promise.all([
        getDocs(query(collection(db, 'topics'), where('subjectKey', '==', sk))),
        getDocs(query(collection(db, 'questions'), where('subjectKey', '==', sk))),
      ])
      setTopics(tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Topic)))
      setBankQuestions(qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question)))
    } catch (err) {
      console.error(err)
    } finally {
      setBankLoading(false)
    }
  }

  const filteredBank = useMemo(() => {
    let list = bankQuestions
    if (filterTopicId) list = list.filter((q) => q.topicId === filterTopicId)
    return list
  }, [bankQuestions, filterTopicId])

  const toggleQuestion = (qid: string) => {
    setSelectedIds((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
    )
  }

  const selectAllFiltered = () => {
    const ids = filteredBank.map((q) => q.id!).filter(Boolean)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
  }

  const clearSelection = () => setSelectedIds([])

  /** Generate acak N soal dari bank (filter topic opsional) */
  const generateRandom = (n: number) => {
    const pool = [...filteredBank].filter((q) => q.id)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    setSelectedIds(pool.slice(0, Math.min(n, pool.length)).map((q) => q.id!))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Judul latihan wajib diisi')
      return
    }
    if (selectedIds.length === 0) {
      setError('Pilih minimal satu soal dari bank')
      return
    }
    const start = fromLocalInput(startAt)
    const end = fromLocalInput(endAt)
    if (!start || !end) {
      setError('Jadwal mulai dan selesai wajib diisi')
      return
    }
    if (end.toMillis() <= start.toMillis()) {
      setError('Waktu selesai harus setelah waktu mulai')
      return
    }
    if (!token.trim()) {
      setError('Token akses wajib diisi')
      return
    }

    setSaving(true)
    try {
      const payload: Omit<LatihanPaket, 'id'> = {
        title: title.trim(),
        description: description.trim() || undefined,
        subjectKey: subjectKey || undefined,
        questionIds: selectedIds,
        questionCount: selectedIds.length,
        startAt: start,
        endAt: end,
        token: token.trim().toUpperCase(),
        status,
        timeLimitMinutes: timeLimitMinutes > 0 ? timeLimitMinutes : undefined,
        shuffleQuestions,
        shuffleOptions,
        showScoreImmediately,
        updatedAt: serverTimestamp(),
      }

      if (isNew) {
        await addDoc(collection(db, 'latihan'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
      } else if (id) {
        await updateDoc(doc(db, 'latihan', id), payload as any)
      }
      navigate('/latihan-soal')
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan paket latihan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Layout title="Latihan Soal">
        <div className="text-center py-16 text-gray-500 text-sm">Memuat...</div>
      </Layout>
    )
  }

  const topicName = (tid: string) => topics.find((t) => t.id === tid)?.name || '—'

  return (
    <Layout
      title={isNew ? 'Buat Latihan' : 'Edit Latihan'}
      subtitle="Atur soal, jadwal, token, dan pengaturan paket"
    >
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/latihan-soal" className="hover:text-indigo-600 transition">Latihan Soal</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{isNew ? 'Baru' : 'Edit'}</span>
      </nav>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* Info dasar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Informasi paket</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Judul *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              placeholder="Contoh: Latihan ATS IPAS Semester 1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Deskripsi</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
              placeholder="Keterangan singkat untuk siswa / guru..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mata pelajaran</label>
              <select
                value={subjectKey}
                onChange={(e) => {
                  setSubjectKey(e.target.value as SubjectKey | '')
                  setFilterTopicId('')
                  setSelectedIds([])
                }}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm"
              >
                <option value="">— Pilih mapel (untuk pool soal) —</option>
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status awal</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LatihanStatus)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm"
              >
                <option value="draft">Draf (belum dipublikasi)</option>
                <option value="scheduled">Terjadwal (otomatis aktif sesuai waktu)</option>
                <option value="active">Aktif sekarang</option>
              </select>
            </div>
          </div>
        </div>

        {/* Jadwal & token */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Jadwal & akses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mulai *</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Selesai *</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Token akses siswa *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none font-mono tracking-wider text-sm"
                  maxLength={12}
                  required
                />
                <button
                  type="button"
                  onClick={() => setToken(generateToken())}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >
                  Acak
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Siswa memasukkan token ini untuk masuk ke latihan</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Batas waktu (menit)</label>
              <input
                type="number"
                min={0}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value, 10) || 0)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                placeholder="0 = tanpa batas"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Acak urutan soal
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Acak opsi jawaban
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showScoreImmediately} onChange={(e) => setShowScoreImmediately(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Tampilkan skor setelah selesai
            </label>
          </div>
        </div>

        {/* Pilih soal */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Soal dalam paket
              <span className="ml-2 text-xs font-normal text-gray-500">{selectedIds.length} dipilih</span>
            </h2>
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              disabled={!subjectKey}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:text-gray-300"
            >
              {pickerOpen ? 'Tutup pemilih soal' : 'Buka pemilih soal'}
            </button>
          </div>

          {!subjectKey && (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
              Pilih mata pelajaran terlebih dahulu untuk memuat pool soal.
            </p>
          )}

          {pickerOpen && subjectKey && (
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={filterTopicId}
                  onChange={(e) => setFilterTopicId(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="">Semua materi</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button type="button" onClick={selectAllFiltered} className="text-xs font-medium text-indigo-600 px-2 py-1 hover:bg-indigo-50 rounded-lg">
                  Pilih semua terfilter
                </button>
                <button type="button" onClick={clearSelection} className="text-xs font-medium text-gray-500 px-2 py-1 hover:bg-gray-100 rounded-lg">
                  Kosongkan
                </button>
                <button type="button" onClick={() => generateRandom(10)} className="text-xs font-medium text-emerald-600 px-2 py-1 hover:bg-emerald-50 rounded-lg">
                  Generate 10 acak
                </button>
                <button type="button" onClick={() => generateRandom(20)} className="text-xs font-medium text-emerald-600 px-2 py-1 hover:bg-emerald-50 rounded-lg">
                  Generate 20 acak
                </button>
              </div>

              {bankLoading ? (
                <p className="text-sm text-gray-500 py-4 text-center">Memuat bank soal...</p>
              ) : filteredBank.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Tidak ada soal di pool ini. Tambah di Bank Soal dulu.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredBank.map((q) => {
                    const checked = selectedIds.includes(q.id!)
                    return (
                      <label
                        key={q.id}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${
                          checked ? 'bg-indigo-50' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleQuestion(q.id!)}
                          className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="min-w-0">
                          <p className="text-gray-800 line-clamp-2">{q.question}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {topicName(q.topicId)} · {QUESTION_TYPE_LABELS[q.type]}
                            {q.tp ? ` · TP ${q.tp}` : ''}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selected summary */}
          {selectedIds.length > 0 && (
            <div className="text-xs text-gray-500">
              {selectedIds.length} soal akan masuk paket
              {subjectKey && getSubject(subjectKey) && (
                <> (pool <strong>{getSubject(subjectKey)!.shortName}</strong>)</>
              )}
              . Urutan saat siswa mengerjakan mengikuti urutan pemilihan
              {shuffleQuestions ? ' (akan diacak)' : ''}.
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium px-6 py-2.5 rounded-xl transition shadow-sm shadow-indigo-200"
          >
            {saving ? 'Menyimpan...' : isNew ? 'Buat Paket' : 'Simpan Perubahan'}
          </button>
          <Link
            to="/latihan-soal"
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-6 py-2.5 rounded-xl transition"
          >
            Batal
          </Link>
        </div>
      </form>
    </Layout>
  )
}
