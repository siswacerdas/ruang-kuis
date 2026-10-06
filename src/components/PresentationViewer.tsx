import { useCallback, useEffect, useState } from 'react'
import type { PresentationSlide } from '../lib/openaiPresentation'
import { exportPresentationToPdf } from '../lib/exportPresentationPdf'

type Props = {
  title: string
  subjectName: string
  slides: PresentationSlide[]
  onClose: () => void
  showExport?: boolean
}

const layoutAccent: Record<string, string> = {
  title: 'from-indigo-600 to-violet-600',
  section: 'from-sky-500 to-indigo-500',
  summary: 'from-emerald-500 to-teal-600',
  activity: 'from-amber-500 to-orange-500',
  quote: 'from-purple-500 to-fuchsia-600',
  'image-focus': 'from-cyan-500 to-blue-600',
  content: 'from-slate-600 to-slate-700',
  bullets: 'from-indigo-500 to-blue-600',
}

export default function PresentationViewer({
  title,
  subjectName,
  slides,
  onClose,
  showExport = true,
}: Props) {
  const [index, setIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const total = slides.length
  const slide = slides[index]

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => Math.max(0, Math.min(total - 1, i + dir)))
    },
    [total]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      }
      if (e.key === 'Home') setIndex(0)
      if (e.key === 'End') setIndex(total - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, total])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportPresentationToPdf(title, subjectName, slides)
    } catch (e: any) {
      alert(e?.message || 'Gagal mengekspor PDF.')
    } finally {
      setExporting(false)
    }
  }

  if (!slide) return null

  const accent = layoutAccent[slide.layout] || layoutAccent.content
  const hasImage = Boolean(slide.imageUrl)

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-900/80 flex flex-col ${fullscreen ? '' : 'p-0 sm:p-4'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-slate-900/90 text-white">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {subjectName} · Slide {index + 1}/{total}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
            >
              {exporting ? 'PDF…' : 'Unduh PDF'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 hidden sm:inline"
          >
            {fullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            Tutup
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 p-2 sm:p-4">
        <div
          className={`relative w-full max-w-5xl aspect-[16/10] bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            fullscreen ? 'max-h-full' : ''
          }`}
        >
          <div className={`h-1.5 sm:h-2 bg-gradient-to-r ${accent} shrink-0`} />

          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 md:p-10">
            {slide.layout === 'title' ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                {hasImage && (
                  <img
                    src={slide.imageUrl}
                    alt=""
                    className="max-h-36 sm:max-h-44 rounded-xl object-contain shadow-sm border border-slate-100"
                  />
                )}
                <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight max-w-2xl leading-tight">
                  {slide.title}
                </h2>
                {slide.body && (
                  <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">{slide.body}</p>
                )}
                {slide.callout && (
                  <p className="text-sm text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl max-w-md">{slide.callout}</p>
                )}
              </div>
            ) : (
              <div
                className={`grid gap-5 ${hasImage && slide.layout !== 'image-focus' ? 'md:grid-cols-[1fr_220px]' : ''} ${
                  slide.layout === 'image-focus' ? 'md:grid-cols-[1fr_1fr] items-center' : ''
                }`}
              >
                <div className="min-w-0 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {slide.layout === 'summary'
                      ? 'Ringkasan'
                      : slide.layout === 'activity'
                        ? 'Aktivitas'
                        : slide.layout === 'section'
                          ? 'Bagian'
                          : slide.layout === 'quote'
                            ? 'Renungan'
                            : 'Materi'}
                  </p>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                    {slide.layout === 'quote' ? `"${slide.title}"` : slide.title}
                  </h2>
                  {slide.body && (
                    <p className="text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-line">
                      {slide.body}
                    </p>
                  )}
                  {slide.bullets && slide.bullets.length > 0 && (
                    <ul className="space-y-2 mt-2">
                      {slide.bullets.map((b, bi) => (
                        <li key={bi} className="flex gap-2.5 text-sm sm:text-base text-slate-700">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 bg-gradient-to-br ${accent}`}
                          />
                          <span className="leading-snug">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {slide.callout && (
                    <div className="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-800">
                      <span className="font-semibold">💡 </span>
                      {slide.callout}
                    </div>
                  )}
                  {slide.activity && (
                    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
                      <span className="font-semibold">🎯 Aktivitas: </span>
                      {slide.activity}
                    </div>
                  )}
                </div>
                {hasImage && (
                  <div className="flex flex-col items-center justify-center">
                    <img
                      src={slide.imageUrl}
                      alt={slide.imageCaption || ''}
                      className="max-h-48 sm:max-h-56 w-full object-contain rounded-xl border border-slate-100 bg-slate-50 shadow-sm"
                    />
                    {slide.imageCaption && (
                      <p className="text-[11px] text-slate-400 mt-2 text-center">{slide.imageCaption}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-3 bg-slate-900/90">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
          aria-label="Slide sebelumnya"
        >
          ‹
        </button>
        <div className="flex gap-1.5 max-w-xs overflow-x-auto py-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`w-2 h-2 rounded-full shrink-0 transition ${
                i === index ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= total - 1}
          className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"
          aria-label="Slide berikutnya"
        >
          ›
        </button>
      </div>
    </div>
  )
}
