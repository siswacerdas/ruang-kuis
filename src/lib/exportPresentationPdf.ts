/**
 * Ekspor presentasi AI ke PDF (client-side, jspdf).
 * Layout diselaraskan dengan PresentationViewer (padat, kartu, poin bernomor).
 */

import { jsPDF } from 'jspdf'
import type { PresentationSlide } from './openaiPresentation'

const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 14

function wrapText(doc: jsPDF, text: string, maxWidth: number, fontSize: number): string[] {
  doc.setFontSize(fontSize)
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (doc.getTextWidth(test) > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: [number, number, number]
) {
  doc.setFillColor(fill[0], fill[1], fill[2])
  doc.roundedRect(x, y, w, h, r, r, 'F')
}

async function loadImageAsData(url: string): Promise<{ data: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    if (url.startsWith('data:image/jpeg')) return { data: url, format: 'JPEG' }
    if (url.startsWith('data:image/png')) return { data: url, format: 'PNG' }
    if (url.startsWith('data:')) return { data: url, format: 'JPEG' }
    return null
  } catch {
    return null
  }
}

export async function exportPresentationToPdf(
  title: string,
  subjectName: string,
  slides: PresentationSlide[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const contentW = PAGE_W - MARGIN * 2

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage()
    const s = slides[i]

    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

    const accent: [number, number, number] =
      s.layout === 'title'
        ? [79, 70, 229]
        : s.layout === 'summary'
          ? [5, 150, 105]
          : s.layout === 'activity'
            ? [217, 119, 6]
            : s.layout === 'cards' || s.layout === 'compare'
              ? [13, 148, 136]
              : [99, 102, 241]
    doc.setFillColor(accent[0], accent[1], accent[2])
    doc.rect(0, 0, PAGE_W, 6, 'F')

    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.setFont('helvetica', 'normal')
    doc.text(`${subjectName} · ${title}`, MARGIN, PAGE_H - 6)
    doc.text(`${i + 1} / ${slides.length}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' })

    const bottomLimit = PAGE_H - 14

    // TITLE SLIDE: center content vertically
    if (s.layout === 'title') {
      let blockH = 0
      const titleSize = 26
      doc.setFontSize(titleSize)
      const titleLines = wrapText(doc, s.title, contentW * 0.85, titleSize)
      blockH += titleLines.length * (titleSize * 0.45) + 8
      if (s.body) {
        doc.setFontSize(13)
        blockH += wrapText(doc, s.body, contentW * 0.75, 13).length * 6 + 6
      }
      if (s.callout) {
        doc.setFontSize(11)
        blockH += wrapText(doc, s.callout, contentW * 0.7, 11).length * 5 + 10
      }
      if (s.imageUrl) blockH += 42

      let y = Math.max(MARGIN + 10, (PAGE_H - blockH) / 2)

      if (s.imageUrl) {
        const img = await loadImageAsData(s.imageUrl)
        if (img) {
          try {
            const imgW = 38
            const imgH = 38
            doc.addImage(img.data, img.format, (PAGE_W - imgW) / 2, y, imgW, imgH)
            y += imgH + 8
          } catch {
            // skip
          }
        }
      }

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(titleSize)
      for (const ln of titleLines.slice(0, 3)) {
        doc.text(ln, PAGE_W / 2, y, { align: 'center' })
        y += titleSize * 0.45 + 1
      }
      y += 6

      if (s.body) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(71, 85, 105)
        doc.setFontSize(13)
        for (const ln of wrapText(doc, s.body, contentW * 0.75, 13).slice(0, 4)) {
          doc.text(ln, PAGE_W / 2, y, { align: 'center' })
          y += 6
        }
        y += 5
      }

      if (s.callout) {
        doc.setFontSize(11)
        const callLines = wrapText(doc, s.callout, contentW * 0.65, 11)
        const boxW = contentW * 0.7
        const boxH = 6 + callLines.length * 5
        const bx = (PAGE_W - boxW) / 2
        drawRoundedRect(doc, bx, y, boxW, boxH, 3, [238, 242, 255])
        doc.setTextColor(67, 56, 202)
        let cy = y + 5.5
        for (const ln of callLines.slice(0, 3)) {
          doc.text(ln, PAGE_W / 2, cy, { align: 'center' })
          cy += 5
        }
      }
      continue
    }

    // CONTENT SLIDES
    let y = MARGIN + 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    const label =
      s.layout === 'summary'
        ? 'RINGKASAN'
        : s.layout === 'activity'
          ? 'AKTIVITAS'
          : s.layout === 'section'
            ? 'BAGIAN'
            : s.layout === 'quote'
              ? 'RENUNGAN'
              : s.layout === 'cards' || s.layout === 'compare'
                ? 'KONSEP'
                : s.layout === 'assessment'
                  ? 'ASESMEN'
                  : 'MATERI'
    doc.text(label, MARGIN, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(18)
    for (const ln of wrapText(doc, s.title, contentW, 18).slice(0, 2)) {
      doc.text(ln, MARGIN, y)
      y += 8
    }
    y += 3

    if (s.body) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.setFontSize(11)
      for (const ln of wrapText(doc, s.body, contentW, 11).slice(0, 4)) {
        if (y > bottomLimit - 40) break
        doc.text(ln, MARGIN, y)
        y += 5.5
      }
      y += 4
    }

    if (s.bullets?.length) {
      const n = Math.min(s.bullets.length, 8)
      const cols = n >= 4 ? 2 : 1
      const gap = 4
      const colW = cols === 2 ? (contentW - gap) / 2 : contentW
      const rowH = 14
      let bi = 0
      while (bi < n) {
        if (y > bottomLimit - 20) break
        for (let c = 0; c < cols && bi < n; c++, bi++) {
          const bx = MARGIN + c * (colW + gap)
          drawRoundedRect(doc, bx, y, colW, rowH, 2, [248, 250, 252])
          doc.setFillColor(accent[0], accent[1], accent[2])
          doc.circle(bx + 6, y + rowH / 2, 3.5, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(255, 255, 255)
          doc.text(String(bi + 1), bx + 6, y + rowH / 2 + 1.2, { align: 'center' })
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(30, 41, 59)
          const lines = wrapText(doc, s.bullets[bi], colW - 16, 9)
          doc.text(lines[0] || '', bx + 12, y + 6)
          if (lines[1]) doc.text(lines[1].slice(0, 50), bx + 12, y + 10.5)
        }
        y += rowH + 3
      }
      y += 2
    }

    if (s.cards?.length) {
      const n = Math.min(s.cards.length, 4)
      const gap = 4
      const cardW = (contentW - gap * (n - 1)) / n
      const cardColors: [number, number, number][] = [
        [236, 253, 245],
        [240, 249, 255],
        [255, 251, 235],
        [245, 243, 255],
      ]
      const cardStartY = y
      let maxCardH = 0

      for (let ci = 0; ci < n; ci++) {
        const c = s.cards[ci]
        const cx = MARGIN + ci * (cardW + gap)
        const textBits: string[] = []
        if (c.body) textBits.push(...wrapText(doc, c.body, cardW - 8, 8).slice(0, 3))
        if (c.bullets) {
          for (const b of c.bullets.slice(0, 3)) {
            textBits.push(...wrapText(doc, `· ${b}`, cardW - 8, 8).slice(0, 2))
          }
        }
        const cardH = Math.min(58, 12 + textBits.length * 4.5)
        maxCardH = Math.max(maxCardH, cardH)
        drawRoundedRect(doc, cx, cardStartY, cardW, cardH, 3, cardColors[ci % cardColors.length])

        doc.setFillColor(accent[0], accent[1], accent[2])
        doc.circle(cx + 5, cardStartY + 6, 3, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(255, 255, 255)
        doc.text(String(ci + 1), cx + 5, cardStartY + 7.2, { align: 'center' })

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(15, 23, 42)
        doc.text(c.title.slice(0, 32), cx + 10, cardStartY + 7)
        let cy = cardStartY + 13

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(51, 65, 85)
        for (const ln of textBits) {
          if (cy > cardStartY + cardH - 3) break
          doc.text(ln, cx + 4, cy)
          cy += 4.2
        }
      }
      y = cardStartY + maxCardH + 5
    }

    if (s.flow?.length && y < bottomLimit - 18) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(71, 85, 105)
      const flowText = s.flow.join('  →  ')
      for (const ln of wrapText(doc, flowText, contentW, 10).slice(0, 2)) {
        doc.text(ln, MARGIN, y)
        y += 5.5
      }
      y += 3
    }

    if (s.examples?.length && y < bottomLimit - 20) {
      drawRoundedRect(doc, MARGIN, y, contentW, 6 + Math.min(s.examples.length, 5) * 5, 3, [236, 253, 245])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(5, 150, 105)
      doc.text('CONTOH', MARGIN + 3, y + 4.5)
      let ey = y + 10
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      for (const ex of s.examples.slice(0, 5)) {
        if (ey > bottomLimit - 10) break
        const lines = wrapText(doc, `✓  ${ex}`, contentW - 8, 9)
        doc.text(lines[0] || '', MARGIN + 3, ey)
        ey += 5
      }
      y = ey + 3
    }

    if (s.callout && y < bottomLimit - 16) {
      const callLines = wrapText(doc, s.callout, contentW - 8, 10)
      const boxH = Math.min(18, 7 + callLines.length * 4.5)
      drawRoundedRect(doc, MARGIN, y, contentW, boxH, 3, [238, 242, 255])
      doc.setFontSize(10)
      doc.setTextColor(67, 56, 202)
      doc.setFont('helvetica', 'normal')
      let cy = y + 5.5
      for (const ln of callLines.slice(0, 3)) {
        doc.text(ln, MARGIN + 4, cy)
        cy += 4.5
      }
      y += boxH + 3
    }

    if (s.activity && y < bottomLimit - 14) {
      const actLines = wrapText(doc, `Aktivitas: ${s.activity}`, contentW - 8, 10)
      const boxH = Math.min(16, 7 + actLines.length * 4.5)
      drawRoundedRect(doc, MARGIN, y, contentW, boxH, 3, [255, 251, 235])
      doc.setFontSize(10)
      doc.setTextColor(180, 83, 9)
      let cy = y + 5.5
      for (const ln of actLines.slice(0, 2)) {
        doc.text(ln, MARGIN + 4, cy)
        cy += 4.5
      }
      y += boxH + 3
    }

    if (s.footer && y < bottomLimit - 6) {
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'italic')
      for (const ln of wrapText(doc, s.footer, contentW, 9).slice(0, 2)) {
        doc.text(ln, PAGE_W / 2, y, { align: 'center' })
        y += 4.5
      }
    }

    if (s.imageUrl && s.layout !== 'title') {
      const img = await loadImageAsData(s.imageUrl)
      if (img) {
        try {
          const imgW = 42
          const imgH = 42
          doc.addImage(img.data, img.format, PAGE_W - MARGIN - imgW, PAGE_H - 12 - imgH, imgW, imgH)
        } catch {
          // skip
        }
      }
    }
  }

  const safeName = title
    .replace(/[^\w\s\-à-üÀ-Ü]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40)
  doc.save(`${safeName || 'presentasi'}.pdf`)
}
