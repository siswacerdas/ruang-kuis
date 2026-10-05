/**
 * Pembersih HTML untuk stimulus hasil AI.
 *
 * Hanya tag yang tampil benar di editor guru DAN di halaman siswa (KerjakanQuiz.tsx):
 *   p, br, b/strong, i/em, u, sub, sup, dan span.math-tex (persamaan).
 * Daftar (ul/ol/li) tidak dipakai karena tidak diizinkan di tampilan siswa;
 * bila muncul, diubah menjadi paragraf bernomor/berbutir.
 */

const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'SUB', 'SUP'])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE'])

const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function sanitizeAiStimulusHtml(raw: string): string {
  const src = (raw || '').trim()
  if (!src) return ''

  // Teks polos → paragraf (baris kosong = paragraf baru, baris biasa = <br>)
  if (!/<[a-z][\s\S]*>/i.test(src)) {
    return src
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  const doc = new DOMParser().parseFromString(src, 'text/html')

  // Daftar → paragraf
  doc.body.querySelectorAll('ul,ol').forEach((list) => {
    const ordered = list.tagName === 'OL'
    let n = 0
    const frag = doc.createDocumentFragment()
    Array.from(list.children).forEach((li) => {
      if (li.tagName !== 'LI') return
      n++
      const p = doc.createElement('p')
      p.innerHTML = (ordered ? `${n}. ` : '• ') + li.innerHTML
      frag.appendChild(p)
    })
    list.replaceWith(frag)
  })

  // Judul → paragraf tebal
  doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const p = doc.createElement('p')
    p.innerHTML = `<b>${h.innerHTML}</b>`
    h.replaceWith(p)
  })

  const walk = (node: Node) => {
    let child: Node | null = node.firstChild
    while (child) {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child = child.nextSibling
        continue
      }
      const el = child as HTMLElement

      // Tag berbahaya: buang beserta isinya
      if (DROP.has(el.tagName)) {
        const next: Node | null = el.nextSibling
        el.remove()
        child = next
        continue
      }

      // Persamaan: pertahankan class + data-latex saja
      if (el.tagName === 'SPAN' && el.classList.contains('math-tex')) {
        const latex = el.getAttribute('data-latex')
        Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name))
        el.setAttribute('class', 'math-tex')
        if (latex != null) el.setAttribute('data-latex', latex)
        child = el.nextSibling
        continue
      }

      // Tag tidak dikenal: buka bungkusnya, lalu PERIKSA anak-anaknya juga
      if (!KEEP.has(el.tagName)) {
        const resume: Node | null = el.firstChild ?? el.nextSibling
        while (el.firstChild) node.insertBefore(el.firstChild, el)
        el.remove()
        child = resume
        continue
      }

      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name))
      walk(el)
      child = el.nextSibling
    }
  }
  walk(doc.body)

  // Buang paragraf kosong
  doc.body.querySelectorAll('p').forEach((p) => {
    if (!(p.textContent || '').trim() && !p.querySelector('.math-tex')) p.remove()
  })

  let out = doc.body.innerHTML.trim()
  // Tanpa paragraf sama sekali → bungkus agar tampil rapi
  if (out && !/<p[\s>]/i.test(out)) out = `<p>${out}</p>`
  return out
}
