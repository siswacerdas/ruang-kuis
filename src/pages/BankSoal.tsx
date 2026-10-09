import { useEffect, useState } from 'react'
import { where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { countDocs } from '../lib/serverCounts'
import Layout from '../components/Layout'
import { SUBJECTS } from '../types/question'

interface SubjectStats {
  topicCount: number
  questionCount: number
}

const colorMap: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'hover:border-rose-200', iconBg: 'bg-rose-100 text-rose-600' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'hover:border-red-200', iconBg: 'bg-red-100 text-red-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'hover:border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'hover:border-purple-200', iconBg: 'bg-purple-100 text-purple-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'hover:border-amber-200', iconBg: 'bg-amber-100 text-amber-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'hover:border-blue-200', iconBg: 'bg-blue-100 text-blue-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'hover:border-teal-200', iconBg: 'bg-teal-100 text-teal-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'hover:border-indigo-200', iconBg: 'bg-indigo-100 text-indigo-600' },
}

export default function BankSoal() {
  const [stats, setStats] = useState<Record<string, SubjectStats>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Hitung per mapel di server — tidak mengunduh semua soal (berisi gambar & kunci jawaban).
        const entries = await Promise.all(
          SUBJECTS.map(async (s) => {
            const [topicCount, questionCount] = await Promise.all([
              countDocs('topics', where('subjectKey', '==', s.key)),
              countDocs('questions', where('subjectKey', '==', s.key)),
            ])
            return [s.key, { topicCount, questionCount }] as const
          })
        )
        const next: Record<string, SubjectStats> = {}
        entries.forEach(([key, value]) => {
          next[key] = value
        })

        setStats(next)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <Layout
      title="Bank Soal"
      subtitle="Pilih mata pelajaran untuk mengelola materi dan soal"
    >
      <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-sm text-indigo-800">
        <p className="font-medium mb-1">Pool soal per mata pelajaran</p>
        <p className="text-indigo-700/80">
          Setiap materi (misalnya Ekosistem, Bunyi &amp; Cahaya) berada di bawah mapel yang sama.
          Soal dari semua materi dalam satu mapel dapat digabung saat membuat latihan ATS / AS nanti.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Memuat data...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SUBJECTS.map((subject) => {
            const c = colorMap[subject.color] || colorMap.indigo
            const s = stats[subject.key] || { topicCount: 0, questionCount: 0 }
            return (
              <Link
                key={subject.key}
                to={`/bank-soal/${subject.key}`}
                className={`group bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md ${c.border} transition-all`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${c.iconBg}`}>
                    {subject.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition truncate">
                      {subject.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{subject.shortName}</p>
                    <div className="flex gap-3 mt-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-semibold text-gray-700">{s.topicCount}</span> materi
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="font-semibold text-gray-700">{s.questionCount}</span> soal
                      </span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 shrink-0 mt-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
