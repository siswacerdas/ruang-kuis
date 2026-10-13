import { useCallback, useEffect, useState, type ReactNode } from 'react'

/** Rentang skrip Arab (Arabic + presentation forms). */
const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const ARABIC_RUN = /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*)/g

export function hasArabic(text: string): boolean {
  return ARABIC_CHAR.test(text || '')
}

/**
 * Pecah teks biasa menjadi segmen Latin / Arab.
 * Segmen Arab dibungkus <span class="arabic-text" dir="rtl" lang="ar">.
 */
export function QuizText({
  text,
  className,
  as: Tag = 'span',
}: {
  text: string
  className?: string
  as?: 'span' | 'p' | 'div'
}) {
  if (!text) return null
  if (!hasArabic(text)) {
    return <Tag className={className}>{text}</Tag>
  }
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(ARABIC_RUN.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index))
    }
    parts.push(
      <span key={`ar-${m.index}`} className="arabic-text" dir="rtl" lang="ar">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <Tag className={className}>{parts}</Tag>
}

/** Bungkus run Arab di dalam HTML stimulus (teks node saja). */
export function wrapArabicInHtml(html: string): string {
  if (!html || !hasArabic(html)) return html
  try {
    const doc = new DOMParser().parseFromString(`<div id="rk-root">${html}</div>`, 'text/html')
    const root = doc.getElementById('rk-root')
    if (!root) return html

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent || ''
        if (!hasArabic(value) || !node.parentNode) return
        const frag = doc.createDocumentFragment()
        let last = 0
        const re = new RegExp(ARABIC_RUN.source, 'g')
        let m: RegExpExecArray | null
        while ((m = re.exec(value)) !== null) {
          if (m.index > last) {
            frag.appendChild(doc.createTextNode(value.slice(last, m.index)))
          }
          const span = doc.createElement('span')
          span.className = 'arabic-text'
          span.setAttribute('dir', 'rtl')
          span.setAttribute('lang', 'ar')
          span.textContent = m[0]
          frag.appendChild(span)
          last = m.index + m[0].length
        }
        if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)))
        node.parentNode.replaceChild(frag, node)
        return
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.classList?.contains('arabic-text') || el.classList?.contains('math-tex')) return
        Array.from(node.childNodes).forEach(walk)
      }
    }
    walk(root)
    return root.innerHTML
  } catch {
    return html
  }
}

const STORAGE_KEY = 'rk_quiz_text_scale'
export const QUIZ_SCALE_STEPS = [0.9, 1, 1.15, 1.3] as const
export type QuizScale = (typeof QUIZ_SCALE_STEPS)[number]

function readScale(): QuizScale {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY))
    if (QUIZ_SCALE_STEPS.includes(v as QuizScale)) return v as QuizScale
  } catch {
    /* ignore */
  }
  return 1
}

export function useQuizTextScale() {
  const [scale, setScaleState] = useState<QuizScale>(() =>
    typeof window !== 'undefined' ? readScale() : 1,
  )

  useEffect(() => {
    setScaleState(readScale())
  }, [])

  const setScale = useCallback((next: QuizScale) => {
    setScaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
  }, [])

  const zoomIn = useCallback(() => {
    setScaleState((prev) => {
      const i = QUIZ_SCALE_STEPS.indexOf(prev)
      const next = QUIZ_SCALE_STEPS[Math.min(QUIZ_SCALE_STEPS.length - 1, i + 1)]
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setScaleState((prev) => {
      const i = QUIZ_SCALE_STEPS.indexOf(prev)
      const next = QUIZ_SCALE_STEPS[Math.max(0, i - 1)]
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return { scale, setScale, zoomIn, zoomOut }
}

/** Tombol A− / A+ di header kuis. */
export function QuizTextScaleButtons({
  scale,
  onZoomIn,
  onZoomOut,
}: {
  scale: QuizScale
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const atMin = scale <= QUIZ_SCALE_STEPS[0]
  const atMax = scale >= QUIZ_SCALE_STEPS[QUIZ_SCALE_STEPS.length - 1]
  return (
    <div
      className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 overflow-hidden"
      role="group"
      aria-label="Ukuran tulisan"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={atMin}
        title="Perkecil tulisan"
        className="px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
      >
        A−
      </button>
      <span className="px-1.5 text-[10px] text-gray-400 tabular-nums border-x border-gray-200 min-w-[2.25rem] text-center">
        {Math.round(scale * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={atMax}
        title="Perbesar tulisan"
        className="px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
      >
        A+
      </button>
    </div>
  )
}
