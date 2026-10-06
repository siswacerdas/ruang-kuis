import { useEffect, useState, useMemo } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
  orderBy,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getSubject,
  formatDateTime,
  resolveLatihanStatus,
  LATIHAN_STATUS_LABELS,
  QUESTION_TYPE_LABELS,
  DEFAULT_CATEGORY_LABELS,
  type LatihanPaket,
  type LatihanAttempt,
  type Question,
  type QuestionAnswer,
} from '../types/question'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

const avatarColors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return avatarColors[Math.abs(h) % avatarColors.length]
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} mnt ${s} dtk` : `${m} mnt`
}

export default function LatihanHasil() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [paket, setPaket] = useState<LatihanPaket | null>(null)
  const [attempts, setAttempts] = useState<LatihanAttempt[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'questions'>('overview')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [popup, setPopup] = useState<{
    attempt: LatihanAttempt
    question: Question
    answer: QuestionAnswer
    qIndex: number
  } | null>(null)

  useEffect(() => {
    if (!id) {
      navigate('/latihan-soal')
      return
    }
    load(id)
  }, [id])

  const load = async (latihanId: string) => {
    setLoading(true)
    try {
      const pSnap = await getDoc(doc(db, 'latihan', latihanId))
      if (!pSnap.exists()) {
        navigate('/latihan-soal')
        return
      }
      const p = { id: pSnap.id, ...pSnap.data() } as LatihanPaket
      setPaket(p)

      let aSnap
      try {
        aSnap = await getDocs(
          query(
            collection(db, 'attempts'),
            where('latihanId', '==', latihanId),
            orderBy('finishedAt', 'desc')
          )
        )
      } catch {
        aSnap = await getDocs(
          query(collection(db, 'attempts'), where('latihanId', '==', latihanId))
        )
      }
      const atts = aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LatihanAttempt))
      setAttempts(atts)

      if (p.questionIds?.length) {
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
        setQuestions(ids.map((qid) => byId.get(qid)).filter(Boolean) as Question[])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  /** Hapus satu attempt → siswa bisa mengerjakan lagi (jika allowRetry off, ini satu-satunya cara reset). */
  const handleDeleteAttempt = async (att: LatihanAttempt) => {
    if (!att.id) return
    if (
      !confirm(
        `Hapus hasil ${att.studentName}?\nSkor ${att.score}/${att.total} (${att.percent}%) akan hilang.\nSiswa bisa mengerjakan ulang paket ini.`
      )
    )
      return
    setDeletingId(att.id)
    try {
      await deleteDoc(doc(db, 'attempts', att.id))
      setAttempts((prev) => prev.filter((a) => a.id !== att.id))
      if (popup?.attempt.id === att.id) setPopup(null)
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus hasil. Pastikan Anda login sebagai admin.')
    } finally {
      setDeletingId(null)
    }
  }

  /** Hapus semua attempt paket ini. */
  const handleDeleteAll = async () => {
    if (attempts.length === 0) return
    if (
      !confirm(
        `Hapus SEMUA ${attempts.length} hasil pengerjaan paket ini?\nTindakan ini tidak bisa dibatalkan.`
      )
    )
      return
    if (!confirm('Konfirmasi sekali lagi: hapus semua hasil?')) return
    setDeletingAll(true)
    try {
      const BATCH = 400
      for (let i = 0; i < attempts.length; i += BATCH) {
        const batch = writeBatch(db)
        attempts.slice(i, i + BATCH).forEach((a) => {
          if (a.id) batch.delete(doc(db, 'attempts', a.id))
        })
        await batch.commit()
      }
      setAttempts([])
      setPopup(null)
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus sebagian/semua hasil.')
      if (id) await load(id)
    } finally {
      setDeletingAll(false)
    }
  }

  const questionStats = useMemo(() => {
    return questions.map((q) => {
      if (attempts.length === 0) return { correct: 0, total: 0, percent: 0 }
      let correct = 0
      attempts.forEach((a) => {
        const ans = a.answers?.find((x) => x.questionId === q.id)
        if (ans?.isCorrect) correct++
      })
      return {
        correct,
        total: attempts.length,
        percent: Math.round((correct / attempts.length) * 100),
      }
    })
  }, [questions, attempts])

  const avgPercent = useMemo(() => {
    if (attempts.length === 0) return 0
    return Math.round(attempts.reduce((s, a) => s + (a.percent || 0), 0) / attempts.length)
  }, [attempts])

  const openCell = (attempt: LatihanAttempt, qIndex: number) => {
    const question = questions[qIndex]
    if (!question) return
    const answer = attempt.answers?.find((x) => x.questionId === question.id) || {
      questionId: question.id!,
      selected: [],
      isCorrect: false,
    }
    setPopup({ attempt, question, answer, qIndex })
  }

  if (loading) {
    return (
      <Layout title="Hasil Latihan">
        <div className="text-center py-16 text-gray-500 text-sm">Memuat riwayat...</div>
      </Layout>
    )
  }

  if (!paket) return null

  const subject = paket.subjectKey ? getSubject(paket.subjectKey) : null
  const status = resolveLatihanStatus(paket)

  return (
    <Layout
      title={paket.title}
      subtitle="Riwayat & hasil pengerjaan siswa"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          {attempts.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="text-sm text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 border border-red-100 disabled:opacity-50"
            >
              {deletingAll ? 'Menghapus...' : 'Reset semua hasil'}
            </button>
          )}
          <Link
            to="/latihan-soal"
            className="text-sm text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            ← Daftar latihan
          </Link>
        </div>
      }
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              status === 'active'
                ? 'bg-emerald-50 text-emerald-700'
                : status === 'finished'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {LATIHAN_STATUS_LABELS[status]}
          </span>
          {subject && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {subject.shortName}
            </span>
          )}
          <span className="text-xs text-gray-400">
            Token <span className="font-mono font-semibold text-gray-700">{paket.token}</span>
          </span>
          {paket.allowRetry ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
              Ulang diizinkan
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
              1x saja (reset = hapus hasil)
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Soal</p>
            <p className="font-semibold text-gray-900">{questions.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Peserta</p>
            <p className="font-semibold text-gray-900">{attempts.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Rata-rata skor</p>
            <p className="font-semibold text-gray-900">{attempts.length ? `${avgPercent}%` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Jadwal</p>
            <p className="font-medium text-gray-700 text-xs leading-snug">
              {formatDateTime(paket.startAt)}
              <br />
              s/d {formatDateTime(paket.endAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {(['overview', 'questions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === t
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-100 hover:bg-gray-50'
            }`}
          >
            {t === 'overview' ? 'Overview' : 'Per soal'}
          </button>
        ))}
      </div>

      {attempts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-600 font-medium">Belum ada siswa yang mengerjakan</p>
          <p className="text-sm text-gray-400 mt-1">
            Bagikan token <span className="font-mono font-semibold">{paket.token}</span> dan arahkan ke halaman{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">/kerjakan</code>
          </p>
        </div>
      ) : tab === 'overview' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium sticky left-0 bg-white z-[1] min-w-[200px]">
                    Siswa
                  </th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Skor</th>
                  {questions.map((q, i) => (
                    <th key={q.id} className="px-2 py-3 font-medium text-center whitespace-nowrap">
                      <div>No.{i + 1}</div>
                      <div className="text-[10px] font-normal text-gray-400">
                        {questionStats[i]?.percent ?? 0}%
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att, row) => (
                  <tr key={att.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-gray-400 w-4">{row + 1}</span>
                        <div
                          className={`w-8 h-8 rounded-full ${avatarColor(att.studentName)} text-white flex items-center justify-center text-[11px] font-semibold shrink-0`}
                        >
                          {initials(att.studentName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{att.studentName}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {att.studentClass || '—'} · {formatDuration(att.durationMs)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {att.score}/{att.total}
                        <span className="text-gray-400 font-normal">({att.percent}%)</span>
                      </span>
                    </td>
                    {questions.map((q, qi) => {
                      const ans = att.answers?.find((x) => x.questionId === q.id)
                      const ok = ans?.isCorrect
                      return (
                        <td key={q.id} className="px-2 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openCell(att, qi)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:ring-2 hover:ring-indigo-200 transition"
                            title="Detail jawaban"
                          >
                            {ans == null ? (
                              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-300 text-[10px] flex items-center justify-center">
                                —
                              </span>
                            ) : ok ? (
                              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </span>
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteAttempt(att)}
                        disabled={deletingId === att.id || deletingAll}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        title="Hapus hasil agar siswa bisa mengerjakan ulang"
                      >
                        {deletingId === att.id ? '...' : 'Reset'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => {
            const st = questionStats[i]
            return (
              <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">No.{i + 1}</span>
                    {q.tp && (
                      <span className="ml-2 text-[11px] font-medium bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
                        TP {q.tp}
                      </span>
                    )}
                    <span className="ml-2 text-[11px] text-gray-400">
                      {QUESTION_TYPE_LABELS[q.type]}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      st.percent >= 70
                        ? 'bg-emerald-50 text-emerald-700'
                        : st.percent >= 40
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {st.percent}% benar ({st.correct}/{st.total})
                  </span>
                </div>
                <p className="text-sm text-gray-800 font-medium">{q.question}</p>
              </div>
            )
          })}
        </div>
      )}

      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-semibold text-gray-800">Soal {popup.qIndex + 1}</span>
                <span>·</span>
                <span>{QUESTION_TYPE_LABELS[popup.question.type]}</span>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-900 font-medium mb-4 leading-relaxed">
              {popup.question.question}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-gray-400">Waktu jawab</p>
                <p className="font-semibold text-gray-800">{formatDuration(popup.answer.timeMs)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-gray-400">Hasil</p>
                <p
                  className={`font-semibold ${
                    popup.answer.isCorrect ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {popup.answer.isCorrect ? 'Benar' : 'Salah'}
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl px-3 py-3 text-sm mb-3 ${
                popup.answer.isCorrect
                  ? 'bg-emerald-50 border border-emerald-100'
                  : 'bg-red-50 border border-red-100'
              }`}
            >
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Jawaban {popup.attempt.studentName}
              </p>
              {popup.question.type === 'category' ? (
                <ul className="space-y-1">
                  {popup.question.options.map((stmt, si) => {
                    const labels = popup.question.categoryLabels || DEFAULT_CATEGORY_LABELS
                    const sel = popup.answer.selected[si]
                    return (
                      <li key={si} className="text-gray-800">
                        {stmt} → <strong>{sel >= 0 ? labels[sel] : '—'}</strong>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-gray-800">
                  {popup.answer.selected.length === 0
                    ? '(tidak dijawab)'
                    : popup.answer.selected
                        .map((i) => `${String.fromCharCode(65 + i)}. ${popup.question.options[i] || ''}`)
                        .join('; ')}
                </p>
              )}
            </div>

            {!popup.answer.isCorrect && (
              <div className="rounded-xl px-3 py-3 text-sm bg-gray-50 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-1">Kunci jawaban</p>
                {popup.question.type === 'category' ? (
                  <ul className="space-y-1">
                    {popup.question.options.map((stmt, si) => {
                      const labels = popup.question.categoryLabels || DEFAULT_CATEGORY_LABELS
                      const key = popup.question.correctAnswers[si]
                      return (
                        <li key={si} className="text-gray-800">
                          {stmt} → <strong>{labels[key]}</strong>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-gray-800">
                    {popup.question.correctAnswers
                      .map((i) => `${String.fromCharCode(65 + i)}. ${popup.question.options[i]}`)
                      .join('; ')}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleDeleteAttempt(popup.attempt)}
              disabled={deletingId === popup.attempt.id}
              className="mt-4 w-full text-sm text-red-600 border border-red-100 rounded-xl py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {deletingId === popup.attempt.id ? 'Menghapus...' : 'Reset hasil siswa ini'}
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
