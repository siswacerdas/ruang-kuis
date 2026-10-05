import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
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

const accent: Record<string, { bar: string; icon: string; badge: string }>
  = {
    rose: { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600', badge: 'text-rose-700 bg-rose-50' },
    red: { bar: 'bg-red-500', icon: 'bg-red-50 text-red-600', badge: 'text-red-700 bg-red-50' },
    emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600', badge: 'text-emerald-700 bg-emerald-50' },
    purple: { bar: 'bg-purple-500', icon: 'bg-purple-50 text-purple-600', badge: 'text-purple-700 bg-purple-50' },
    amber: { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600', badge: 'text-amber-800 bg-amber-50' },
    blue: { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600', badge: 'text-blue-700 bg-blue-50' },
    teal: { bar: 'bg-teal-500', icon: 'bg-teal-50 text-teal-600', badge: 'text-teal-700 bg-teal-50' },
    indigo: { bar: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600', badge: 'text-indigo-700 bg-indigo-50' },
  }

function PdfViewer({ pdf, onClose }: { pdf: LessonPdf; onClose: () => void }) {
  const subject = getSubject(pdf.subjectKey)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white w-full sm:max-w-5xl h-[95vh] sm:h-[90vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={pdf.title}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate tracking-tight">{pdf.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {[subject?.name, formatBytes(pdf.sizeBytes)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={viewUrl(pdf.driveFileId)}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Google Drive
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              Tutup
            </button>
          </div>
        </div>
        <iframe
          title={pdf.title}
          src={previewUrl(pdf.driveFileId)}
          className="flex-1 w-full bg-slate-50"
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
      return a.name.localeCompare(b.name, 'id')
    })
    return showEmpty ? list : list.filter((s) => (counts[s.key] || 0) > 0)
  }, [counts, showEmpty])

  if (subject) {
    const a = accent[subject.color] || accent.indigo
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => onSelect('')}
            className="font-medium text-indigo-600 hover:text-indigo-800 transition"
          >
            Materi
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium truncate">{subject.name}</span>
        </nav>

        <header className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl shrink-0 ${a.icon}`}>
            {subject.icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">{subject.name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {pdfs.length > 0
                ? `${pdfs.length} dokumen presentasi`
                : 'Belum ada dokumen untuk mapel ini'}
            </p>
          </div>
        </header>

        {pdfs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">Dokumen belum tersedia</p>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Presentasi PDF untuk mapel ini belum diunggah ke Pustaka Belajar.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {pdfs.map((pdf, i) => (
              <button
                key={pdf.id}
                type="button"
                onClick={() => setOpen(pdf)}
                className="w-full text-left group flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50/80 transition"
              >
                <span className="w-8 h-8 rounded-md bg-slate-100 text-slate-500 text-xs font-semibold tabular-nums flex items-center justify-center shrink-0 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition truncate">
                    {pdf.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 tabular-nums">{formatBytes(pdf.sizeBytes)} · PDF</p>
                </div>
                <span className="hidden sm:inline-flex text-xs font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition shrink-0">
                  Pratinjau
                </span>
                <svg
                  className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {open && <PdfViewer pdf={open} onClose={() => setOpen(null)} />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200/80 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pustaka Belajar</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight mt-1">
          Materi pelajaran
        </h2>
        <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
          Koleksi presentasi PDF per mata pelajaran. Pilih mapel untuk membuka dokumen.
        </p>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Dokumen</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums mt-0.5">{totalPdfs}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Mapel siap</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums mt-0.5">{mapelWithPdfs}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 col-span-2 sm:col-span-1">
            <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Total mapel</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums mt-0.5">{SUBJECTS.length}</dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {showEmpty
            ? `Semua ${SUBJECTS.length} mata pelajaran`
            : `${mapelWithPdfs} mata pelajaran dengan dokumen`}
        </p>
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="text-xs font-medium text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:text-slate-900 transition"
        >
          {showEmpty ? 'Hanya yang tersedia' : 'Tampilkan semua'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {orderedSubjects.map((s) => {
          const a = accent[s.color] || accent.indigo
          const n = counts[s.key] || 0
          const has = n > 0
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              className={`text-left group relative bg-white rounded-xl border border-slate-200 overflow-hidden transition
                hover:border-slate-300 hover:shadow-sm
                ${!has ? 'opacity-60' : ''}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${has ? a.bar : 'bg-slate-200'}`} />
              <div className="pl-4 pr-4 py-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${a.icon}`}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition leading-snug">
                    {s.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{s.shortName}</p>
                  <p className="mt-2.5">
                    {has ? (
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md ${a.badge}`}>
                        {n} dokumen
                      </span>
                    ) : (
                      <span className="inline-flex text-[11px] font-medium text-slate-400 px-2 py-0.5 rounded-md bg-slate-50">
                        Kosong
                      </span>
                    )}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-1 transition"
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
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 tracking-tight">Materi pelajaran</p>
            <p className="text-[11px] text-slate-500">Pustaka Belajar</p>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
        <MateriBody selectedKey={selectedKey} onSelect={onSelect} />
      </main>
      <StudentNav />
    </div>
  )
}
