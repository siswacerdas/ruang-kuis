import { useEffect, useRef, useState, useMemo } from 'react'
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
import QuestionQuickEdit from '../components/QuestionQuickEdit'
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

function generateQuestions(
  pool: Question[],
  count: number,
  opts: {
    topicIds?: string[]
    types?: QuestionType[]
    balancedByTp?: boolean
    excludeIds?: Set<string>
    fillFromExcluded?: boolean
  }
): string[] {
  let list = pool.filter((q) => q.id)
  if (opts.topicIds && opts.topicIds.length > 0) {
    list = list.filter((q) => opts.topicIds!.includes(q.topicId))
  }
  if (opts.types && opts.types.length > 0) {
    list = list.filter((q) => opts.types!.includes(q.type))
  }
  if (list.length === 0) return []

  const excluded = opts.excludeIds
  let primary = list
  let secondary: Question[] = []
  if (excluded && excluded.size > 0) {
    primary = list.filter((q) => !excluded.has(q.id!))
    if (opts.fillFromExcluded) {
      secondary = list.filter((q) => excluded.has(q.id!))
    }
  }

  const pick = (src: Question[], n: number): Question[] => {
    if (n <= 0 || src.length === 0) return []
    if (!opts.balancedByTp) return shuffleArray(src).slice(0, n)
    const byTp = new Map<string, Question[]>()
    src.forEach((q) => {
      const key = (q.tpCodes && q.tpCodes[0]) || q.tp || '_'
      if (!byTp.has(key)) byTp.set(key, [])
      byTp.get(key)!.push(q)
    })
    const buckets = [...byTp.values()].map((b) => shuffleArray(b))
    const out: Question[] = []
    let guard = 0
    while (out.length < n && guard < n * 20) {
      guard++
      let added = false
      for (const b of buckets) {
        if (out.length >= n) break
        const q = b.shift()
        if (q) {
          out.push(q)
          added = true
        }
      }
      if (!added) break
    }
    return out
  }

  let chosen = pick(primary, count)
  if (chosen.length < count && secondary.length) {
    const need = count - chosen.length
    const ids = new Set(chosen.map((q) => q.id))
    chosen = chosen.concat(pick(secondary.filter((q) => !ids.has(q.id!)), need))
  }
  return chosen.map((q) => q.id!)
}

export default function LatihanForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'baru'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [buildMode, setBuildMode] = useState<BuildMode>('manual')

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
  const [audienceAll, setAudienceAll] = useState(true)
  const [assignedClassesText, setAssignedClassesText] = useState('5A')
  const [allowRetry, setAllowRetry] = useState(false)
  const [requireToken, setRequireToken] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [topics, setTopics] = useState<Topic[]>([])
  const [bankQuestions, setBankQuestions] = useState<Question[]>([])
  const [filterTopicId, setFilterTopicId] = useState('')
  const [bankLoading, setBankLoading] = useState(false)

  const [autoCount, setAutoCount] = useState(10)
  const [autoBalancedTp, setAutoBalancedTp] = useState(true)
  const [autoMessage, setAutoMessage] = useState('')
  const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set())
  const [preferUnused, setPreferUnused] = useState(true)
  const [showUnusedOnly, setShowUnusedOnly] = useState(false)

  const [editQuestion, setEditQuestion] = useState<Question | null>(null)

  useEffect(() => {
    if (!isNew && id) loadPaket(id)
  }, [id])

  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

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
      setTitle(p.title || '')
      setDescription(p.description || '')
      setSubjectKey((p.subjectKey as SubjectKey) || '')
      setStartAt(toLocalInputValue(p.startAt))
      setEndAt(toLocalInputValue(p.endAt))
      setToken(p.token || generateToken())
      setStatus(p.status || 'draft')
      setTimeLimitMinutes(p.timeLimitMinutes || 0)
      setShuffleQuestions(p.shuffleQuestions !== false)
      setShuffleOptions(!!p.shuffleOptions)
      setShowScoreImmediately(p.showScoreImmediately !== false)
      const classes = p.assignedClasses || []
      const ids = p.assignedStudentIds || []
      const isAll = classes.length === 0 && ids.length === 0
      setAudienceAll(isAll)
      setAssignedClassesText(classes.length ? classes.join(', ') : '5A')
      setAllowRetry(!!p.allowRetry)
      setRequireToken(!!p.requireToken)
      setSelectedIds(p.questionIds || [])

      try {
        const all = await getDocs(collection(db, 'latihan'))
        const used = new Set<string>()
        all.docs.forEach((d) => {
          if (d.id === paketId) return
          const qids = (d.data().questionIds || []) as string[]
          qids.forEach((qid) => used.add(qid))
        })
        setUsedQuestionIds(used)
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error(err)
      setError('Gagal memuat paket')
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

      if (isNew) {
        try {
          const all = await getDocs(collection(db, 'latihan'))
          const used = new Set<string>()
          all.docs.forEach((d) => {
            const qids = (d.data().questionIds || []) as string[]
            qids.forEach((qid) => used.add(qid))
          })
          setUsedQuestionIds(used)
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setBankLoading(false)
    }
  }

  const filteredBank = useMemo(() => {
    let list = bankQuestions
    if (filterTopicId) list = list.filter((q) => q.topicId === filterTopicId)
    if (showUnusedOnly) list = list.filter((q) => q.id && !usedQuestionIds.has(q.id))
    return list
  }, [bankQuestions, filterTopicId, showUnusedOnly, usedQuestionIds])

  const toggleQuestion = (qid: string) => {
    setSelectedIds((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
    )
  }

  const selectAllFiltered = () => {
    const ids = filteredBank.map((q) => q.id!).filter(Boolean)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }

  const clearSelection = () => setSelectedIds([])

  const runAutoGenerate = () => {
    setAutoMessage('')
    const ids = generateQuestions(bankQuestions, autoCount, {
      balancedByTp: autoBalancedTp,
      excludeIds: preferUnused ? usedQuestionIds : undefined,
      fillFromExcluded: true,
    })
    if (ids.length === 0) {
      setAutoMessage('Tidak ada soal yang cocok dengan filter.')
      return
    }
    setSelectedIds(ids)
    setAutoMessage(
      ids.length < autoCount
        ? `Terpilih ${ids.length} soal (pool tidak cukup untuk ${autoCount}).`
        : `Terpilih ${ids.length} soal.`
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Judul paket wajib diisi')
      return
    }
    if (selectedIds.length === 0) {
      setError('Pilih minimal satu soal')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        subjectKey: subjectKey || null,
        startAt: fromLocalInput(startAt),
        endAt: fromLocalInput(endAt),
        token: token.trim().toUpperCase() || generateToken(),
        status,
        timeLimitMinutes: Number(timeLimitMinutes) || 0,
        shuffleQuestions,
        shuffleOptions,
        showScoreImmediately,
        allowRetry,
        requireToken,
        questionIds: selectedIds,
        questionCount: selectedIds.length,
        updatedAt: serverTimestamp(),
      }
      if (audienceAll) {
        payload.assignedClasses = []
        payload.assignedStudentIds = []
      } else {
        payload.assignedClasses = assignedClassesText
          .split(/[,;]/)
          .map((c) => c.trim())
          .filter(Boolean)
        payload.assignedStudentIds = []
      }
      if (isNew) {
        payload.createdAt = serverTimestamp()
        await addDoc(collection(db, 'latihan'), payload)
      } else if (id) {
        await updateDoc(doc(db, 'latihan', id), payload)
      }
      navigate('/latihan-soal')
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan paket')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Layout title="Latihan Soal">
        <p className="text-gray-500 text-sm">Memuat paket...</p>
      </Layout>
    )
  }

  return (
    <Layout title="Latihan Soal">
      <div className="mb-4 text-sm text-gray-500">
        <Link to="/latihan-soal" className="hover:text-indigo-600 transition">
          Latihan Soal
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-gray-800 font-medium">{isNew ? 'Paket baru' : 'Edit paket'}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div ref={errorRef} className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Informasi paket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Judul</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mata pelajaran (pool soal)</label>
              <select
                value={subjectKey}
                onChange={(e) => setSubjectKey(e.target.value as SubjectKey | '')}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
              >
                <option value="">— Pilih mapel (pool soal) —</option>
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.icon} {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LatihanStatus)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
              >
                <option value="draft">Draf</option>
                <option value="scheduled">Terjadwal</option>
                <option value="active">Aktif</option>
                <option value="finished">Selesai</option>
                <option value="archived">Arsip</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mulai</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Selesai</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Token</label>
              <div className="flex gap-2">
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setToken(generateToken())}
                  className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Acak
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Batas waktu (menit, 0 = tanpa batas)</label>
              <input
                type="number"
                min={0}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 0)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="accent-indigo-600" />
              Acak urutan soal
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="accent-indigo-600" />
              Acak opsi
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={showScoreImmediately} onChange={(e) => setShowScoreImmediately(e.target.checked)} className="accent-indigo-600" />
              Tampilkan skor segera
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={allowRetry} onChange={(e) => setAllowRetry(e.target.checked)} className="accent-indigo-600" />
              Izinkan ulang
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={requireToken} onChange={(e) => setRequireToken(e.target.checked)} className="accent-indigo-600" />
              Wajib token
            </label>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={audienceAll} onChange={(e) => setAudienceAll(e.target.checked)} className="accent-indigo-600" />
              Semua siswa
            </label>
            {!audienceAll && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kelas (pisah koma)</label>
                <input
                  value={assignedClassesText}
                  onChange={(e) => setAssignedClassesText(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50"
                  placeholder="5A, 5B"
                />
              </div>
            )}
          </div>
        </div>

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
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={showUnusedOnly}
                    onChange={(e) => setShowUnusedOnly(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  Hanya belum dipakai paket lain
                </label>
                <button type="button" onClick={selectAllFiltered} className="text-xs text-indigo-600 font-medium">
                  Pilih semua terfilter
                </button>
              </div>
              {bankLoading ? (
                <p className="text-sm text-gray-400">Memuat bank soal…</p>
              ) : filteredBank.length === 0 ? (
                <p className="text-sm text-gray-400">Tidak ada soal. Isi Bank Soal untuk mapel ini terlebih dahulu.</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                  {filteredBank.map((q) => {
                    const checked = selectedIds.includes(q.id!)
                    return (
                      <li key={q.id}>
                        <label className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestion(q.id!)}
                            className="mt-1 accent-indigo-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="text-gray-800 text-sm line-clamp-2">{q.question}</span>
                            <span className="block text-[11px] text-gray-400">
                              {QUESTION_TYPE_LABELS[q.type]}
                              {q.tp ? ` · TP ${q.tp}` : ''}
                              {q.id && usedQuestionIds.has(q.id) ? ' · dipakai paket lain' : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {buildMode === 'auto' && subjectKey && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Sistem memilih soal dari pool mapel. Secara default menghindari soal yang sudah dipakai di paket
                lain (jika masih cukup).
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Jumlah soal</label>
                  <input
                    type="number"
                    min={1}
                    value={autoCount}
                    onChange={(e) => setAutoCount(Number(e.target.value) || 1)}
                    className="w-24 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 pb-1.5">
                  <input
                    type="checkbox"
                    checked={autoBalancedTp}
                    onChange={(e) => setAutoBalancedTp(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  Seimbangkan TP
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 pb-1.5">
                  <input
                    type="checkbox"
                    checked={preferUnused}
                    onChange={(e) => setPreferUnused(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  Utamakan belum terpakai
                </label>
                <button
                  type="button"
                  onClick={runAutoGenerate}
                  className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700"
                >
                  Generate Soal
                </button>
              </div>
              {autoMessage && (
                <p
                  className={`text-xs px-3 py-2 rounded-lg ${
                    autoMessage.includes('Tidak')
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {autoMessage}
                </p>
              )}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-gray-500">
                  {selectedIds.length} soal dalam paket
                  {subjectKey && getSubject(subjectKey) && (
                    <> · pool <strong>{getSubject(subjectKey)!.shortName}</strong></>
                  )}
                  {shuffleQuestions ? ' · urutan diacak saat dikerjakan' : ''}
                </p>
                <p className="text-[11px] text-indigo-600 font-medium">
                  Klik Edit untuk memperbaiki soal tanpa meninggalkan paket
                </p>
              </div>
              <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {selectedIds.map((qid, i) => {
                  const q = bankQuestions.find((x) => x.id === qid)
                  if (!q) {
                    return (
                      <li
                        key={qid}
                        className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100"
                      >
                        <span className="font-mono text-xs w-7 shrink-0">#{i + 1}</span>
                        <span className="flex-1 truncate">Soal tidak ditemukan di pool mapel</span>
                        <button
                          type="button"
                          onClick={() => toggleQuestion(qid)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Hapus
                        </button>
                      </li>
                    )
                  }
                  const typeLabel = QUESTION_TYPE_LABELS[q.type] || q.type
                  return (
                    <li
                      key={qid}
                      className="bg-gray-50 hover:bg-white border border-gray-100 hover:border-indigo-100 rounded-xl px-3 py-2.5 transition"
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[11px] text-gray-400 w-7 shrink-0 pt-0.5">#{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {typeLabel}
                            </span>
                            {q.tp && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                TP {q.tp}
                              </span>
                            )}
                            {q.skor != null && q.skor > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800">
                                skor {q.skor}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800 line-clamp-2">{q.question}</p>
                          {q.options?.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">
                              {q.options
                                .map((o, oi) => `${String.fromCharCode(65 + oi)}. ${o}`)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditQuestion(q)}
                            className="text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100 transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleQuestion(qid)}
                            className="text-xs text-gray-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
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

      {editQuestion && (
        <QuestionQuickEdit
          question={editQuestion}
          onClose={() => setEditQuestion(null)}
          onSaved={(updated) => {
            setBankQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
            setEditQuestion(null)
          }}
        />
      )}
    </Layout>
  )
}
