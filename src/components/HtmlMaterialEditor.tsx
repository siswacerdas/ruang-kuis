import { useEffect, useState } from 'react'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import { saveLessonMaterial, type LessonMaterialStatus, type LessonPdf } from '../lib/lessonMaterials'
import LessonViewer from './LessonViewer'

type Props = {
  open: boolean
  onClose: () => void
  /** Prefill saat edit */
  initial?: LessonPdf | null
  defaultSubjectKey?: SubjectKey
  onSaved: () => void
}

export default function HtmlMaterialEditor({
  open,
  onClose,
  initial,
  defaultSubjectKey,
  onSaved,
}: Props) {
  const isEdit = !!initial?.id
  const [subjectKey, setSubjectKey] = useState<SubjectKey>(
    initial?.subjectKey || defaultSubjectKey || 'bahasa-indonesia'
  )
  const [title, setTitle] = useState(initial?.title || '')
  const [htmlContent, setHtmlContent] = useState(initial?.htmlContent || '')
  const [status, setStatus] = useState<LessonMaterialStatus>(
    initial?.status === 'draft' ? 'draft' : isEdit ? (initial?.status || 'published') : 'draft'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubjectKey(initial?.subjectKey || defaultSubjectKey || 'bahasa-indonesia')
    setTitle(initial?.title || '')
    setHtmlContent(initial?.htmlContent || '')
    setStatus(
      initial
        ? initial.status === 'draft'
          ? 'draft'
          : 'published'
        : 'draft'
    )
    setError('')
    setPreviewOpen(false)
  }, [open, initial, defaultSubjectKey])

  if (!open) return null

  const subject = getSubject(subjectKey)
  const canPreview = htmlContent.trim().length > 0
  const bytes = new Blob([htmlContent]).size

  const handleSave = async (nextStatus: LessonMaterialStatus) => {
    const t = title.trim()
    const html = htmlContent.trim()
    if (!t) {
      setError('Judul wajib diisi.')
      return
    }
    if (!html) {
      setError('Konten HTML wajib diisi.')
      return
    }
    if (bytes > 900_000) {
      setError(`Konten terlalu besar (~${Math.round(bytes / 1024)} KB). Maksimal ~900 KB.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveLessonMaterial({
        id: initial?.id,
        subjectKey,
        title: t,
        fileName: `${t}.materi.html`,
        sizeBytes: bytes,
        driveFileId: '',
        kind: 'html-lesson',
        htmlContent: html,
        generatedBy: initial?.generatedBy || 'manual-html',
        outline: initial?.outline,
        sectionsCount: initial?.sectionsCount,
        status: nextStatus,
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan. Pastikan login sebagai admin.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
        <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[94vh] flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isEdit ? 'Edit materi HTML' : 'Materi HTML'}
              </h2>
              <p className="text-xs text-gray-500">
                Tempel kode HTML → pratinjau → simpan sebagai draft atau publish
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2">
              Tutup
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Mata pelajaran</span>
                <select
                  value={subjectKey}
                  onChange={(e) => setSubjectKey(e.target.value as SubjectKey)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Judul materi</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Ekosistem dan Rantai Makanan"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-gray-600">Konten HTML</span>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {bytes > 0 ? `${(bytes / 1024).toFixed(1)} KB` : '0 KB'}
                </span>
              </div>
              <textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                rows={14}
                placeholder={`Contoh:\n<h1>Judul materi</h1>\n<p>Paragraf penjelasan...</p>\n<ul>\n  <li>Poin 1</li>\n  <li>Poin 2</li>\n</ul>`}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono text-[13px] leading-relaxed"
                spellCheck={false}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Gunakan tag HTML biasa (h1, h2, p, ul, img, …). Kelas khusus AI (rk-callout, rk-summary)
                juga didukung di pratinjau.
              </p>
            </label>

            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1.5">Status saat simpan</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['draft', 'Draft', 'Hanya admin yang melihat'],
                    ['published', 'Published', 'Siswa bisa membaca'],
                  ] as const
                ).map(([val, label, hint]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatus(val)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition ${
                      status === val
                        ? val === 'published'
                          ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium block ${
                        status === val
                          ? val === 'published'
                            ? 'text-emerald-900'
                            : 'text-amber-900'
                          : 'text-gray-700'
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-[11px] text-gray-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0 bg-slate-50/80">
            <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2">
              Batal
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              disabled={!canPreview}
              className="text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
            >
              Pratinjau
            </button>
            <button
              type="button"
              onClick={() => handleSave(status)}
              disabled={saving || !title.trim() || !htmlContent.trim()}
              className={`text-sm font-medium disabled:opacity-50 text-white px-4 py-2 rounded-xl ${
                status === 'published'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {saving
                ? 'Menyimpan…'
                : status === 'published'
                  ? 'Simpan & publish'
                  : isEdit
                    ? 'Simpan draft'
                    : 'Simpan sebagai draft'}
            </button>
          </div>
        </div>
      </div>

      {previewOpen && canPreview && (
        <LessonViewer
          title={title.trim() || 'Pratinjau'}
          subjectName={subject?.name || subjectKey}
          htmlContent={htmlContent}
          onClose={() => setPreviewOpen(false)}
          showExport
        />
      )}
    </>
  )
}
