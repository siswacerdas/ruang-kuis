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
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  SUBJECTS,
  getSubject,
  generateToken,
  QUESTION_TYPE_LABELS,
  type LatihanPaket,
  type LatihanStatus,
  type Question,
  type QuestionType,
  type SubjectKey,
  type Topic,
} from '../types/question'

type BuildMode = 'manual' | 'auto'

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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Generate soal otomatis dari pool.
 * - balancedByTp: usahakan sebaran merata antar TP yang ada
 * - topicIds: batasi materi (kosong = semua)
 * - types: batasi tipe soal (kosong = semua)
 */
function generateQuestions(
  pool: Question[],
  count: number,
  opts: { topicIds?: string[]; types?: QuestionType[]; balancedByTp?: boolean }
): string[] {
  let list = pool.filter((q) => q.id)
  if (opts.topicIds && opts.topicIds.length > 0) {
    list = list.filter((q) => opts.topicIds!.includes(q.topicId))
  }
  if (opts.types && opts.types.length > 0) {
    list = list.filter((q) => opts.types!.includes(q.type))
  }
  if (list.length === 0) return []

  if (!opts.balancedByTp) {
    return shuffleArray(list)
      .slice(0, Math.min(count, list.length))
      .map((q) => q.id!)
  }

  // Group by TP (empty TP -> "_")
  const groups = new Map<string, Question[]>()
  for (const q of list) {
    const key = (q.tp || '').trim() || '_'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(q)
  }
  // Shuffle inside groups
  for (const [k, arr] of groups) {
    groups.set(k, shuffleArray(arr))
  }

  const keys = shuffleArray([...groups.keys()])
  const picked: Question[] = []
  let guard = 0
  while (picked.length < count && guard < count * 20) {
    guard++
    let added = false
    for (const key of keys) {
      const g = groups.get(key)!
      if (g.length > 0 && picked.length < count) {
        picked.push(g.shift()!)
        added = true
      }
    }
    if (!added) break
  }
  return picked.map((q) => q.id!)
}

export default function LatihanForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isNew = !id || id === 'baru'
  const navigate = useNavigate()

  const initialMode = (searchParams.get('mode') === 'auto' ? 'auto' : 'manual') as BuildMode

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [buildMode, setBuildMode] = useState<BuildMode>(initialMode)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subjectKey, setSubjectKey] = useState<SubjectKey | ''>('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [token, setToken] = useState(generateToken())
  const [status, setStatus] = useState<LatihanStatus>('draft')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [showScoreImmediately, setShowScoreImmediately] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Bank
  const [topics, setTopics] = useState<Topic[]>([])
  const [bankQuestions, setBankQuestions] = useState<Question[]>([])
  const [filterTopicId, setFilterTopicId] = useState('')
  const [bankLoading, setBankLoading] = useState(false)

  // Auto generate options
  const [autoCount, setAutoCount] = useState(10)
  const [autoTopicIds, setAutoTopicIds] = useState<string[]>([])
  const [autoTypes, setAutoTypes] = useState<QuestionType[]>([])
  const [autoBalancedTp, setAutoBalancedTp] = useState(true)
  const [autoMessage, setAutoMessage] = useState('')

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
      setBuildMode('manual')
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

  const poolForAuto = useMemo(() => {
    let list = bankQuestions
    if (autoTopicIds.length > 0) {
      list = list.filter((q) => autoTopicIds.includes(q.topicId))
    }
    if (autoTypes.length > 0) {
      list = list.filter((q) => autoTypes.includes(q.type))
    }
    return list
  }, [bankQuestions, autoTopicIds, autoTypes])

  const toggleQuestion = (qid: string) => {
    setSelectedIds((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
    )
  }

  const selectAllFiltered = () => {
    const ids = filteredBank.map((q) => q.id!).filter(Boolean)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
  }

  const clearSelection = () => {
    setSelectedIds([])
    setAutoMessage('')
  }

  const toggleAutoTopic = (tid: string) => {
    setAutoTopicIds((prev) =>
      prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]
    )
  }

  const toggleAutoType = (t: QuestionType) => {
    setAutoTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const runAutoGenerate = () => {
    setAutoMessage('')
    if (!subjectKey) {
      setAutoMessage('Pilih mata pelajaran dulu.')
      return
    }
    if (poolForAuto.length === 0) {
      setAutoMessage('Tidak ada soal yang cocok dengan filter. Periksa materi/tipe atau isi bank soal.')
      return
    }
    const n = Math.max(1, Math.min(autoCount, 100))
    const ids = generateQuestions(bankQuestions, n, {
      topicIds: autoTopicIds.length > 0 ? autoTopicIds : undefined,
      types: autoTypes.length > 0 ? autoTypes : undefined,
      balancedByTp: autoBalancedTp,
    })
    setSelectedIds(ids)
    if (ids.length < n) {
      setAutoMessage(`Hanya ${ids.length} soal tersedia (diminta ${n}). Paket diisi dengan semua yang ada.`)
    } else {
      setAutoMessage(`Berhasil generate ${ids.length} soal${autoBalancedTp ? ' (sebaran TP merata)' : ' (acak)'}.`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Judul latihan wajib diisi')
      return
    }
    if (selectedIds.length === 0) {
      setError('Belum ada soal di paket. Pilih manual atau generate otomatis.')
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
      subtitle="Susun paket soal secara manual atau generate otomatis dari bank soal"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mata pelajaran *</label>
              <select
                value={subjectKey}
                onChange={(e) => {
                  setSubjectKey(e.target.value as SubjectKey | '')
                  setFilterTopicId('')
                  setAutoTopicIds([])
                  setSelectedIds([])
                  setAutoMessage('')
                }}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm"
                required
              >
                <option value="">— Pilih mapel (pool soal) —</option>
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
                <option value="scheduled">Terjadwal (aktif sesuai waktu)</option>
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

        {/* ===== PILIH / GENERATE SOAL ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Susunan soal
              <span className="ml-2 text-xs font-normal text-gray-500">{selectedIds.length} soal dipilih</span>
            </h2>
            {selectedIds.length > 0 && (
              <button type="button" onClick={clearSelection} className="text-xs text-gray-500 hover:text-red-600">
                Kosongkan pilihan
              </button>
            )}
          </div>

          {/* Mode switch */}
          <div className="flex p-1 bg-gray-100 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setBuildMode('manual')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition ${
                buildMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setBuildMode('auto')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition ${
                buildMode === 'auto' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Otomatis (Generate)
            </button>
          </div>

          {!subjectKey && (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
              Pilih mata pelajaran di atas agar pool soal dimuat.
            </p>
          )}

          {/* ---- MODE MANUAL ---- */}
          {buildMode === 'manual' && subjectKey && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Centang soal satu per satu dari bank. Filter materi untuk mempersempit daftar.
              </p>
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
                <span className="text-xs text-gray-400">
                  {bankLoading ? 'Memuat...' : `${filteredBank.length} soal ditampilkan`}
                </span>
              </div>

              {bankLoading ? (
                <p className="text-sm text-gray-500 py-6 text-center">Memuat bank soal...</p>
              ) : filteredBank.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  Tidak ada soal. Isi Bank Soal untuk mapel ini terlebih dahulu.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                  {filteredBank.map((q) => {
                    const checked = selectedIds.includes(q.id!)
                    return (
                      <label
                        key={q.id}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${
                          checked ? 'bg-indigo-50' : 'hover:bg-gray-50'
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

          {/* ---- MODE OTOMATIS ---- */}
          {buildMode === 'auto' && subjectKey && (
            <div className="space-y-4 border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
              <p className="text-xs text-indigo-800">
                Sistem memilih soal secara acak dari pool mapel. Atur jumlah, materi, tipe, dan opsi sebaran TP.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Jumlah soal</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={autoCount}
                    onChange={(e) => setAutoCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">Pool cocok: {poolForAuto.length} soal</p>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm pb-2">
                    <input
                      type="checkbox"
                      checked={autoBalancedTp}
                      onChange={(e) => setAutoBalancedTp(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Sebaran TP merata
                  </label>
                </div>
              </div>

              {/* Filter materi */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Materi sumber <span className="text-gray-400 font-normal">(kosong = semua)</span>
                </p>
                {topics.length === 0 ? (
                  <p className="text-xs text-gray-400">Belum ada materi di mapel ini.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topics.map((t) => {
                      const on = autoTopicIds.includes(t.id!)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleAutoTopic(t.id!)}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                            on
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                          }`}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Filter tipe */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Tipe soal <span className="text-gray-400 font-normal">(kosong = semua)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => {
                    const on = autoTypes.includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleAutoType(t)}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                          on
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300'
                        }`}
                      >
                        {QUESTION_TYPE_LABELS[t]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runAutoGenerate}
                  disabled={bankLoading}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition shadow-sm shadow-indigo-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generate Soal
                </button>
                <button
                  type="button"
                  onClick={() => { setAutoCount(10); runAutoGenerate() }}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Cepat: 10 soal
                </button>
                <button
                  type="button"
                  onClick={() => { setAutoCount(20); runAutoGenerate() }}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Cepat: 20 soal
                </button>
              </div>

              {autoMessage && (
                <p className={`text-sm px-3 py-2 rounded-xl ${
                  autoMessage.includes('Berhasil') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                }`}>
                  {autoMessage}
                </p>
              )}
            </div>
          )}

          {/* Ringkasan pilihan */}
          {selectedIds.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">
                {selectedIds.length} soal siap masuk paket
                {subjectKey && getSubject(subjectKey) && (
                  <> · pool <strong>{getSubject(subjectKey)!.shortName}</strong></>
                )}
                {shuffleQuestions ? ' · urutan akan diacak saat siswa mengerjakan' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedIds.slice(0, 30).map((qid, i) => {
                  const q = bankQuestions.find((x) => x.id === qid)
                  return (
                    <span
                      key={qid}
                      className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md"
                      title={q?.question}
                    >
                      #{i + 1}
                      {q?.tp ? ` TP ${q.tp}` : ''}
                      <button
                        type="button"
                        onClick={() => toggleQuestion(qid)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
                {selectedIds.length > 30 && (
                  <span className="text-[11px] text-gray-400">+{selectedIds.length - 30} lainnya</span>
                )}
              </div>
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
