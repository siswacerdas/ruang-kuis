import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import {
  LESSON_PDFS,
  formatBytes,
  pdfsForSubject,
  previewUrl,
  viewUrl,
  type LessonPdf,
} from '../lib/lessonMaterials'

const colorMap: Record<string, { card: string; icon: string; chip: string }> = {
  rose: { card: 'hover:border-rose-200', icon: 'bg-rose-100 text-rose-600', chip: 'bg-rose-50 text-rose-700' },
  red: { card: 'hover:border-red-200', icon: 'bg-red-100 text-red-600', chip: 'bg-red-50 text-red-700' },
  emerald: { card: 'hover:border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
  purple: { card: 'hover:border-purple-200', icon: 'bg-purple-100 text-purple-600', chip: 'bg-purple-50 text-purple-700' },
  amber: { card: 'hover:border-amber-200', icon: 'bg-amber-100 text-amber-600', chip: 'bg-amber-50 text-amber-700' },
  blue: { card: 'hover:border-blue-200', icon: 'bg-blue-100 text-blue-600', chip: 'bg-blue-50 text-blue-700' },
  teal: { card: 'hover:border-teal-200', icon: 'bg-teal-100 text-teal-600', chip: 'bg-teal-50 text-teal-700' },
  indigo: { card: 'hover:border-indigo-200', icon: 'bg-indigo-100 text-indigo-600', chip: 'bg-indigo-50 text-indigo-700' },
}

function PdfViewer({ pdf, onClose }: { pdf: LessonPdf; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-gray-900/50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-5xl h-[92vh] sm:h-[86vh] sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{pdf.title}</p>
            <p className="text-xs text-gray-400 truncate">
              {getSubject(pdf.subjectKey)?.name} · {formatBytes(pdf.sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={viewUrl(pdf.driveFileId)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
            >
              Buka di Drive
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              Tutup
            </button>
          </div>
        </div>
        <iframe
          title={pdf.title}
          src={previewUrl(pdf.driveFileId)}
          className="flex-1 w-full bg-gray-50"
          allow="autoplay"
        />
      </div>
    </div>
  )
}

function MateriBody({
  backTo,
  selectedKey,
  onSelect,
}: {
  backTo?: string
  selectedKey: string
  onSelect: (key: string) => void
}) {
  const [open, setOpen] = useState<LessonPdf | null>(null)
  const subject = selectedKey ? getSubject(selectedKey) : undefined
  const pdfs = subject ? pdfsForSubject(subject.key) : []
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    LESSON_PDFS.forEach((p) => {
      map[p.subjectKey] = (map[p.subjectKey] || 0) + 1
    })
    return map
  }, [])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-sm text-indigo-800">
        <p className="font-medium mb-1">Presentasi dari Pustaka Belajar</p>
        <p className="text-indigo-700/80">
          Pilih mata pelajaran, lalu buka PDF. File tetap di Google Drive dan ditampilkan lewat pratinjau.
          Mapel yang belum punya file akan tertulis “belum ada presentasi”.
        </p>
      </div>

      {!subject ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SUBJECTS.map((s) => {
            const c = colorMap[s.color] || colorMap.indigo
            const n = counts[s.key] || 0
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelect(s.key)}
                className={`text-left group bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md ${c.card} transition-all`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${c.icon}`}>
                    {s.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition truncate">
                      {s.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{s.shortName}</p>
                    <p className="text-xs text-gray-500 mt-3">
                      <span className="font-semibold text-gray-700">{n}</span>{' '}
                      {n ? 'presentasi PDF' : 'belum ada presentasi'}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelect('')}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ← Semua mapel
            </button>
            {backTo && (
              <Link to={backTo} className="text-xs text-gray-500 hover:text-gray-800">
                Kembali
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${(colorMap[subject.color] || colorMap.indigo).icon}`}>
              {subject.icon}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{subject.name}</h2>
              <p className="text-xs text-gray-500">{pdfs.length} presentasi</p>
            </div>
          </div>

          {pdfs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-5 py-12 text-center text-sm text-gray-500">
              Belum ada PDF untuk mapel ini di folder Pustaka Belajar.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pdfs.map((pdf) => (
                <button
                  key={pdf.id}
                  type="button"
                  onClick={() => setOpen(pdf)}
                  className="text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xs font-bold shrink-0">
                      PDF
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{pdf.title}</p>
                      <p className="text-xs text-gray-400 mt-1 truncate">{pdf.fileName}</p>
                      <p className="text-xs text-gray-500 mt-2">{formatBytes(pdf.sizeBytes)} · ketuk untuk melihat</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {open && <PdfViewer pdf={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export default function Materi({ audience }: { audience: 'admin' | 'student' }) {
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('mapel') || ''

  const onSelect = (key: string) => {
    if (!key) setParams({})
    else setParams({ mapel: key })
  }

  if (audience === 'admin') {
    const subject = selectedKey ? getSubject(selectedKey as SubjectKey) : undefined
    return (
      <Layout
        title="Materi"
        subtitle={subject ? subject.name : 'Presentasi PDF per mata pelajaran'}
      >
        <MateriBody selectedKey={selectedKey} onSelect={onSelect} />
      </Layout>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Materi pelajaran</p>
            <p className="text-xs text-gray-500">Presentasi PDF Pustaka Belajar</p>
          </div>
          <Link
            to="/siswa"
            className="text-xs font-medium text-indigo-600 px-3 py-2 rounded-xl hover:bg-indigo-50"
          >
            Beranda
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <MateriBody backTo="/siswa" selectedKey={selectedKey} onSelect={onSelect} />
      </main>
    </div>
  )
}
