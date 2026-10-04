import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface ResultPayload {
  attemptId: string
  score: number
  total: number
  percent: number
  showScore: boolean
  name: string
  title: string
  tpSummary?: Record<string, { correct: number; total: number }>
}

export default function KerjakanResult() {
  const navigate = useNavigate()
  const [data, setData] = useState<ResultPayload | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('rk_result')
    if (!raw) {
      navigate('/kerjakan')
      return
    }
    try {
      setData(JSON.parse(raw))
    } catch {
      navigate('/kerjakan')
    }
  }, [])

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Latihan selesai!</h1>
        <p className="text-sm text-gray-500 mb-6">
          {data.name} · {data.title}
        </p>

        {data.showScore ? (
          <>
            <div className="bg-indigo-50 rounded-2xl py-6 px-4 mb-5">
              <p className="text-4xl font-bold text-indigo-700">{data.percent}</p>
              <p className="text-sm text-indigo-600 mt-1">
                {data.score} benar dari {data.total} soal
              </p>
            </div>
            {data.tpSummary && Object.keys(data.tpSummary).length > 0 && (
              <div className="text-left mb-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Capaian per TP
                </p>
                <div className="space-y-1.5">
                  {Object.entries(data.tpSummary).map(([tp, v]) => {
                    const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0
                    return (
                      <div key={tp} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600 w-24 truncate" title={tp}>TP {tp}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {v.correct}/{v.total}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 mb-6">
            Jawaban sudah terkirim. Skor akan diumumkan oleh guru.
          </p>
        )}

        <Link
          to="/kerjakan"
          className="inline-flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition"
        >
          Selesai
        </Link>
      </div>
    </div>
  )
}
