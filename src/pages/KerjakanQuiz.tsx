import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  documentId,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useNavigate, useParams } from 'react-router-dom'
import {
  gradeAnswer,
  type LatihanPaket,
  type Question,
  type QuestionAnswer,
  DEFAULT_CATEGORY_LABELS,
} from '../types/question'

interface Session {
  latihanId: string
  studentName: string
  studentClass?: string
  token: string
}

function shuffle<T>(arr: T[], seed?: number): T[] {
  const a = [...arr]
  // simple shuffle
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function KerjakanQuiz() {
  const { latihanId } = useParams<{ latihanId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [paket, setPaket] = useState<LatihanPaket | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  // answers[questionId] = selected indices
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef(Date.now())
  const questionStarted = useRef(Date.now())
  const timePerQ = useRef<Record<string, number>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_session')
    if (!raw) {
      navigate('/kerjakan')
      return
    }
    try {
      const s = JSON.parse(raw) as Session
      if (s.latihanId !== latihanId) {
        navigate('/kerjakan')
        return
      }
      setSession(s)
      loadQuiz(s.latihanId)
    } catch {
      navigate('/kerjakan')
    }
  }, [latihanId])

  const loadQuiz = async (id: string) => {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'latihan', id))
      if (!snap.exists()) {
        setError('Latihan tidak ditemukan')
        return
      }
      const p = { id: snap.id, ...snap.data() } as LatihanPaket
      setPaket(p)

      if (!p.questionIds?.length) {
        setError('Paket belum memiliki soal')
        return
      }

      // Firestore 'in' max 30 — batch if needed
      const ids = p.questionIds
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
      const all: Question[] = []
      for (const chunk of chunks) {
        const qSnap = await getDocs(
          query(collection(db, 'questions'), where(documentId(), 'in', chunk))
        )
        qSnap.docs.forEach((d) => all.push({ id: d.id, ...d.data() } as Question))
      }
      // preserve order from questionIds, then optional shuffle
      const byId = new Map(all.map((q) => [q.id!, q]))
      let ordered = ids.map((qid) => byId.get(qid)).filter(Boolean) as Question[]
      if (p.shuffleQuestions) ordered = shuffle(ordered)

      // shuffle options display order is handled in UI via mapping if needed
      setQuestions(ordered)

      if (p.timeLimitMinutes && p.timeLimitMinutes > 0) {
        setTimeLeft(p.timeLimitMinutes * 60)
      }
      startedAt.current = Date.now()
      questionStarted.current = Date.now()
    } catch (err) {
      console.error(err)
      setError('Gagal memuat soal')
    } finally {
      setLoading(false)
    }
  }

  // Timer
  useEffect(() => {
    if (timeLeft === null) return
    if (timeLeft <= 0) {
      submitQuiz(true)
      return
    }
    const t = setInterval(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000)
    return () => clearInterval(t)
  }, [timeLeft])

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
      const next = cur.includes(index) ? cur.filter((x) => x !== index) : [...cur, index].sort((a, b) => a - b)
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

  const submitQuiz = useCallback(async (auto = false) => {
    if (!paket || !session || questions.length === 0 || submitting) return
    if (!auto) {
      const unanswered = questions.filter((q) => {
        const a = answers[q.id!]
        if (!a || a.length === 0) return true
        if (q.type === 'category' && a.some((x) => x < 0)) return true
        return false
      })
      if (unanswered.length > 0) {
        if (!confirm(`Masih ada ${unanswered.length} soal belum dijawab. Kirim sekarang?`)) return
      } else if (!confirm('Kirim jawaban dan selesai?')) return
    }

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
        const tp = (q.tp || '').trim() || 'Lainnya'
        if (!tpSummary[tp]) tpSummary[tp] = { correct: 0, total: 0 }
        tpSummary[tp].total += 1
        if (answerList[i].isCorrect) tpSummary[tp].correct += 1
      })

      const durationMs = Date.now() - startedAt.current
      const attemptRef = await addDoc(collection(db, 'attempts'), {
        latihanId: paket.id,
        latihanTitle: paket.title,
        studentName: session.studentName,
        studentClass: session.studentClass || null,
        answers: answerList,
        score,
        total,
        percent,
        tpSummary,
        startedAt: new Date(startedAt.current),
        finishedAt: serverTimestamp(),
        durationMs,
      })

      sessionStorage.setItem(
        'rk_result',
        JSON.stringify({
          attemptId: attemptRef.id,
          score,
          total,
          percent,
          showScore: paket.showScoreImmediately !== false,
          name: session.studentName,
          title: paket.title,
          tpSummary,
        })
      )
      sessionStorage.removeItem('rk_session')
      navigate('/kerjakan/hasil')
    } catch (err) {
      console.error(err)
      alert('Gagal mengirim jawaban. Coba lagi.')
      setSubmitting(false)
    }
  }, [paket, session, questions, answers, current, submitting, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat soal...</p>
      </div>
    )
  }

  if (error || !paket || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] p-4">
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-sm">
          <p className="text-gray-700 mb-4">{error || 'Tidak ada soal'}</p>
          <button onClick={() => navigate('/kerjakan')} className="text-indigo-600 font-medium text-sm">
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

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{paket.title}</p>
            <p className="text-xs text-gray-500">
              {session?.studentName}
              {session?.studentClass ? ` · ${session.studentClass}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {timeLeft !== null && (
              <span className={`text-sm font-mono font-semibold ${timeLeft < 60 ? 'text-red-600' : 'text-gray-700'}`}>
                {formatTime(timeLeft)}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {answeredCount}/{questions.length}
            </span>
          </div>
        </div>
        {/* Progress */}
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
                    ? 'bg-indigo-600 text-white'
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
          <p className="text-base md:text-lg font-medium text-gray-900 leading-relaxed mb-6">{q.question}</p>

          {/* Options */}
          {q.type === 'category' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Pilih {(q.categoryLabels || DEFAULT_CATEGORY_LABELS).join(' / ')} untuk setiap pernyataan
              </p>
              {q.options.map((stmt, si) => {
                const labels = q.categoryLabels || DEFAULT_CATEGORY_LABELS
                const val = selected[si]
                return (
                  <div key={si} className="border border-gray-100 rounded-xl p-3">
                    <p className="text-sm text-gray-800 mb-2">{si + 1}. {stmt}</p>
                    <div className="flex gap-2">
                      {[0, 1].map((li) => (
                        <button
                          key={li}
                          type="button"
                          onClick={() => setCategory(q.id!, si, li, q.options.length)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                            val === li
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                          }`}
                        >
                          {labels[li]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {q.type === 'multiple' && (
                <p className="text-xs text-gray-400 mb-2">Pilih semua jawaban yang benar</p>
              )}
              {q.options.map((opt, oi) => {
                const isOn = selected.includes(oi)
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() =>
                      q.type === 'multiple' ? toggleMulti(q.id!, oi) : setSingle(q.id!, oi)
                    }
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition ${
                      isOn
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                        isOn ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500'
                      }`}
                    >
                      {q.type === 'multiple' && isOn ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        String.fromCharCode(65 + oi)
                      )}
                    </span>
                    <span className="text-sm text-gray-800 pt-0.5">{opt}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-5 gap-3">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, current - 1))}
            disabled={current === 0}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            Sebelumnya
          </button>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              Selanjutnya
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submitQuiz(false)}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
