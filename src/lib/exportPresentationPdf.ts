/**
 * Ekspor presentasi AI ke PDF (client-side, jspdf).
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

    doc.setFillColor(248, 250, 252)
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

    const accent: [number, number, number] =
      s.layout === 'title'
        ? [79, 70, 229]
        : s.layout === 'summary'
          ? [5, 150, 105]
          : s.layout === 'activity'
            ? [217, 119, 6]
            : [99, 102, 241]
    doc.setFillColor(accent[0], accent[1], accent[2])
    doc.rect(0, 0, PAGE_W, 6, 'F')

    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`${subjectName} · ${title}`, MARGIN, PAGE_H - 6)
    doc.text(`${i + 1} / ${slides.length}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' })

    let y = MARGIN + 8

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    const titleSize = s.layout === 'title' ? 26 : 18
    doc.setFontSize(titleSize)
    const titleLines = wrapText(doc, s.title, contentW, titleSize)
    for (const ln of titleLines.slice(0, 3)) {
      doc.text(ln, MARGIN, y)
      y += titleSize * 0.45 + 2
    }
    y += 4

    let textMaxW = contentW
    if (s.imageUrl && (s.layout === 'image-focus' || s.layout === 'title' || s.needsImage)) {
      const img = await loadImageAsData(s.imageUrl)
      if (img) {
        const imgW = s.layout === 'image-focus' ? 90 : 70
        const imgH = s.layout === 'image-focus' ? 90 : 55
        const imgX = PAGE_W - MARGIN - imgW
        const imgY = s.layout === 'title' ? 50 : MARGIN + 20
        try {
          doc.addImage(img.data, img.format, imgX, imgY, imgW, imgH)
          if (s.layout !== 'title') textMaxW = contentW - imgW - 10
        } catch {
          /* skip */
        }
      }
    }

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)

    if (s.body) {
      doc.setFontSize(12)
      const bodyLines = wrapText(doc, s.body, textMaxW, 12)
      for (const ln of bodyLines.slice(0, 8)) {
        doc.text(ln, MARGIN, y)
        y += 7
      }
      y += 3
    }

    if (s.bullets?.length) {
      doc.setFontSize(12)
      for (const b of s.bullets.slice(0, 6)) {
        const lines = wrapText(doc, `•  ${b}`, textMaxW, 12)
        for (const ln of lines) {
          if (y > PAGE_H - 28) break
          doc.text(ln, MARGIN, y)
          y += 7
        }
        y += 1
      }
      y += 2
    }

    if (s.callout) {
      const boxH = 18
      drawRoundedRect(doc, MARGIN, y, Math.min(textMaxW, contentW), boxH, 3, [238, 242, 255])
      doc.setFontSize(10)
      doc.setTextColor(67, 56, 202)
      const callLines = wrapText(doc, s.callout, Math.min(textMaxW, contentW) - 8, 10)
      let cy = y + 6
      for (const ln of callLines.slice(0, 2)) {
        doc.text(ln, MARGIN + 4, cy)
        cy += 5
      }
      y += boxH + 4
      doc.setTextColor(51, 65, 85)
    }

    if (s.activity) {
      const boxH = 16
      drawRoundedRect(doc, MARGIN, y, Math.min(textMaxW, contentW), boxH, 3, [255, 251, 235])
      doc.setFontSize(10)
      doc.setTextColor(180, 83, 9)
      const actLines = wrapText(doc, `Aktivitas: ${s.activity}`, Math.min(textMaxW, contentW) - 8, 10)
      let cy = y + 6
      for (const ln of actLines.slice(0, 2)) {
        doc.text(ln, MARGIN + 4, cy)
        cy += 5
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
