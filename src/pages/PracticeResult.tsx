import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface ResultPayload {
  attemptId: string
  score: number
  total: number
  percent: number
  name: string
  title: string
  tpSummary?: Record<string, { correct: number; total: number }>
}

function feedback(percent: number): { title: string; body: string; tone: string } {
  if (percent >= 85)
    return {
      title: 'Kerja bagus!',
      body: 'Pemahamanmu pada materi ini sudah kuat. Latihan mandiri membantu menjaga kemampuan.',
      tone: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    }
  if (percent >= 70)
    return {
      title: 'Sudah baik',
      body: 'Sebagian besar soal berhasil. Coba ulangi materi yang masih lemah.',
      tone: 'bg-sky-50 text-sky-800 border-sky-100',
    }
  if (percent >= 40)
    return {
      title: 'Perlu penguatan',
      body: 'Beberapa konsep masih lemah. Baca materi lalu latihan lagi.',
      tone: 'bg-amber-50 text-amber-900 border-amber-100',
    }
  return {
    title: 'Ayo coba lagi',
    body: 'Skor masih rendah. Ulangi latihan mandiri pada materi yang sama.',
    tone: 'bg-rose-50 text-rose-800 border-rose-100',
  }
}

export default function PracticeResult() {
  const navigate = useNavigate()
  const [data, setData] = useState<ResultPayload | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_practice_result')
    if (!raw) {
      navigate('/siswa/latihan-mandiri', { replace: true })
      return
    }
    try {
      setData(JSON.parse(raw))
    } catch {
      navigate('/siswa/latihan-mandiri', { replace: true })
    }
  }, [navigate])

  const tpRows = useMemo(() => {
    if (!data?.tpSummary) return []
    return Object.entries(data.tpSummary)
      .map(([tp, v]) => ({
        tp,
        correct: v.correct,
        total: v.total,
        percent: v.total ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.percent - b.percent || a.tp.localeCompare(b.tp, 'id'))
  }, [data])

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const fb = feedback(data.percent)
  const scoreTone =
    data.percent >= 70 ? 'text-emerald-700' : data.percent >= 40 ? 'text-amber-700' : 'text-red-700'
  const scoreBg =
    data.percent >= 70 ? 'bg-emerald-50' : data.percent >= 40 ? 'bg-amber-50' : 'bg-red-50'

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${scoreBg}`}>
            <svg className={`w-8 h-8 ${scoreTone}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-600 mb-1">
            Latihan mandiri
          </p>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Selesai!</h1>
          <p className="text-sm text-gray-500 mb-5">
            {data.name} · {data.title}
          </p>
        </div>

        <div className={`rounded-2xl py-6 px-4 mb-4 text-center ${scoreBg}`}>
          <p className={`text-4xl font-bold tabular-nums ${scoreTone}`}>{data.percent}%</p>
          <p className={`text-sm mt-1 ${scoreTone}`}>
            {data.score} benar dari {data.total} soal
          </p>
        </div>

        <div className={`rounded-xl border px-4 py-3 mb-5 text-left text-sm ${fb.tone}`}>
          <p className="font-semibold">{fb.title}</p>
          <p className="mt-0.5 opacity-90 leading-relaxed">{fb.body}</p>
        </div>

        {tpRows.length > 0 && (
          <div className="text-left mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Capaian per TP
            </p>
            <div className="space-y-2">
              {tpRows.map((row) => (
                <div key={row.tp} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-700 w-24 truncate font-medium" title={row.tp}>
                    {row.tp}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.percent >= 70
                          ? 'bg-emerald-500'
                          : row.percent >= 40
                            ? 'bg-amber-400'
                            : 'bg-red-400'
                      }`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right tabular-nums">
                    {row.correct}/{row.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center mb-4">
          Ringkasan juga dikirim ke email orang tua (jika terisi).
        </p>

        <div className="flex flex-col gap-2">
          <Link
            to="/siswa/latihan-mandiri"
            className="inline-flex items-center justify-center w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-xl transition"
          >
            Latihan lagi
          </Link>
          <Link
            to="/kerjakan/riwayat"
            className="inline-flex items-center justify-center w-full border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition"
          >
            Lihat riwayat
          </Link>
          <Link
            to="/siswa"
            className="inline-flex items-center justify-center w-full text-sm text-gray-500 py-2"
          >
            Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
