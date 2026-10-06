import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isOpenAiConfigured } from '../lib/openaiQuestions'
import {
  estimateLessonPayloadBytes,
  generateLessonWithOpenAI,
  type GeneratedLesson,
  type LessonStyle,
} from '../lib/openaiLesson'
import { saveLessonMaterial } from '../lib/lessonMaterials'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import type { BookMaterial } from '../types/tp'
import LessonViewer from './LessonViewer'

type Props = {
  open: boolean
  onClose: () => void
  defaultSubjectKey?: SubjectKey
  onSaved: () => void
}

type SourceMode = 'manual' | 'book'

const STYLE_OPTIONS: { value: LessonStyle; label: string; hint: string }[] = [
  { value: 'penjelasan', label: 'Penjelasan', hint: 'Lengkap & runtut' },
  { value: 'ringkas', label: 'Ringkas', hint: 'Padat, fokus inti' },
  { value: 'latihan', label: 'Latihan', hint: 'Plus aktivitas mini' },
]

function bookToOutline(m: BookMaterial): string {
  const lines = [m.title]
  if (m.summary?.trim()) {
    const parts = m.summary
      .split(/[.;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8)
    parts.slice(0, 8).forEach((p) => lines.push(`- ${p}`))
  }
  if (m.suggestedTpCodes?.length) {
    lines.push(`- Kode TP: ${m.suggestedTpCodes.join(', ')}`)
  }
  return lines.join('\n')
}

export default function AiLessonGenerator({
  open,
  onClose,
  defaultSubjectKey,
  onSaved,
}: Props) {
  const [subjectKey, setSubjectKey] = useState<SubjectKey>(defaultSubjectKey || 'bahasa-indonesia')
  const [title, setTitle] = useState('')
  const [sourceMode, setSourceMode] = useState<SourceMode>('manual')
  const [outline, setOutline] = useState('')
  const [style, setStyle] = useState<LessonStyle>('penjelasan')
  const [generateImages, setGenerateImages] = useState(false)
  const [extra, setExtra] = useState('')
  const [books, setBooks] = useState<BookMaterial[]>([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lesson, setLesson] = useState<GeneratedLesson | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const configured = useMemo(() => isOpenAiConfigured(), [])
  const subject = getSubject(subjectKey)

  useEffect(() => {
    if (!open) return
    if (defaultSubjectKey) setSubjectKey(defaultSubjectKey)
    setLesson(null)
    setError('')
    setPreviewOpen(false)
  }, [open, defaultSubjectKey])

  useEffect(() => {
    if (!open || sourceMode !== 'book') return
    let cancelled = false
    ;(async () => {
      setBooksLoading(true)
      try {
        const snap = await getDocs(
          query(collection(db, 'bookMaterials'), where('subjectKey', '==', subjectKey))
        )
        if (cancelled) return
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookMaterial))
        list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'))
        setBooks(list)
        setSelectedBookId('')
      } catch {
        if (!cancelled) setBooks([])
      } finally {
        if (!cancelled) setBooksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, sourceMode, subjectKey])

  if (!open) return null

  const applyBook = (bookId: string) => {
    setSelectedBookId(bookId)
    const m = books.find((b) => b.id === bookId)
    if (!m) return
    setTitle(m.title)
    setOutline(bookToOutline(m))
  }

  const run = async () => {
    setError('')
    setLoading(true)
    setLesson(null)
    try {
      const { lesson: result, imageWarnings } = await generateLessonWithOpenAI({
        subjectName: subject?.name || subjectKey,
        subjectKey,
        title: title.trim(),
        outline,
        style,
        generateImages,
        extraContext: extra,
      })
      setLesson(result)
      setPreviewOpen(true)
      if (imageWarnings.length > 0) {
        setError(
          'Materi berhasil dibuat, tetapi sebagian gambar gagal:\n' +
            imageWarnings.slice(0, 4).join('\n') +
            (imageWarnings.length > 4 ? `\n… (+${imageWarnings.length - 4})` : '')
        )
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal generate materi')
    } finally {
      setLoading(false)
    }
  }

  const accept = async () => {
    if (!lesson) {
      setError('Belum ada materi untuk disimpan.')
      return
    }
    const bytes = estimateLessonPayloadBytes(lesson)
    if (bytes > 900_000) {
      setError(
        `Materi terlalu besar (~${Math.round(bytes / 1024)} KB). Matikan gambar atau kurangi detail, lalu generate ulang.`
      )
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveLessonMaterial({
        subjectKey,
        title: title.trim() || lesson.title,
        fileName: `${(title.trim() || lesson.title)}.materi.html`,
        sizeBytes: bytes,
        driveFileId: '',
        kind: 'html-lesson',
        htmlContent: lesson.htmlContent,
        outline: outline.trim(),
        generatedBy: 'openai-lesson',
        sectionsCount: lesson.sections.length,
        status: 'draft',
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
        <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">✨ Buat materi belajar AI</h2>
              <p className="text-xs text-gray-500">Materi mandiri lengkap (HTML) + unduh PDF · simpan sebagai draft</p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2">
              Tutup
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {!configured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">API key belum dikonfigurasi</p>
                <p className="text-xs mt-1">
                  Isi <code className="bg-amber-100 px-1 rounded">VITE_OPENAI_API_KEY</code> di{' '}
                  <code className="bg-amber-100 px-1 rounded">.env</code> lalu restart.
                </p>
              </div>
            )}

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

            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1.5">Sumber outline</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['manual', 'Ketik manual'],
                    ['book', 'Dari materi buku'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSourceMode(val)}
                    className={`text-sm px-3 py-2 rounded-xl border font-medium transition ${
                      sourceMode === val
                        ? 'border-violet-400 bg-violet-50 text-violet-900 ring-1 ring-violet-200'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sourceMode === 'book' && (
              <div>
                <span className="text-xs font-medium text-gray-600 block mb-1">Pilih materi buku</span>
                {booksLoading ? (
                  <p className="text-xs text-gray-500">Memuat materi buku…</p>
                ) : books.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    Belum ada materi buku untuk mapel ini. Impor di Tujuan Pembelajaran, atau ketik outline
                    manual.
                  </p>
                ) : (
                  <select
                    value={selectedBookId}
                    onChange={(e) => applyBook(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Pilih materi —</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Outline materi & sub-materi</span>
              <textarea
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                rows={7}
                placeholder={`Contoh:\nPengertian ekosistem\n- Makhluk hidup (biotik)\n- Benda tak hidup (abiotik)\nRantai makanan\n- Produsen, konsumen, dekomposer`}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono text-[13px] leading-relaxed"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Satu baris = materi. Awali sub-materi dengan "- ". Boleh diedit setelah pilih dari buku.
              </p>
            </label>

            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1.5">Gaya</span>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStyle(o.value)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${
                      style === o.value
                        ? 'bg-slate-800 border-slate-800 text-white'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                    title={o.hint}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600"
              />
              Generate ilustrasi untuk bagian penting (maks 4, memakai kuota image API)
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Catatan tambahan (opsional)</span>
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                rows={2}
                placeholder="Contoh: tekankan contoh di lingkungan sekolah"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </label>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={run}
              disabled={loading || !configured || !title.trim() || !outline.trim()}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
            >
              {loading
                ? generateImages
                  ? 'Menyusun materi + gambar…'
                  : 'Menyusun materi…'
                : 'Generate materi belajar'}
            </button>

            {lesson && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {lesson.sections.length} bagian · siap dibaca
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Pratinjau
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-gray-100 p-2">
                  {lesson.sections.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      <span className="text-gray-400 tabular-nums w-5 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{s.heading}</p>
                        <p className="text-gray-400">
                          {s.imageUrl ? '🖼 · ' : ''}
                          {s.callout ? 'callout · ' : ''}
                          bagian materi
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {lesson && (
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0 bg-slate-50/80">
              <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2">
                Batal
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700"
              >
                Pratinjau
              </button>
              <button
                type="button"
                onClick={accept}
                disabled={saving}
                className="text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl"
              >
                {saving ? 'Menyimpan…' : 'Simpan sebagai draft'}
              </button>
            </div>
          )}
        </div>
      </div>

      {previewOpen && lesson && (
        <LessonViewer
          title={title.trim() || lesson.title}
          subjectName={subject?.name || subjectKey}
          htmlContent={lesson.htmlContent}
          onClose={() => setPreviewOpen(false)}
          showExport
        />
      )}
    </>
  )
}
