import { useEffect, useState, useRef, useCallback } from 'react'
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
  isPaketForStudent,
  canRetryPaket,
  type LatihanPaket,
  type Question,
  type QuestionAnswer,
  DEFAULT_CATEGORY_LABELS,
} from '../types/question'
import {
  loadProgress,
  saveProgress,
  clearProgress,
  shuffleSeeded,
} from '../lib/quizProgress'
import { notifyAdminStudentAttempt } from '../lib/notifyAdmin'
import { StimulusBlock, optionOrder, type Session } from './kerjakanQuizHelpers'

export default function KerjakanQuiz() {
  const { latihanId } = useParams<{ latihanId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [paket, setPaket] = useState<LatihanPaket | null>(null)
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
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<{ img?: string; text?: string } | null>(null)
  const [lbScale, setLbScale] = useState(1)
  const submitQuizRef = useRef<((auto?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_session')
    if (!raw) {
      navigate('/kerjakan')
      return
    }
    try {
      const s = JSON.parse(raw) as Session
      if (s.latihanId !== latihanId) {
        navigate('/siswa')
        return
      }
      setSession(s)
      loadQuiz(s.latihanId, s)
    } catch {
      navigate('/kerjakan')
    }
  }, [latihanId])

  const loadQuiz = async (id: string, sess?: Session) => {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'latihan', id))
      if (!snap.exists()) {
        setError('Latihan tidak ditemukan')
        return
      }
      const p = { id: snap.id, ...snap.data() } as LatihanPaket
      setPaket(p)

      const st = sess
      if (st) {
        if (!isPaketForStudent(p, { studentId: st.studentId, className: st.studentClass })) {
          setError('Paket ini tidak ditugaskan untuk kelas/akun kamu.')
          return
        }
        if (!canRetryPaket(p)) {
          try {
            const aSnap = await getDocs(
              query(collection(db, 'attempts'), where('latihanId', '==', id))
            )
            const existing = aSnap.docs.some((d) => {
              const a = d.data()
              if (st.studentId && a.studentId === st.studentId) return true
              if (st.studentName && a.studentName === st.studentName) return true
              return false
            })
            if (existing) {
              setError('Kamu sudah mengerjakan latihan ini. Pengerjaan ulang tidak diizinkan.')
              return
            }
          } catch (err) {
            console.warn('cek attempt', err)
          }
        }
      }

      if (!p.questionIds?.length) {
        setError('Paket belum memiliki soal')
        return
      }

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

      const byId = new Map(all.map((q) => [q.id!, q]))
      const seed = `${id}:${st?.studentId || st?.studentName || 'x'}`
      let ordered = ids.map((qid) => byId.get(qid)).filter(Boolean) as Question[]
      if (p.shuffleQuestions) ordered = shuffleSeeded(ordered, seed)

      const saved = st ? loadProgress(id, st) : null
      if (saved?.questionIds?.length) {
        const restored = saved.questionIds.map((qid) => byId.get(qid)).filter(Boolean) as Question[]
        if (restored.length === ordered.length) ordered = restored
      }

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
      setQuestions(ordered)

      if (saved) {
        setAnswers(saved.answers || {})
        setCurrent(Math.min(saved.current || 0, Math.max(0, ordered.length - 1)))
        timePerQ.current = saved.timePerQ || {}
        startedAt.current = saved.startedAt || Date.now()
        if (saved.deadlineAt) {
          const left = Math.max(0, Math.floor((saved.deadlineAt - Date.now()) / 1000))
          setTimeLeft(left)
          if (left <= 0) {
            setTimeout(() => submitQuizRef.current?.(true), 300)
          }
        } else if (p.timeLimitMinutes && p.timeLimitMinutes > 0) {
          setTimeLeft(p.timeLimitMinutes * 60)
        }
      } else {
        startedAt.current = Date.now()
        if (p.timeLimitMinutes && p.timeLimitMinutes > 0) {
          setTimeLeft(p.timeLimitMinutes * 60)
        }
      }
      questionStarted.current = Date.now()
    } catch (err) {
      console.error(err)
      setError('Gagal memuat soal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (timeLeft === null) return
    if (timeLeft <= 0) {
      submitQuizRef.current?.(true)
      return
    }
    const t = setInterval(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000)
    return () => clearInterval(t)
  }, [timeLeft])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    if (!session || !latihanId || questions.length === 0 || loading) return
    const deadlineAt = timeLeft === null ? null : Date.now() + timeLeft * 1000
    saveProgress(latihanId, session, {
      questionIds: questions.map((q) => q.id!).filter(Boolean),
      answers,
      current,
      startedAt: startedAt.current,
      deadlineAt,
      timePerQ: { ...timePerQ.current },
    })
  }, [answers, current, timeLeft, session, latihanId, questions, loading])

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

  const submitQuiz = useCallback(
    async (auto = false) => {
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

        const durationMs = Date.now() - startedAt.current
        const attemptRef = await addDoc(collection(db, 'attempts'), {
          latihanId: paket.id,
          latihanTitle: paket.title,
          studentName: session.studentName,
          studentId: session.studentId || null,
          studentClass: session.studentClass || '5A',
          answers: answerList,
          score,
          total,
          percent,
          tpSummary,
          startedAt: new Date(startedAt.current),
          finishedAt: serverTimestamp(),
          durationMs,
        })

        await notifyAdminStudentAttempt({
          studentName: session.studentName,
          studentClass: session.studentClass,
          latihanTitle: paket.title,
          percent,
          score,
          total,
          attemptId: attemptRef.id,
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
        if (paket.id) clearProgress(paket.id, session)
        navigate('/kerjakan/hasil')
      } catch (err) {
        console.error(err)
        alert('Gagal mengirim jawaban. Coba lagi.')
        setSubmitting(false)
      }
    },
    [paket, session, questions, answers, current, submitting, navigate]
  )

  useEffect(() => {
    submitQuizRef.current = submitQuiz
  }, [submitQuiz])

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
          <button
            onClick={() => navigate('/siswa')}
            className="text-indigo-600 font-medium text-sm"
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

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col">
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
              <span
                className={`text-sm font-mono font-semibold ${
                  timeLeft < 60 ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {formatTime(timeLeft)}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {answeredCount}/{questions.length}
            </span>
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-2 -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-1 min-w-min pb-0.5">
            {questions.map((qq, i) => {
              const a = answers[qq.id!]
              const done = a && a.length > 0 && !(qq.type === 'category' && a.some((x) => x < 0))
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`w-7 h-7 shrink-0 rounded-md text-[11px] font-semibold transition ${
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
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-7">
          <p className="text-xs font-medium text-gray-400 mb-2">
            Soal {current + 1} dari {questions.length}
            {q.tp ? ` · TP ${q.tp}` : ''}
          </p>
          {(q.stimulus || q.stimulusImage) && (
            <div className="mb-4 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden break-words">
              {q.stimulusImage &&
                (q.stimulusImage.startsWith('data:image') ||
                  /^https?:\/\//i.test(q.stimulusImage)) && (
                  <div className="px-3 pt-3">
                    <div className="flex items-center justify-center max-h-[min(40vh,260px)] bg-white rounded-lg border border-gray-100 p-2">
                      <img
                        src={q.stimulusImage}
                        alt="Ilustrasi soal"
                        className="max-h-[min(38vh,240px)] max-w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLbScale(1)
                        setLightbox({ img: q.stimulusImage, text: q.stimulus })
                      }}
                      className="mt-2 mb-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      🔍 Lihat lebih besar
                    </button>
                  </div>
                )}
              {q.stimulus && <StimulusBlock html={q.stimulus} />}
            </div>
          )}
          <div className="flex items-start justify-between gap-2 mb-6">
            <p className="text-base md:text-lg font-medium text-gray-900 leading-relaxed flex-1 break-words">
              {q.question}
            </p>
            {q.skor != null && q.skor > 0 && (
              <span className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                Skor {q.skor}
              </span>
            )}
          </div>

          {q.type === 'category' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Pilih {(q.categoryLabels || DEFAULT_CATEGORY_LABELS).join(' / ')} untuk setiap
                pernyataan
              </p>
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="px-3 py-2 text-left font-medium w-10">#</th>
                      <th className="px-3 py-2 text-left font-medium">Pernyataan</th>
                      {(q.categoryLabels || DEFAULT_CATEGORY_LABELS).map((lab) => (
                        <th key={lab} className="px-3 py-2 text-center font-medium">
                          {lab}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(q.options || []).map((stmt, si) => (
                      <tr key={si} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-400">{si + 1}</td>
                        <td className="px-3 py-2 text-gray-800">{stmt}</td>
                        {(q.categoryLabels || DEFAULT_CATEGORY_LABELS).map((lab, li) => (
                          <td key={lab} className="px-3 py-2 text-center">
                            <input
                              type="radio"
                              name={`cat-${q.id}-${si}`}
                              checked={selected[si] === li}
                              onChange={() =>
                                setCategory(q.id!, si, li, (q.options || []).length)
                              }
                              className="accent-indigo-600"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden space-y-3">
                {(q.options || []).map((stmt, si) => (
                  <div key={si} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm text-gray-800 mb-2 break-words">
                      <span className="text-gray-400 mr-1">{si + 1}.</span>
                      {stmt}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(q.categoryLabels || DEFAULT_CATEGORY_LABELS).map((lab, li) => (
                        <button
                          key={lab}
                          type="button"
                          onClick={() => setCategory(q.id!, si, li, (q.options || []).length)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                            selected[si] === li
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}
                        >
                          {lab}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {q.type === 'multiple' ? (
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
              ) : (
                <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5 tracking-wide">
                    PG
                  </span>
                  <p className="text-sm font-medium text-indigo-900">
                    Pilihan ganda — pilih <span className="font-bold">1</span> jawaban yang benar
                  </p>
                </div>
              )}
              {optionOrder(q.id || 'x', (q.options || []).length).map((oi) => {
                const opt = (q.options || [])[oi]
                const isMulti = q.type === 'multiple'
                const checked = selected.includes(oi)
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() =>
                      isMulti ? toggleMulti(q.id!, oi) : setSingle(q.id!, oi)
                    }
                    className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-start gap-3 ${
                      checked
                        ? isMulti
                          ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
                          : 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-5 h-5 border-2 flex items-center justify-center ${
                        isMulti ? 'rounded-md' : 'rounded-full'
                      } ${
                        checked
                          ? isMulti
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-indigo-600 bg-indigo-600 text-white'
                          : isMulti
                            ? 'border-amber-400 bg-white'
                            : 'border-gray-300 bg-white'
                      }`}
                      aria-hidden
                    >
                      {checked &&
                        (isMulti ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <span className="block w-2 h-2 rounded-full bg-white" />
                        ))}
                    </span>
                    <span className="text-sm text-gray-800 leading-relaxed">{opt}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-white"
          >
            Sebelumnya
          </button>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Berikutnya
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submitQuiz()}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Mengirim…' : 'Selesai & kirim'}
            </button>
          )}
        </div>
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium text-gray-700">Pratinjau</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLbScale((s) => Math.min(3, s + 0.25))}
                  className="text-xs px-2 py-1 rounded border"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setLbScale((s) => Math.max(0.5, s - 0.25))}
                  className="text-xs px-2 py-1 rounded border"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="text-xs px-2 py-1 rounded border"
                >
                  Tutup
                </button>
              </div>
            </div>
            {lightbox.img && (
              <img
                src={lightbox.img}
                alt=""
                style={{ transform: `scale(${lbScale})`, transformOrigin: 'top center' }}
                className="max-w-full mx-auto transition-transform"
              />
            )}
            {lightbox.text && (
              <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{lightbox.text}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
