import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ensureStudentSession, type StudentSession } from '../lib/studentSession'
import { Link, useNavigate } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
import { SUBJECTS, getSubject, type SubjectKey, type Topic, type Question } from '../types/question'
import { PRACTICE_COUNTS, type PracticeCount } from '../types/practice'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function PracticeSetup() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [subjectKey, setSubjectKey] = useState<SubjectKey | ''>('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [count, setCount] = useState<PracticeCount>(15)
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [pendingMeta, setPendingMeta] = useState<{
    title?: string
    createdByParent?: boolean
    parentName?: string
    questionCount?: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await ensureStudentSession()
      if (cancelled) return
      if (!s) {
        navigate('/login', { replace: true })
        return
      }
      setStudent(s)
      // Hanya sesi milik siswa login (filter studentId)
      try {
        const snap = await getDocs(
          query(
            collection(db, 'practiceSessions'),
            where('studentId', '==', s.studentId),
            where('status', '==', 'in_progress')
          )
        )
        if (!snap.empty) {
          const d = snap.docs[0]
          const data = d.data()
          setPendingSessionId(d.id)
          setPendingMeta({
            title: data.title ? String(data.title) : undefined,
            createdByParent: data.createdByParent === true,
            parentName: data.parentName ? String(data.parentName) : undefined,
            questionCount: typeof data.questionCount === 'number' ? data.questionCount : undefined,
          })
        } else {
          setPendingMeta(null)
        }
      } catch (err) {
        console.warn('cek practiceSessions', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

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
    if (!subject) return 'Latihan mandiri'
    if (selectedTopicIds.length === 0) return `Latihan mandiri · ${subject.shortName}`
    if (selectedTopicIds.length === 1) {
      const t = topics.find((x) => x.id === selectedTopicIds[0])
      return `Latihan mandiri · ${t?.name || subject.shortName}`
    }
    return `Latihan mandiri · ${subject.shortName} (${selectedTopicIds.length} materi)`
  }, [subject, selectedTopicIds, topics])

  const startPractice = async () => {
    if (!student) return
    setError('')
    if (pendingSessionId) {
      setError('Selesaikan dulu latihan mandiri yang sedang berjalan.')
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
      for (let i = 0; i < selectedTopicIds.length; i += 10) {
        const chunk = selectedTopicIds.slice(i, i + 10)
        for (const tid of chunk) {
          const qSnap = await getDocs(
            query(collection(db, 'questions'), where('topicId', '==', tid))
          )
          qSnap.docs.forEach((d) => allQs.push({ id: d.id, ...d.data() } as Question))
        }
      }
      const withId = allQs.filter((q) => q.id)
      if (withId.length === 0) {
        setError('Tidak ada soal di materi yang dipilih. Coba materi lain.')
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
        studentId: student.studentId,
        studentName: student.fullName,
        studentClass: student.className || '5A',
        subjectKey,
        topicIds: selectedTopicIds,
        topicNames,
        questionIds: picked.map((q) => q.id!),
        questionCount: picked.length,
        status: 'in_progress',
        kind: 'self',
        visibility: 'student_only',
        createdByParent: false,
        createdAt: serverTimestamp(),
      })
      navigate(`/siswa/latihan-mandiri/${ref.id}`)
    } catch (err) {
      console.error(err)
      setError('Gagal membuat latihan. Coba lagi.')
    } finally {
      setStarting(false)
    }
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const initial = (student.fullName.trim()[0] || 'S').toUpperCase()

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Latihan mandiri</p>
            <p className="text-xs text-gray-500 truncate">Pilih materi · 15–20 soal · tanpa jadwal</p>
          </div>
          <Link to="/siswa" className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1.5">
            Beranda
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-5">
        {pendingSessionId && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm font-semibold text-amber-900">
              {pendingMeta?.createdByParent
                ? 'Ada latihan dari orang tua yang belum selesai'
                : 'Ada latihan yang belum selesai'}
            </p>
            <p className="text-xs text-amber-800/90 mt-1">
              {pendingMeta?.title ? (
                <>
                  <span className="font-medium">{pendingMeta.title}</span>
                  {pendingMeta.questionCount ? ` · ${pendingMeta.questionCount} soal` : ''}
                  {pendingMeta.createdByParent && pendingMeta.parentName
                    ? ` · dari ${pendingMeta.parentName}`
                    : ''}
                  .{' '}
                </>
              ) : null}
              Selesaikan dulu sebelum membuat paket baru. Latihan ini hanya untuk akunmu.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/siswa/latihan-mandiri/${pendingSessionId}`)}
              className="mt-3 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl"
            >
              Lanjutkan latihan
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">1. Mata pelajaran</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={!!pendingSessionId}
                onClick={() => setSubjectKey(s.key)}
                className={`text-left px-3 py-2.5 rounded-xl border text-sm transition ${
                  subjectKey === s.key
                    ? 'border-teal-500 bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-teal-200'
                } disabled:opacity-50`}
              >
                <span className="text-base">{s.icon}</span>
                <span className="block text-xs font-semibold mt-0.5">{s.shortName}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">2. Materi</h2>
            {topics.length > 0 && !pendingSessionId && (
              <button
                type="button"
                onClick={selectAllTopics}
                className="text-xs text-teal-700 font-medium hover:underline"
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
                        ? 'border-teal-400 bg-teal-50/80'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!!pendingSessionId}
                      onChange={() => toggleTopic(id)}
                      className="accent-teal-600"
                    />
                    <span className="text-sm text-gray-800">{t.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">3. Jumlah soal</h2>
          <div className="flex gap-2">
            {PRACTICE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={!!pendingSessionId}
                onClick={() => setCount(n)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition ${
                  count === n
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
                } disabled:opacity-50`}
              >
                {n} soal
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Jika bank soal kurang dari pilihan, dipakai semua soal yang ada (minimal 5).
          </p>
        </section>

        <button
          type="button"
          onClick={startPractice}
          disabled={starting || !!pendingSessionId || !subjectKey || selectedTopicIds.length === 0}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm transition"
        >
          {starting ? 'Menyiapkan soal…' : `Mulai · ${titlePreview}`}
        </button>
      </main>

      <StudentNav />
    </div>
  )
}
