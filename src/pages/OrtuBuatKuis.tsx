import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureParentSession } from '../lib/parentSession'
import type { ParentSession } from '../types/parent'
import {
  SUBJECTS,
  getSubject,
  type SubjectKey,
  type Topic,
  type Question,
} from '../types/question'
import { PRACTICE_COUNTS, type PracticeCount } from '../types/practice'
import OrtuLayout from '../components/OrtuLayout'

type ChildInfo = { id: string; fullName: string; className?: string }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Orang tua membuat paket latihan mandiri untuk anak (reuse bank soal + practiceSessions).
 * Anak mengerjakan lewat /siswa → Latihan Mandiri.
 */
export default function OrtuBuatKuis() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ParentSession | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [subjectKey, setSubjectKey] = useState<SubjectKey | ''>('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [count, setCount] = useState<PracticeCount>(15)
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    sessionId: string
    title: string
    questionCount: number
    childName: string
  } | null>(null)
  const [pendingForChild, setPendingForChild] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureParentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login?tab=ortu', { replace: true })
        return
      }
      setSession(s)

      const kids: ChildInfo[] = []
      for (const id of s.studentIds || []) {
        try {
          const snap = await getDoc(doc(db, 'students', id))
          if (snap.exists()) {
            const d = snap.data()
            kids.push({
              id: snap.id,
              fullName: String(d.fullName || 'Siswa'),
              className: d.className ? String(d.className) : undefined,
            })
          } else kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        } catch {
          kids.push({ id, fullName: `Siswa (${id.slice(0, 6)}…)` })
        }
      }
      if (!cancelled) {
        setChildren(kids)
        setSelectedChildId(kids[0]?.id || '')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0]

  useEffect(() => {
    if (!selectedChild?.id) {
      setPendingForChild(0)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'practiceSessions'),
            where('studentId', '==', selectedChild.id),
            where('status', '==', 'in_progress')
          )
        )
        if (!cancelled) setPendingForChild(snap.size)
      } catch {
        if (!cancelled) setPendingForChild(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedChild?.id, success])

  useEffect(() => {
    if (!subjectKey) {
      setTopics([])
      setSelectedTopicIds([])
      return
    }
    setLoadingTopics(true)
    setSelectedTopicIds([])
    ;(async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'topics'), where('subjectKey', '==', subjectKey))
        )
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Topic))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'))
        setTopics(list)
      } catch (err) {
        console.error(err)
        setError('Gagal memuat materi')
      } finally {
        setLoadingTopics(false)
      }
    })()
  }, [subjectKey])

  const toggleTopic = (id: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectAllTopics = () => {
    setSelectedTopicIds(topics.map((t) => t.id!).filter(Boolean))
  }

  const subject = subjectKey ? getSubject(subjectKey) : null

  const titlePreview = useMemo(() => {
    if (!subject) return 'Latihan dari orang tua'
    if (selectedTopicIds.length === 0) return `Latihan ortu · ${subject.shortName}`
    if (selectedTopicIds.length === 1) {
      const t = topics.find((x) => x.id === selectedTopicIds[0])
      return `Latihan ortu · ${t?.name || subject.shortName}`
    }
    return `Latihan ortu · ${subject.shortName} (${selectedTopicIds.length} materi)`
  }, [subject, selectedTopicIds, topics])

  const createQuiz = async () => {
    if (!session || !selectedChild) return
    setError('')
    setSuccess(null)

    if (pendingForChild > 0) {
      setError(
        'Anak masih punya latihan mandiri yang belum selesai. Minta anak menyelesaikan atau batalkan dulu di Latihan Mandiri.'
      )
      return
    }
    if (!subjectKey) {
      setError('Pilih mata pelajaran')
      return
    }
    if (selectedTopicIds.length === 0) {
      setError('Pilih minimal satu materi')
      return
    }

    setStarting(true)
    try {
      const allQs: Question[] = []
      for (const tid of selectedTopicIds) {
        const qSnap = await getDocs(
          query(collection(db, 'questions'), where('topicId', '==', tid))
        )
        qSnap.docs.forEach((d) => allQs.push({ id: d.id, ...d.data() } as Question))
      }
      const withId = allQs.filter((q) => q.id)
      if (withId.length === 0) {
        setError('Tidak ada soal di materi yang dipilih. Coba materi lain atau hubungi guru.')
        return
      }
      const picked = shuffle(withId).slice(0, Math.min(count, withId.length))
      if (picked.length < 5) {
        setError(
          `Soal terlalu sedikit (${picked.length}). Pilih materi lain atau minta guru menambah soal.`
        )
        return
      }

      const topicNames = selectedTopicIds
        .map((id) => topics.find((t) => t.id === id)?.name || '')
        .filter(Boolean)

      const ref = await addDoc(collection(db, 'practiceSessions'), {
        studentId: selectedChild.id,
        studentName: selectedChild.fullName,
        studentClass: selectedChild.className || '',
        subjectKey,
        topicIds: selectedTopicIds,
        topicNames,
        questionIds: picked.map((q) => q.id!),
        questionCount: picked.length,
        status: 'in_progress',
        createdByParent: true,
        parentId: session.parentId || null,
        parentName: session.fullName,
        title: titlePreview,
        createdAt: serverTimestamp(),
      })

      setSuccess({
        sessionId: ref.id,
        title: titlePreview,
        questionCount: picked.length,
        childName: selectedChild.fullName,
      })
      setPendingForChild(1)
      setSelectedTopicIds([])
    } catch (err) {
      console.error(err)
      setError('Gagal membuat kuis. Coba lagi.')
    } finally {
      setStarting(false)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <OrtuLayout title="Buat kuis" subtitle={selectedChild?.fullName} parentName={session.fullName}>
      <div className="space-y-4">
        <div className="rounded-xl border border-violet-100 bg-violet-50/80 px-3.5 py-2.5 text-xs text-violet-900 leading-relaxed">
          Anda menyusun latihan dari bank soal sekolah. Setelah dibuat,{' '}
          <strong>anak mengerjakan</strong> lewat login siswa → <em>Latihan Mandiri</em>. Hasilnya
          masuk riwayat anak (bukan paket kuis guru).
        </div>

        {children.length > 1 && (
          <div>
            <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Untuk anak
            </label>
            <select
              value={selectedChildId}
              onChange={(e) => {
                setSelectedChildId(e.target.value)
                setSuccess(null)
                setError('')
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.className ? ` · ${c.className}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {pendingForChild > 0 && !success && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
            Anak masih punya {pendingForChild} latihan mandiri yang belum selesai. Selesaikan dulu
            sebelum membuat yang baru.
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">Kuis siap!</p>
            <p className="text-xs text-emerald-800 leading-relaxed">
              <strong>{success.questionCount} soal</strong> · {success.title}
              <br />
              Untuk: <strong>{success.childName}</strong>
            </p>
            <ol className="text-xs text-emerald-900 list-decimal pl-4 space-y-1 mt-1">
              <li>Minta anak login di tab Siswa</li>
              <li>Buka menu Latihan Mandiri</li>
              <li>Lanjutkan sesi yang sedang berjalan</li>
            </ol>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="text-xs font-medium text-emerald-700 hover:underline mt-1"
            >
              Buat kuis lagi
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {!success && (
          <>
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">1. Mata pelajaran</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUBJECTS.map((s) => {
                  const on = subjectKey === s.key
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSubjectKey(s.key)}
                      className={`rounded-xl border px-2.5 py-2.5 text-left transition ${
                        on
                          ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-200'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      <span className="text-base">{s.icon}</span>
                      <span className="block text-xs font-semibold mt-0.5 text-gray-900">
                        {s.shortName}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">2. Materi</h2>
                {topics.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllTopics}
                    className="text-xs text-violet-700 font-medium hover:underline"
                  >
                    Pilih semua
                  </button>
                )}
              </div>
              {!subjectKey ? (
                <p className="text-sm text-gray-400">Pilih mapel dulu</p>
              ) : loadingTopics ? (
                <p className="text-sm text-gray-400">Memuat materi…</p>
              ) : topics.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada materi untuk mapel ini</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {topics.map((t) => {
                    const id = t.id!
                    const on = selectedTopicIds.includes(id)
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${
                          on
                            ? 'border-violet-400 bg-violet-50/80'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleTopic(id)}
                          className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span className="text-sm text-gray-800">{t.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">3. Jumlah soal</h2>
              <div className="flex gap-2">
                {PRACTICE_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                      count === n
                        ? 'border-violet-500 bg-violet-50 text-violet-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {n} soal
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">
                Preview: {titlePreview}
                {selectedChild ? ` · ${selectedChild.fullName}` : ''}
              </p>
            </section>

            <button
              type="button"
              disabled={starting || pendingForChild > 0}
              onClick={createQuiz}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-medium py-3 rounded-xl transition"
            >
              {starting ? 'Menyiapkan…' : 'Buat kuis untuk anak'}
            </button>
          </>
        )}
      </div>
    </OrtuLayout>
  )
}
