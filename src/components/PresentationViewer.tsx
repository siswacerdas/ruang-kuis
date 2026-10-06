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
  content: 'from-slate-700 to-slate-800',
  bullets: 'from-indigo-500 to-blue-600',
  cards: 'from-teal-500 to-emerald-600',
  compare: 'from-rose-500 to-orange-500',
  assessment: 'from-violet-500 to-purple-600',
}

const cardPalette = [
  { bg: 'bg-emerald-50', border: 'border-emerald-200', num: 'bg-emerald-500 text-white', title: 'text-emerald-900' },
  { bg: 'bg-sky-50', border: 'border-sky-200', num: 'bg-sky-500 text-white', title: 'text-sky-900' },
  { bg: 'bg-amber-50', border: 'border-amber-200', num: 'bg-amber-500 text-white', title: 'text-amber-900' },
  { bg: 'bg-violet-50', border: 'border-violet-200', num: 'bg-violet-500 text-white', title: 'text-violet-900' },
]

function CardsGrid({ cards }: { cards: SlideCard[] }) {
  const cols =
    cards.length <= 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : cards.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`grid ${cols} gap-2.5 sm:gap-3 flex-1 min-h-0`}>
      {cards.map((c, i) => {
        const pal = cardPalette[i % cardPalette.length]
        return (
          <div
            key={i}
            className={`rounded-2xl border-2 ${pal.bg} ${pal.border} px-3.5 py-3.5 flex flex-col shadow-sm`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span
                className={`w-7 h-7 rounded-full ${pal.num} text-xs font-bold flex items-center justify-center shrink-0 shadow-sm`}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                {c.badge && (
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 block leading-none mb-0.5">
                    {c.badge}
                  </span>
                )}
                <p className={`text-sm sm:text-[15px] font-bold leading-snug ${pal.title}`}>{c.title}</p>
              </div>
            </div>
            {c.body && (
              <p className="text-xs sm:text-[13px] leading-relaxed text-slate-700 mb-1.5 flex-1">{c.body}</p>
            )}
            {c.bullets && c.bullets.length > 0 && (
              <ul className="space-y-1 mt-auto">
                {c.bullets.map((b, bi) => (
                  <li key={bi} className="text-xs sm:text-[13px] leading-snug text-slate-700 flex gap-1.5">
                    <span className="text-slate-400 shrink-0 font-bold">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FlowRow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 py-1">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 shadow-sm">
            {s}
          </span>
          {i < steps.length - 1 && (
            <span className="text-indigo-400 text-lg font-bold leading-none" aria-hidden>
              →
            </span>
          )}
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
  const hasBullets = Boolean(slide.bullets && slide.bullets.length > 0)

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-950/90 flex flex-col ${fullscreen ? '' : 'p-0 sm:p-3'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-white">
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

      <div className="flex-1 flex items-stretch justify-center min-h-0 px-2 sm:px-3 pb-2">
        <div
          className={`relative w-full max-w-6xl bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            fullscreen ? 'h-full' : 'min-h-[70vh] sm:min-h-[75vh] max-h-full'
          }`}
        >
          <div className={`h-1.5 sm:h-2 bg-gradient-to-r ${accent} shrink-0`} />

          <div className="flex-1 min-h-0 overflow-y-auto">
            {slide.layout === 'title' ? (
              <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center gap-5 px-6 sm:px-12 py-10 bg-gradient-to-b from-indigo-50/40 to-white">
                {hasImage && (
                  <img
                    src={slide.imageUrl}
                    alt=""
                    className="max-h-40 sm:max-h-52 rounded-2xl object-contain shadow-md border border-slate-100"
                  />
                )}
                <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl leading-[1.15]">
                  {slide.title}
                </h2>
                {slide.body && (
                  <p className="text-base sm:text-xl text-slate-600 max-w-2xl leading-relaxed">{slide.body}</p>
                )}
                {slide.callout && (
                  <p className="text-sm sm:text-base text-indigo-800 bg-indigo-50 border border-indigo-100 px-5 py-3 rounded-2xl max-w-lg font-medium">
                    {slide.callout}
                  </p>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col px-4 sm:px-8 md:px-10 py-5 sm:py-7">
                <div className="shrink-0 mb-3 sm:mb-4">
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
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
                  <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                    {slide.layout === 'quote' ? `"${slide.title}"` : slide.title}
                  </h2>
                  {slide.body && (
                    <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">
                      {slide.body}
                    </p>
                  )}
                </div>

                <div
                  className={`flex-1 min-h-0 flex flex-col gap-3 ${
                    hasImage && !hasCards ? 'md:flex-row md:gap-6' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    {hasBullets && (
                      <ul className="grid sm:grid-cols-2 gap-2 sm:gap-2.5">
                        {slide.bullets!.map((b, bi) => (
                          <li
                            key={bi}
                            className="flex gap-2.5 items-start rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5"
                          >
                            <span
                              className={`mt-0.5 w-6 h-6 rounded-lg bg-gradient-to-br ${accent} text-white text-[11px] font-bold flex items-center justify-center shrink-0`}
                            >
                              {bi + 1}
                            </span>
                            <span className="text-sm text-slate-800 leading-snug pt-0.5">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {hasCards && slide.cards && <CardsGrid cards={slide.cards} />}

                    {hasFlow && slide.flow && (
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3">
                        <FlowRow steps={slide.flow} />
                      </div>
                    )}

                    {hasExamples && slide.examples && (
                      <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3">
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2">
                          Contoh
                        </p>
                        <ul className="grid sm:grid-cols-2 gap-1.5">
                          {slide.examples.map((ex, ei) => (
                            <li key={ei} className="text-sm text-slate-800 flex gap-2 items-start">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span className="leading-snug">{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {slide.callout && (
                      <div className="rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-900 flex gap-2">
                        <span className="text-lg leading-none">💡</span>
                        <span className="leading-relaxed font-medium">{slide.callout}</span>
                      </div>
                    )}

                    {slide.activity && (
                      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-950 flex gap-2">
                        <span className="text-lg leading-none">🎯</span>
                        <div>
                          <span className="font-bold">Aktivitas: </span>
                          {slide.activity}
                        </div>
                      </div>
                    )}
                  </div>

                  {hasImage && (
                    <div className="md:w-52 lg:w-60 shrink-0 flex flex-col items-center justify-center">
                      <img
                        src={slide.imageUrl}
                        alt={slide.imageCaption || ''}
                        className="max-h-48 sm:max-h-56 w-full object-contain rounded-2xl border border-slate-100 bg-slate-50 shadow-sm"
                      />
                      {slide.imageCaption && (
                        <p className="text-[11px] text-slate-400 mt-2 text-center">{slide.imageCaption}</p>
                      )}
                    </div>
                  )}
                </div>

                {slide.footer && (
                  <p className="shrink-0 mt-4 pt-3 border-t border-slate-100 text-xs sm:text-sm text-slate-500 italic text-center">
                    {slide.footer}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 flex items-center justify-center text-xl"
          aria-label="Slide sebelumnya"
        >
          ‹
        </button>
        <div className="flex gap-1.5 max-w-sm overflow-x-auto py-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full shrink-0 transition-all ${
                i === index ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/50 w-2'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= total - 1}
          className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 flex items-center justify-center text-xl"
          aria-label="Slide berikutnya"
        >
          ›
        </button>
      </div>
    </div>
  )
}
