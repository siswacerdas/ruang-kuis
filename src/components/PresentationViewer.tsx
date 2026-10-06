import { useCallback, useEffect, useState } from 'react'
import type { PresentationSlide, SlideCard } from '../lib/openaiPresentation'
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
  cards: 'from-teal-500 to-emerald-600',
  compare: 'from-rose-500 to-orange-500',
  assessment: 'from-violet-500 to-purple-600',
}

const cardColors = [
  'bg-emerald-50 border-emerald-100 text-emerald-900',
  'bg-sky-50 border-sky-100 text-sky-900',
  'bg-amber-50 border-amber-100 text-amber-900',
  'bg-violet-50 border-violet-100 text-violet-900',
]

function CardsGrid({ cards }: { cards: SlideCard[] }) {
  const cols =
    cards.length <= 2 ? 'sm:grid-cols-2' : cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-1 ${cols} gap-3 mt-3`}>
      {cards.map((c, i) => (
        <div
          key={i}
          className={`rounded-xl border px-3.5 py-3 ${cardColors[i % cardColors.length]}`}
        >
          <div className="flex items-start gap-2 mb-1.5">
            <span className="w-6 h-6 rounded-full bg-white/80 text-xs font-bold flex items-center justify-center shrink-0 border border-black/5">
              {i + 1}
            </span>
            <div className="min-w-0">
              {c.badge && (
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.badge}</span>
              )}
              <p className="text-sm font-bold leading-snug">{c.title}</p>
            </div>
          </div>
          {c.body && <p className="text-xs leading-relaxed opacity-90 mb-1.5">{c.body}</p>}
          {c.bullets && c.bullets.length > 0 && (
            <ul className="space-y-1">
              {c.bullets.map((b, bi) => (
                <li key={bi} className="text-xs leading-snug flex gap-1.5">
                  <span className="opacity-50 shrink-0">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function FlowRow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800">
            {s}
          </span>
          {i < steps.length - 1 && <span className="text-slate-300 text-sm">→</span>}
        </div>
      ))}
    </div>
  )
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
  const hasCards = Boolean(slide.cards && slide.cards.length > 0)
  const hasFlow = Boolean(slide.flow && slide.flow.length > 0)
  const hasExamples = Boolean(slide.examples && slide.examples.length > 0)

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

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 md:p-8">
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
                className={`grid gap-4 ${
                  hasImage && !hasCards && slide.layout !== 'image-focus'
                    ? 'md:grid-cols-[1fr_200px]'
                    : ''
                } ${slide.layout === 'image-focus' ? 'md:grid-cols-[1fr_1fr] items-center' : ''}`}
              >
                <div className="min-w-0 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {slide.layout === 'summary'
                      ? 'Ringkasan'
                      : slide.layout === 'activity'
                        ? 'Aktivitas'
                        : slide.layout === 'section'
                          ? 'Bagian'
                          : slide.layout === 'quote'
                            ? 'Renungan'
                            : slide.layout === 'cards' || slide.layout === 'compare'
                              ? 'Konsep'
                              : slide.layout === 'assessment'
                                ? 'Asesmen'
                                : 'Materi'}
                  </p>
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                    {slide.layout === 'quote' ? `"${slide.title}"` : slide.title}
                  </h2>
                  {slide.body && (
                    <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed whitespace-pre-line">
                      {slide.body}
                    </p>
                  )}
                  {slide.bullets && slide.bullets.length > 0 && (
                    <ul className="space-y-1.5 mt-1">
                      {slide.bullets.map((b, bi) => (
                        <li key={bi} className="flex gap-2.5 text-sm text-slate-700">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 bg-gradient-to-br ${accent}`}
                          />
                          <span className="leading-snug">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasCards && slide.cards && <CardsGrid cards={slide.cards} />}
                  {hasFlow && slide.flow && <FlowRow steps={slide.flow} />}
                  {hasExamples && slide.examples && (
                    <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Contoh
                      </p>
                      <ul className="grid sm:grid-cols-2 gap-1">
                        {slide.examples.map((ex, ei) => (
                          <li key={ei} className="text-xs sm:text-sm text-slate-700 flex gap-1.5">
                            <span className="text-emerald-500 shrink-0">✓</span>
                            <span>{ex}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {slide.callout && (
                    <div className="mt-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3.5 py-2.5 text-sm text-indigo-800">
                      <span className="font-semibold">💡 </span>
                      {slide.callout}
                    </div>
                  )}
                  {slide.activity && (
                    <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-sm text-amber-900">
                      <span className="font-semibold">🎯 Aktivitas: </span>
                      {slide.activity}
                    </div>
                  )}
                  {slide.footer && (
                    <p className="mt-3 text-xs sm:text-sm text-slate-500 italic border-t border-slate-100 pt-2.5">
                      {slide.footer}
                    </p>
                  )}
                </div>
                {hasImage && (
                  <div className="flex flex-col items-center justify-center">
                    <img
                      src={slide.imageUrl}
                      alt={slide.imageCaption || ''}
                      className="max-h-44 sm:max-h-52 w-full object-contain rounded-xl border border-slate-100 bg-slate-50 shadow-sm"
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
