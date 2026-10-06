/**
 * Ekspor presentasi AI ke PDF (client-side, jspdf).
 * Tidak mengubah file Drive yang sudah ada.
 */

import { jsPDF } from 'jspdf'
import type { PresentationSlide } from './openaiPresentation'

const PAGE_W = 297 // A4 landscape mm
const PAGE_H = 210
const MARGIN = 12

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

    doc.setFillColor(248, 250, 252)
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
    doc.rect(0, 0, PAGE_W, 5, 'F')

    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`${subjectName} · ${title}`, MARGIN, PAGE_H - 5)
    doc.text(`${i + 1} / ${slides.length}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' })

    let y = MARGIN + 6
    const textMaxW = contentW

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    const titleSize = s.layout === 'title' ? 22 : 16
    doc.setFontSize(titleSize)
    const titleLines = wrapText(doc, s.title, textMaxW, titleSize)
    for (const ln of titleLines.slice(0, 3)) {
      doc.text(ln, MARGIN, y)
      y += titleSize * 0.42 + 1.5
    }
    y += 3

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)

    if (s.body) {
      doc.setFontSize(11)
      const bodyLines = wrapText(doc, s.body, textMaxW, 11)
      for (const ln of bodyLines.slice(0, 6)) {
        if (y > PAGE_H - 30) break
        doc.text(ln, MARGIN, y)
        y += 5.5
      }
      y += 2
    }

    if (s.bullets?.length) {
      doc.setFontSize(10)
      for (const b of s.bullets.slice(0, 8)) {
        if (y > PAGE_H - 28) break
        const lines = wrapText(doc, `•  ${b}`, textMaxW, 10)
        for (const ln of lines.slice(0, 2)) {
          doc.text(ln, MARGIN, y)
          y += 5
        }
        y += 0.5
      }
      y += 2
    }

    if (s.cards?.length) {
      const n = Math.min(s.cards.length, 4)
      const gap = 3
      const cardW = (textMaxW - gap * (n - 1)) / n
      const cardColors: [number, number, number][] = [
        [236, 253, 245],
        [240, 249, 255],
        [255, 251, 235],
        [245, 243, 255],
      ]
      let maxCardH = 0
      const cardStartY = y
      for (let ci = 0; ci < n; ci++) {
        const c = s.cards[ci]
        const cx = MARGIN + ci * (cardW + gap)
        let cy = cardStartY + 4
        const lines: string[] = []
        lines.push(c.title)
        if (c.body) lines.push(...wrapText(doc, c.body, cardW - 6, 8).slice(0, 3))
        if (c.bullets) {
          for (const b of c.bullets.slice(0, 3)) {
            lines.push(...wrapText(doc, `• ${b}`, cardW - 6, 8).slice(0, 2))
          }
        }
        const cardH = Math.min(52, 8 + lines.length * 4.2)
        maxCardH = Math.max(maxCardH, cardH)
        drawRoundedRect(doc, cx, cardStartY, cardW, cardH, 2, cardColors[ci % cardColors.length])
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(15, 23, 42)
        doc.text(c.title.slice(0, 40), cx + 3, cy)
        cy += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(51, 65, 85)
        if (c.body) {
          for (const ln of wrapText(doc, c.body, cardW - 6, 8).slice(0, 3)) {
            doc.text(ln, cx + 3, cy)
            cy += 4
          }
        }
        if (c.bullets) {
          for (const b of c.bullets.slice(0, 3)) {
            for (const ln of wrapText(doc, `• ${b}`, cardW - 6, 8).slice(0, 1)) {
              doc.text(ln, cx + 3, cy)
              cy += 3.8
            }
          }
        }
      }
      y = cardStartY + maxCardH + 3
    }

    if (s.flow?.length) {
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      const flowText = s.flow.join('  →  ')
      for (const ln of wrapText(doc, flowText, textMaxW, 9).slice(0, 2)) {
        if (y > PAGE_H - 24) break
        doc.text(ln, MARGIN, y)
        y += 5
      }
      y += 2
    }

    if (s.examples?.length) {
      doc.setFontSize(9)
      doc.setTextColor(5, 150, 105)
      doc.setFont('helvetica', 'bold')
      doc.text('Contoh:', MARGIN, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(51, 65, 85)
      for (const ex of s.examples.slice(0, 6)) {
        if (y > PAGE_H - 22) break
        const lines = wrapText(doc, `✓  ${ex}`, textMaxW, 9)
        for (const ln of lines.slice(0, 1)) {
          doc.text(ln, MARGIN, y)
          y += 4.5
        }
      }
      y += 1
    }

    if (s.callout && y < PAGE_H - 22) {
      const callLines = wrapText(doc, s.callout, textMaxW - 6, 9)
      const boxH = Math.min(16, 6 + callLines.length * 4)
      drawRoundedRect(doc, MARGIN, y, textMaxW, boxH, 2, [238, 242, 255])
      doc.setFontSize(9)
      doc.setTextColor(67, 56, 202)
      let cy = y + 5
      for (const ln of callLines.slice(0, 2)) {
        doc.text(ln, MARGIN + 3, cy)
        cy += 4
      }
      y += boxH + 2
    }

    if (s.activity && y < PAGE_H - 20) {
      const actLines = wrapText(doc, `Aktivitas: ${s.activity}`, textMaxW - 6, 9)
      const boxH = Math.min(14, 6 + actLines.length * 4)
      drawRoundedRect(doc, MARGIN, y, textMaxW, boxH, 2, [255, 251, 235])
      doc.setFontSize(9)
      doc.setTextColor(180, 83, 9)
      let cy = y + 5
      for (const ln of actLines.slice(0, 2)) {
        doc.text(ln, MARGIN + 3, cy)
        cy += 4
      }
      y += boxH + 2
    }

    if (s.footer && y < PAGE_H - 14) {
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'italic')
      for (const ln of wrapText(doc, s.footer, textMaxW, 8).slice(0, 2)) {
        doc.text(ln, MARGIN, y)
        y += 4
      }
    }

    if (s.imageUrl) {
      const img = await loadImageAsData(s.imageUrl)
      if (img) {
        try {
          const imgW = 48
          const imgH = 48
          doc.addImage(img.data, img.format, PAGE_W - MARGIN - imgW, PAGE_H - 14 - imgH, imgW, imgH)
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
