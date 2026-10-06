import { useEffect } from 'react'
import { exportLessonToPdf } from '../lib/exportLessonPdf'

type Props = {
  title: string
  subjectName: string
  htmlContent: string
  onClose: () => void
  showExport?: boolean
}

/**
 * Materi interaktif = dokumen HTML lengkap (punya <html>/<script>), misalnya materi
 * berhalaman dengan tombol navigasi. Harus dirender di <iframe> agar script berjalan
 * dan CSS-nya tidak bocor ke aplikasi. Potongan HTML biasa tetap lewat jalur lama.
 */
export function isInteractiveHtml(html: string): boolean {
  return /<!doctype html|<html[\s>]|<script[\s>]/i.test(html)
}

export default function LessonViewer({
  title,
  subjectName,
  htmlContent,
  onClose,
  showExport = true,
}: Props) {
  const interactive = isInteractiveHtml(htmlContent)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleExport = () => {
    try {
      exportLessonToPdf(title, subjectName, htmlContent)
    } catch (e: any) {
      alert(e?.message || 'Gagal membuka dialog cetak PDF.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-white">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
          <p className="text-[11px] text-slate-400 truncate">{subjectName} · Materi belajar mandiri</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showExport && !interactive && (
            <button
              type="button"
              onClick={handleExport}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Unduh PDF
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            Tutup
          </button>
        </div>
      </div>

      {interactive ? (
        <div className="flex-1 min-h-0 px-2 sm:px-4 pb-2 sm:pb-4 flex">
          <iframe
            title={title}
            srcDoc={htmlContent}
            sandbox="allow-scripts"
            className="flex-1 min-h-0 w-full mx-auto max-w-3xl bg-white rounded-xl sm:rounded-2xl shadow-2xl border-0"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 pb-6">
          <div className="mx-auto max-w-3xl bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <article
              className="px-5 sm:px-10 py-6 sm:py-8 prose-lesson"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        </div>
      )}

      <style>{`
        .prose-lesson h1 {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0f172a;
          margin: 0 0 0.75rem;
          line-height: 1.2;
        }
        .prose-lesson h2 {
          font-size: 1.2rem;
          font-weight: 700;
          color: #1e293b;
          margin: 1.75rem 0 0.65rem;
          line-height: 1.3;
        }
        .prose-lesson p {
          margin: 0 0 0.75rem;
          color: #334155;
          line-height: 1.65;
          font-size: 0.95rem;
        }
        .prose-lesson ul, .prose-lesson ol {
          margin: 0 0 0.9rem;
          padding-left: 1.25rem;
          color: #334155;
          font-size: 0.95rem;
          line-height: 1.55;
        }
        .prose-lesson li { margin-bottom: 0.35rem; }
        .prose-lesson strong, .prose-lesson b { color: #0f172a; font-weight: 700; }
        .prose-lesson .rk-objectives {
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 0.75rem;
          padding: 0.85rem 1rem;
          margin: 0.75rem 0 1.25rem;
        }
        .prose-lesson .rk-objectives p { margin-bottom: 0.4rem; }
        .prose-lesson .rk-figure {
          margin: 1rem 0;
          text-align: center;
        }
        .prose-lesson .rk-figure img {
          max-width: 100%;
          max-height: 280px;
          object-fit: contain;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .prose-lesson .rk-figure figcaption {
          font-size: 0.75rem;
          color: #94a3b8;
          margin-top: 0.35rem;
        }
        .prose-lesson .rk-callout {
          background: #eef2ff;
          border-left: 4px solid #6366f1;
          padding: 0.75rem 1rem;
          margin: 0.85rem 0;
          border-radius: 0 0.5rem 0.5rem 0;
          color: #312e81;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .prose-lesson .rk-summary {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 0.75rem;
          padding: 0.9rem 1rem;
          margin-top: 1.5rem;
        }
        .prose-lesson .rk-check {
          margin-top: 1.5rem;
          padding-top: 0.5rem;
        }
        .prose-lesson .rk-check ol { padding-left: 1.35rem; }
        .prose-lesson .rk-q { font-weight: 600; color: #0f172a; margin-bottom: 0.2rem; }
        .prose-lesson .rk-a { color: #475569; font-size: 0.9rem; }
        .prose-lesson .rk-section { margin-bottom: 0.5rem; }
      `}</style>
    </div>
  )
}
