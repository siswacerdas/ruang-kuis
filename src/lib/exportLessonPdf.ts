/**
 * Ekspor materi belajar mandiri (HTML) ke PDF via jendela cetak browser.
 * CSS print memastikan gambar & kotak penting tidak terpotong di tengah halaman.
 */

const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #0f172a;
    margin: 0;
    padding: 0;
  }
  .rk-meta {
    font-size: 9pt;
    color: #64748b;
    margin-bottom: 12pt;
    padding-bottom: 8pt;
    border-bottom: 1px solid #e2e8f0;
  }
  h1 {
    font-size: 20pt;
    line-height: 1.25;
    margin: 0 0 10pt;
    color: #0f172a;
    page-break-after: avoid;
  }
  h2 {
    font-size: 14pt;
    margin: 18pt 0 8pt;
    color: #1e293b;
    page-break-after: avoid;
  }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 10pt; padding-left: 1.25em; }
  li { margin-bottom: 4pt; }
  .rk-intro { margin-bottom: 12pt; }
  .rk-objectives {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 8pt;
    padding: 10pt 12pt;
    margin: 10pt 0 14pt;
    page-break-inside: avoid;
  }
  .rk-section {
    page-break-inside: auto;
    margin-bottom: 14pt;
  }
  .rk-figure {
    margin: 10pt 0;
    text-align: center;
    page-break-inside: avoid;
  }
  .rk-figure img {
    max-width: 100%;
    max-height: 90mm;
    height: auto;
    object-fit: contain;
    border-radius: 6pt;
    border: 1px solid #e2e8f0;
  }
  .rk-figure figcaption {
    font-size: 9pt;
    color: #64748b;
    margin-top: 4pt;
  }
  .rk-callout {
    background: #eef2ff;
    border-left: 4px solid #6366f1;
    padding: 8pt 12pt;
    margin: 10pt 0;
    border-radius: 0 6pt 6pt 0;
    page-break-inside: avoid;
  }
  .rk-summary {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 8pt;
    padding: 10pt 12pt;
    margin-top: 16pt;
    page-break-inside: avoid;
  }
  .rk-check {
    margin-top: 16pt;
    page-break-inside: avoid;
  }
  .rk-check li { margin-bottom: 10pt; }
  .rk-q { font-weight: 600; margin-bottom: 2pt; }
  .rk-a { color: #334155; margin: 0; }
  .rk-footer {
    margin-top: 20pt;
    padding-top: 8pt;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt;
    color: #94a3b8;
  }
`

/**
 * Buka jendela cetak berisi materi HTML + CSS print.
 * Pengguna bisa "Simpan sebagai PDF" dari dialog cetak browser.
 * Gambar memakai page-break-inside: avoid agar tidak terpotong.
 */
export function exportLessonToPdf(
  title: string,
  subjectName: string,
  htmlContent: string
): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!w) {
    throw new Error('Popup diblokir. Izinkan jendela popup untuk mengunduh PDF.')
  }

  const safeTitle = title.replace(/</g, '<').replace(/>/g, '>')
  const safeSubject = subjectName.replace(/</g, '<').replace(/>/g, '>')

  w.document.open()
  w.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="rk-meta">${safeSubject} · Materi belajar mandiri · Ruang Kuis</div>
  ${htmlContent}
  <div class="rk-footer">Diekspor dari Ruang Kuis · ${safeTitle}</div>
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`)
  w.document.close()
}
