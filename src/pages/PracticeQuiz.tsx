import { useCallback, useEffect, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  documentId,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useNavigate, useParams } from 'react-router-dom'
import { ensureStudentSession } from '../lib/studentSession'
import {
  gradeAnswer,
  DEFAULT_CATEGORY_LABELS,
  type Question,
  type QuestionAnswer,
} from '../types/question'
import type { PracticeSession } from '../types/practice'

export default function PracticeQuiz() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<PracticeSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const topicTp = useRef<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef(Date.now())
  const questionStarted = useRef(Date.now())
  const timePerQ = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!sessionId) {
      navigate('/siswa/latihan-mandiri', { replace: true })
      return
    }
    load(sessionId)
  }, [sessionId])

  const load = async (id: string) => {
    setLoading(true)
    setError('')
    try {
      const student = await ensureStudentSession()
      if (!student) {
        navigate('/login', { replace: true })
        return
      }
      const snap = await getDoc(doc(db, 'practiceSessions', id))
      if (!snap.exists()) {
        setError('Sesi latihan tidak ditemukan atau sudah selesai.')
        return
      }
      const s = { id: snap.id, ...snap.data() } as PracticeSession
      if (s.studentId !== student.studentId) {
        setError('Sesi ini milik siswa lain.')
        return
      }
      if (s.status !== 'in_progress') {
        setError('Sesi sudah tidak aktif.')
        return
      }
      setSession(s)
      startedAt.current = Date.now()

      const ids = s.questionIds || []
      if (!ids.length) {
        setError('Sesi tanpa soal')
        return
      }
      const all: Question[] = []
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30)
        const qSnap = await getDocs(
          query(collection(db, 'questions'), where(documentId(), 'in', chunk))
        )
        qSnap.docs.forEach((d) => all.push({ id: d.id, ...d.data() } as Question))
      }
      const byId = new Map(all.map((q) => [q.id!, q]))
      const ordered = ids.map((qid) => byId.get(qid)).filter(Boolean) as Question[]
      setQuestions(ordered)

      const topicIds = [...new Set(ordered.map((q) => q.topicId).filter(Boolean))]
      const tpByTopic: Record<string, string[]> = {}
      for (let i = 0; i < topicIds.length; i += 30) {
        const chunk = topicIds.slice(i, i + 30)
        const tSnap = await getDocs(query(collection(db, 'topics'), where(documentId(), 'in', chunk)))
        tSnap.docs.forEach((d) => {
          const codes = (d.data().tpCodes || []) as string[]
          tpByTopic[d.id] = codes.map((c) => String(c).trim()).filter(Boolean)
        })
      }
      topicTp.current = tpByTopic
      questionStarted.current = Date.now()
    } catch (err) {
      console.error(err)
      setError('Gagal memuat soal')
    } finally {
      setLoading(false)
    }
  }

  const recordTime = (qid: string) => {
    const elapsed = Date.now() - questionStarted.current
    timePerQ.current[qid] = (timePerQ.current[qid] || 0) + elapsed
    questionStarted.current = Date.now()
  }

  const goTo = (idx: number) => {
    if (questions[current]) recordTime(questions[current].id!)
    setCurrent(idx)
  }

  const setSingle = (qid: string, index: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: [index] }))
  }

  const toggleMulti = (qid: string, index: number) => {
    setAnswers((prev) => {
      const cur = prev[qid] || []
      const next = cur.includes(index)
        ? cur.filter((x) => x !== index)
        : [...cur, index].sort((a, b) => a - b)
      return { ...prev, [qid]: next }
    })
  }

  const setCategory = (qid: string, stmtIdx: number, labelIdx: number, stmtCount: number) => {
    setAnswers((prev) => {
      const cur = [...(prev[qid] || Array(stmtCount).fill(-1))]
      while (cur.length < stmtCount) cur.push(-1)
      cur[stmtIdx] = labelIdx
      return { ...prev, [qid]: cur }
    })
  }

  const submitQuiz = useCallback(async () => {
    if (!session || questions.length === 0 || submitting) return
    const unanswered = questions.filter((q) => {
      const a = answers[q.id!]
      if (!a || a.length === 0) return true
      if (q.type === 'category' && a.some((x) => x < 0)) return true
      return false
    })
    if (unanswered.length > 0) {
      if (!confirm(`Masih ada ${unanswered.length} soal belum dijawab. Kirim sekarang?`)) return
    } else if (!confirm('Kirim jawaban dan selesai?')) return

    if (questions[current]) recordTime(questions[current].id!)
    setSubmitting(true)
    try {
      const answerList: QuestionAnswer[] = questions.map((q) => {
        const selected = answers[q.id!] || []
        const isCorrect = gradeAnswer(q, selected.filter((x) => x >= 0))
        return {
          questionId: q.id!,
          selected,
          isCorrect,
          timeMs: timePerQ.current[q.id!] || 0,
        }
      })
      const score = answerList.filter((a) => a.isCorrect).length
      const total = questions.length
      const percent = total ? Math.round((score / total) * 100) : 0

      const tpSummary: Record<string, { correct: number; total: number }> = {}
      questions.forEach((q, i) => {
        const own = [q.tpCodes, q.tp]
          .flat()
          .flatMap((v) => String(v || '').split(/[,;|]/))
          .map((s) => s.trim())
          .filter(Boolean)
        const fromTopic = topicTp.current[q.topicId] || []
        const codes = [...new Set(own.length ? own : fromTopic)]
        const targets = codes.length ? codes : ['Lainnya']
        targets.forEach((tp) => {
          if (!tpSummary[tp]) tpSummary[tp] = { correct: 0, total: 0 }
          tpSummary[tp].total += 1
          if (answerList[i].isCorrect) tpSummary[tp].correct += 1
        })
      })

      const titleParts = ['Latihan mandiri']
      if (session.topicNames?.length === 1) titleParts.push(session.topicNames[0])
      else if (session.topicNames && session.topicNames.length > 1)
        titleParts.push(`${session.topicNames.length} materi`)
      const title = titleParts.join(' · ')

      const durationMs = Date.now() - startedAt.current
      const attemptRef = await addDoc(collection(db, 'practiceAttempts'), {
        studentId: session.studentId,
        studentName: session.studentName,
        studentClass: session.studentClass || '5A',
        subjectKey: session.subjectKey,
        topicIds: session.topicIds || [],
        topicNames: session.topicNames || [],
        title,
        questionIds: session.questionIds,
        answers: answerList,
        score,
        total,
        percent,
        tpSummary,
        startedAt: new Date(startedAt.current),
        finishedAt: serverTimestamp(),
        durationMs,
        kind: 'practice',
      })

      try {
        await deleteDoc(doc(db, 'practiceSessions', session.id!))
      } catch (err) {
        console.warn('hapus session', err)
      }

      sessionStorage.setItem(
        'rk_practice_result',
        JSON.stringify({
          attemptId: attemptRef.id,
          score,
          total,
          percent,
          name: session.studentName,
          title,
          tpSummary,
        })
      )
      navigate('/siswa/latihan-mandiri/hasil', { replace: true })
    } catch (err) {
      console.error(err)
      alert('Gagal mengirim jawaban. Coba lagi.')
      setSubmitting(false)
    }
  }, [session, questions, answers, current, submitting, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat soal...</p>
      </div>
    )
  }

  if (error || !session || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] p-4">
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-sm">
          <p className="text-gray-700 mb-4">{error || 'Tidak ada soal'}</p>
          <button
            type="button"
            onClick={() => navigate('/siswa/latihan-mandiri')}
            className="text-teal-700 font-medium text-sm"
          >
            Kembali
          </button>
        </div>
      </div>
    )
  }

  const q = questions[current]
  const selected = answers[q.id!] || []
  const answeredCount = questions.filter((qq) => {
    const a = answers[qq.id!]
    if (!a || a.length === 0) return false
    if (qq.type === 'category' && a.some((x) => x < 0)) return false
    return true
  }).length

  const labels = q.categoryLabels || DEFAULT_CATEGORY_LABELS

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">Latihan mandiri</p>
            <p className="text-xs text-gray-500">{session.studentName}</p>
          </div>
          <span className="text-xs text-gray-500 shrink-0">
            {answeredCount}/{questions.length}
          </span>
        </div>
        <div className="max-w-3xl mx-auto mt-2 flex gap-1 flex-wrap">
          {questions.map((qq, i) => {
            const a = answers[qq.id!]
            const done = a && a.length > 0 && !(qq.type === 'category' && a.some((x) => x < 0))
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => goTo(i)}
                className={`w-7 h-7 rounded-md text-[11px] font-semibold transition ${
                  i === current
                    ? 'bg-teal-600 text-white'
                    : done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-7">
          <p className="text-xs font-medium text-gray-400 mb-2">
            Soal {current + 1} dari {questions.length}
            {q.tp ? ` · TP ${q.tp}` : ''}
          </p>
          {q.stimulus && (
            <div className="mb-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
              {q.stimulus}
            </div>
          )}
          {q.stimulusImage &&
            (q.stimulusImage.startsWith('data:image') || /^https?:\/\//i.test(q.stimulusImage)) && (
              <div className="mb-3 flex justify-center">
                <img
                  src={q.stimulusImage}
                  alt=""
                  className="max-h-48 object-contain rounded-lg border border-gray-100"
                />
              </div>
            )}
          <p className="text-base font-medium text-gray-900 mb-4 leading-relaxed">{q.question}</p>

          {q.type === 'single' && (
            <div className="space-y-2">
              <div className="mb-3 rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-teal-600 text-white text-[11px] font-bold px-2 py-0.5 tracking-wide">
                  PG
                </span>
                <p className="text-sm font-medium text-teal-900">
                  Pilihan ganda — pilih <span className="font-bold">1</span> jawaban yang benar
                </p>
              </div>
              {q.options.map((opt, i) => {
                const checked = selected[0] === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSingle(q.id!, i)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition flex items-start gap-3 ${
                      checked
                        ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-100 text-teal-900'
                        : 'border-gray-100 hover:border-teal-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        checked ? 'border-teal-600 bg-teal-600' : 'border-gray-300 bg-white'
                      }`}
                      aria-hidden
                    >
                      {checked && <span className="block w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <span>
                      <span className="font-semibold text-gray-400 mr-1.5">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {q.type === 'multiple' && (
            <div className="space-y-2">
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 tracking-wide">
                  PGK
                </span>
                <p className="text-sm font-medium text-amber-900">
                  Pilihan ganda kompleks — pilih{' '}
                  <span className="font-bold underline decoration-amber-600/50">semua</span> jawaban
                  yang benar
                  {(q.correctAnswers?.length ?? 0) > 0 && (
                    <span className="font-semibold"> (tepat {q.correctAnswers!.length})</span>
                  )}
                </p>
                {selected.length > 0 && (
                  <span className="ml-auto text-xs font-semibold text-amber-800 bg-white/70 border border-amber-200 rounded-md px-2 py-0.5">
                    Terpilih: {selected.length}
                    {(q.correctAnswers?.length ?? 0) > 0 ? `/${q.correctAnswers!.length}` : ''}
                  </span>
                )}
              </div>
              {q.options.map((opt, i) => {
                const checked = selected.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleMulti(q.id!, i)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition flex items-start gap-3 ${
                      checked
                        ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200 text-amber-950'
                        : 'border-gray-100 hover:border-amber-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        checked ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-400 bg-white'
                      }`}
                      aria-hidden
                    >
                      {checked && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span>
                      <span className="font-semibold text-gray-400 mr-1.5">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {q.type === 'category' && (
            <div className="space-y-3">
              {q.options.map((stmt, si) => (
                <div key={si} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-sm text-gray-800 mb-2">{stmt}</p>
                  <div className="flex flex-wrap gap-2">
                    {labels.map((lab, li) => (
                      <button
                        key={li}
                        type="button"
                        onClick={() => setCategory(q.id!, si, li, q.options.length)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                          selected[si] === li
                            ? 'border-teal-500 bg-teal-50 text-teal-800'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
            className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-teal-600 text-white"
            >
              Berikutnya
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submitQuiz()}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white disabled:opacity-50"
            >
              {submitting ? 'Mengirim…' : 'Selesai & kirim'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
