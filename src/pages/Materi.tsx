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

const colorMap: Record<
  string,
  { card: string; icon: string; ring: string; soft: string }
> = {
  rose: {
    card: 'hover:border-rose-200 hover:shadow-rose-100/80',
    icon: 'bg-rose-100 text-rose-600',
    ring: 'ring-rose-200',
    soft: 'bg-rose-50 text-rose-700',
  },
  red: {
    card: 'hover:border-red-200 hover:shadow-red-100/80',
    icon: 'bg-red-100 text-red-600',
    ring: 'ring-red-200',
    soft: 'bg-red-50 text-red-700',
  },
  emerald: {
    card: 'hover:border-emerald-200 hover:shadow-emerald-100/80',
    icon: 'bg-emerald-100 text-emerald-600',
    ring: 'ring-emerald-200',
    soft: 'bg-emerald-50 text-emerald-700',
  },
  purple: {
    card: 'hover:border-purple-200 hover:shadow-purple-100/80',
    icon: 'bg-purple-100 text-purple-600',
    ring: 'ring-purple-200',
    soft: 'bg-purple-50 text-purple-700',
  },
  amber: {
    card: 'hover:border-amber-200 hover:shadow-amber-100/80',
    icon: 'bg-amber-100 text-amber-600',
    ring: 'ring-amber-200',
    soft: 'bg-amber-50 text-amber-700',
  },
  blue: {
    card: 'hover:border-blue-200 hover:shadow-blue-100/80',
    icon: 'bg-blue-100 text-blue-600',
    ring: 'ring-blue-200',
    soft: 'bg-blue-50 text-blue-700',
  },
  teal: {
    card: 'hover:border-teal-200 hover:shadow-teal-100/80',
    icon: 'bg-teal-100 text-teal-600',
    ring: 'ring-teal-200',
    soft: 'bg-teal-50 text-teal-700',
  },
  indigo: {
    card: 'hover:border-indigo-200 hover:shadow-indigo-100/80',
    icon: 'bg-indigo-100 text-indigo-600',
    ring: 'ring-indigo-200',
    soft: 'bg-indigo-50 text-indigo-700',
  },
}

function PdfViewer({ pdf, onClose }: { pdf: LessonPdf; onClose: () => void }) {
  const subject = getSubject(pdf.subjectKey)
  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white w-full sm:max-w-5xl h-[94vh] sm:h-[88vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={pdf.title}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 bg-white">
          <div className="min-w-0 flex items-center gap-3">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-rose-50 text-rose-600 items-center justify-center text-[10px] font-bold shrink-0">
              PDF
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{pdf.title}</p>
              <p className="text-xs text-gray-400 truncate">
                {subject?.name}
                {subject ? ' · ' : ''}
                {formatBytes(pdf.sizeBytes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={viewUrl(pdf.driveFileId)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-indigo-600 px-3 py-2 rounded-xl hover:bg-indigo-50 transition"
            >
              Buka di Drive
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
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
  selectedKey,
  onSelect,
}: {
  selectedKey: string
  onSelect: (key: string) => void
}) {
  const [open, setOpen] = useState<LessonPdf | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)

  const subject = selectedKey ? getSubject(selectedKey) : undefined
  const pdfs = subject ? pdfsForSubject(subject.key) : []

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    LESSON_PDFS.forEach((p) => {
      map[p.subjectKey] = (map[p.subjectKey] || 0) + 1
    })
    return map
  }, [])

  const totalPdfs = LESSON_PDFS.length
  const mapelWithPdfs = SUBJECTS.filter((s) => (counts[s.key] || 0) > 0).length

  const orderedSubjects = useMemo(() => {
    const list = [...SUBJECTS]
    list.sort((a, b) => {
      const ca = counts[a.key] || 0
      const cb = counts[b.key] || 0
      if (ca > 0 && cb === 0) return -1
      if (ca === 0 && cb > 0) return 1
      return 0
    })
    return showEmpty ? list : list.filter((s) => (counts[s.key] || 0) > 0)
  }, [counts, showEmpty])

  if (subject) {
    const c = colorMap[subject.color] || colorMap.indigo
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect('')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-1.5 rounded-xl hover:bg-indigo-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Semua mapel
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${c.icon}`}>
            {subject.icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{subject.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {pdfs.length > 0
                ? `${pdfs.length} presentasi PDF siap dibuka`
                : 'Belum ada presentasi untuk mapel ini'}
            </p>
          </div>
        </div>

        {pdfs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-5 py-14 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">Belum ada PDF</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              Presentasi untuk mapel ini belum diunggah di folder Pustaka Belajar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pdfs.map((pdf, i) => (
              <button
                key={pdf.id}
                type="button"
                onClick={() => setOpen(pdf)}
                className="text-left group bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-50 to-orange-50 text-rose-600 flex flex-col items-center justify-center shrink-0 border border-rose-100/80">
                    <span className="text-[10px] font-bold leading-none">PDF</span>
                    <span className="text-[9px] text-rose-400 mt-0.5 tabular-nums">{i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition leading-snug">
                      {pdf.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{formatBytes(pdf.sizeBytes)}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-indigo-500 font-medium group-hover:underline">Buka pratinjau</span>
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 shrink-0 mt-1 transition"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {open && <PdfViewer pdf={open} onClose={() => setOpen(null)} />}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white p-5 sm:p-6 shadow-sm">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-8 w-32 h-32 bg-indigo-300 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10">
          <p className="text-indigo-100 text-[11px] font-semibold uppercase tracking-wide mb-1">
            Pustaka Belajar
          </p>
          <h2 className="text-xl sm:text-2xl font-bold leading-tight">Presentasi materi</h2>
          <p className="text-indigo-100/90 text-sm mt-1.5 max-w-lg">
            Pilih mata pelajaran, lalu buka PDF. File tersimpan di Google Drive dan ditampilkan sebagai
            pratinjau.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3.5 py-2">
              <p className="text-[10px] text-indigo-100/80 uppercase tracking-wide">Presentasi</p>
              <p className="text-lg font-bold tabular-nums">{totalPdfs}</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3.5 py-2">
              <p className="text-[10px] text-indigo-100/80 uppercase tracking-wide">Mapel siap</p>
              <p className="text-lg font-bold tabular-nums">{mapelWithPdfs}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {showEmpty
            ? `Menampilkan semua ${SUBJECTS.length} mapel`
            : `${mapelWithPdfs} mapel punya presentasi`}
        </p>
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="text-xs font-medium text-gray-600 px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:border-indigo-200 hover:text-indigo-700 transition"
        >
          {showEmpty ? 'Sembunyikan mapel kosong' : 'Tampilkan semua mapel'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {orderedSubjects.map((s) => {
          const c = colorMap[s.color] || colorMap.indigo
          const n = counts[s.key] || 0
          const has = n > 0
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              className={`text-left group bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md ${c.card} transition-all ${!
                has ? 'opacity-75' : ''
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl ${c.icon}`}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition leading-snug">
                    {s.name}
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.shortName}</p>
                  <div className="mt-3">
                    {has ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${c.soft}`}>
                        <span className="tabular-nums">{n}</span> presentasi
                      </span>
                    ) : (
                      <span className="inline-flex text-[11px] text-gray-400 px-2 py-0.5 rounded-full bg-gray-50">
                        Belum ada presentasi
                      </span>
                    )}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 shrink-0 mt-1 transition"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          )
        })}
      </div>

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
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Materi pelajaran</p>
            <p className="text-xs text-gray-500 truncate">Presentasi PDF Pustaka Belajar</p>
          </div>
          <Link
            to="/siswa"
            className="text-xs font-medium text-indigo-600 px-3 py-2 rounded-xl hover:bg-indigo-50 transition shrink-0"
          >
            Beranda
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <MateriBody selectedKey={selectedKey} onSelect={onSelect} />
      </main>
    </div>
  )
}
