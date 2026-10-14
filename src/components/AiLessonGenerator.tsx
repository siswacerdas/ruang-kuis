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
import { getSubject, type SubjectKey } from '../types/question'
import { getCachedSubjects } from '../lib/subjects'
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
        title: lesson.title || title.trim() || 'Materi AI',
        kind: 'html-lesson',
        htmlLesson: lesson,
        status: 'draft',
        generatedBy: 'openai-lesson',
      } as any)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan materi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[95vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Buat materi belajar AI</h3>
            <p className="text-xs text-slate-500 mt-0.5">Outline → materi HTML interaktif. Bisa disimpan sebagai draft.</p>
          </div>
          <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
            {!configured && (
              <div className="rounded-xl bg-amber-50 text-amber-800 text-sm px-3 py-2">
                OpenAI belum dikonfigurasi (VITE_OPENAI_API_KEY).
              </div>
            )}
            {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2 whitespace-pre-wrap">{error}</div>}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Mata pelajaran</span>
              <select
                value={subjectKey}
                onChange={(e) => setSubjectKey(e.target.value as SubjectKey)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                {getCachedSubjects(true).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Judul</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Judul materi"
              />
            </label>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSourceMode('manual')}
                className={`px-3 py-1.5 rounded-lg border ${sourceMode === 'manual' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}
              >
                Outline manual
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('book')}
                className={`px-3 py-1.5 rounded-lg border ${sourceMode === 'book' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}
              >
                Dari materi buku
              </button>
            </div>
            {sourceMode === 'book' && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Materi buku</span>
                <select
                  value={selectedBookId}
                  onChange={(e) => applyBook(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                  disabled={booksLoading}
                >
                  <option value="">{booksLoading ? 'Memuat…' : 'Pilih materi buku'}</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Outline / poin materi</span>
              <textarea
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                placeholder="- Poin 1\n- Poin 2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStyle(o.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs ${style === o.value ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={generateImages} onChange={(e) => setGenerateImages(e.target.checked)} className="accent-indigo-600" />
              Sertakan gambar (lebih lambat)
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Instruksi tambahan (opsional)</span>
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/80">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-white">
              Batal
            </button>
            <button
              type="button"
              onClick={run}
              disabled={loading || !configured || !title.trim() || !outline.trim()}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
            >
              {loading ? 'Membuat…' : 'Generate'}
            </button>
            {lesson && (
              <button
                type="button"
                onClick={accept}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Menyimpan…' : 'Simpan draft'}
              </button>
            )}
          </div>
        </div>
      </div>
      {previewOpen && lesson && (
        <LessonViewer
          lesson={lesson}
          subjectName={subject?.name}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  )
}
