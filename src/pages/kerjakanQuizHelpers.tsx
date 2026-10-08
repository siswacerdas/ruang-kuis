import { useEffect, useRef } from 'react'

export function sanitizeStimulusHtml(html: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'SPAN', 'DIV', 'SUB', 'SUP'])
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement
          if (!allowed.has(el.tagName)) {
            while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
            el.remove()
            continue
          }
          const lh = el.style.lineHeight
          el.removeAttribute('style')
          if (lh) el.style.lineHeight = lh
          if (el.classList.contains('math-tex')) el.setAttribute('class', 'math-tex')
          else el.removeAttribute('class')
          walk(el)
        }
      }
    }
    walk(doc.body)
    return doc.body.innerHTML
  } catch {
    return html.replace(/</g, '<')
  }
}

export function StimulusBlock({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('.math-tex').forEach((el) => {
      const latex = (el.getAttribute('data-latex') || el.textContent || '')
        .replace(/^\\\(|\\\)$/g, '')
        .replace(/^\$+|\$+$/g, '')
      try {
        // @ts-expect-error optional
        if (window.katex) {
          // @ts-expect-error optional
          window.katex.render(latex, el as HTMLElement, { throwOnError: false })
        }
      } catch {
        /* keep */
      }
    })
  }, [html])
  if (!html) return null
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return (
      <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
        {html}
      </div>
    )
  }
  return (
    <div
      ref={ref}
      className="px-4 py-3 text-sm text-gray-700 leading-relaxed break-words"
      dangerouslySetInnerHTML={{ __html: sanitizeStimulusHtml(html) }}
    />
  )
}

export interface Session {
  latihanId: string
  studentName: string
  studentId?: string
  studentClass?: string
  token: string
}

export function optionOrder(seed: string, count: number) {
  const order = Array.from({ length: count }, (_, i) => i)
  let hash = 2166136261
  for (const ch of seed) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
  for (let i = order.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
    const j = (hash >>> 0) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
