import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import { saveLessonMaterial, type LessonMaterialStatus, type LessonPdf } from '../lib/lessonMaterials'
import type { BookMaterial } from '../types/tp'
import LessonViewer from './LessonViewer'

type Props = {
  open: boolean
  onClose: () => void
  /** Prefill saat edit */
  initial?: LessonPdf | null
  defaultSubjectKey?: SubjectKey
  onSaved: () => void
}

/** manual = ketik judul sendiri; book = pilih dari database materi buku */
type TitleSource = 'manual' | 'book'

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
  const [titleSource, setTitleSource] = useState<TitleSource>('manual')
  const [htmlContent, setHtmlContent] = useState(initial?.htmlContent || '')
  const [status, setStatus] = useState<LessonMaterialStatus>(
    initial?.status === 'draft' ? 'draft' : isEdit ? (initial?.status || 'published') : 'draft'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const [books, setBooks] = useState<BookMaterial[]>([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState('')
  const [bookQuery, setBookQuery] = useState('')

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
    setTitleSource('manual')
    setSelectedBookId('')
    setBookQuery('')
    setError('')
    setPreviewOpen(false)
  }, [open, initial, defaultSubjectKey])

  // Muat materi buku per mapel (koleksi bookMaterials)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setBooksLoading(true)
      try {
        const snap = await getDocs(
          query(collection(db, 'bookMaterials'), where('subjectKey', '==', subjectKey))
        )
        if (cancelled) return
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookMaterial, 'id'>) }))
        list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'))
        setBooks(list)
        // Jangan reset pilihan saat edit judul manual
        setSelectedBookId((prev) => {
          if (prev && list.some((b) => b.id === prev)) return prev
          return ''
        })
      } catch {
        if (!cancelled) setBooks([])
      } finally {
        if (!cancelled) setBooksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, subjectKey])

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase()
    if (!q) return books
    return books.filter((b) => {
      const hay = [b.title, b.summary, ...(b.suggestedTpCodes || [])].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [books, bookQuery])

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) || null,
    [books, selectedBookId]
  )

  if (!open) return null

  const subject = getSubject(subjectKey)
  const canPreview = htmlContent.trim().length > 0
  const bytes = new Blob([htmlContent]).size

  const applyBook = (bookId: string) => {
    setSelectedBookId(bookId)
    if (!bookId) return
    const m = books.find((b) => b.id === bookId)
    if (!m) return
    setTitle(m.title)
    setTitleSource('book')
  }

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
      // Simpan ringkasan materi buku sebagai outline agar jejak sumber tetap ada
      const outlineFromBook =
        selectedBook?.summary?.trim() ||
        (titleSource === 'book' && selectedBook
          ? `Sumber materi buku: ${selectedBook.title}`
          : undefined)

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
        outline: outlineFromBook || initial?.outline,
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
                Judul bisa diketik sendiri atau dipilih dari materi buku · tempel HTML → pratinjau → simpan
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-2">
              Tutup
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Mata pelajaran</span>
              <select
                value={subjectKey}
                onChange={(e) => {
                  setSubjectKey(e.target.value as SubjectKey)
                  // Ganti mapel → reset pilihan buku (daftar berbeda)
                  setSelectedBookId('')
                  setBookQuery('')
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1.5">Sumber judul</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['manual', 'Ketik sendiri'],
                    ['book', 'Dari materi buku'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTitleSource(val)}
                    className={`text-sm px-3 py-2 rounded-xl border font-medium transition ${
                      titleSource === val
                        ? 'border-teal-400 bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {titleSource === 'book' && (
              <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                <span className="text-xs font-medium text-gray-700 block">Pilih materi buku</span>
                {booksLoading ? (
                  <p className="text-xs text-gray-500">Memuat materi buku…</p>
                ) : books.length === 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Belum ada materi buku untuk mapel ini. Impor di menu{' '}
                    <strong>Tujuan Pembelajaran → Materi buku</strong>, atau ketik judul sendiri.
                  </p>
                ) : (
                  <>
                    {books.length > 6 && (
                      <input
                        value={bookQuery}
                        onChange={(e) => setBookQuery(e.target.value)}
                        placeholder="Cari judul atau ringkasan…"
                        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white"
                      />
                    )}
                    <select
                      value={selectedBookId}
                      onChange={(e) => applyBook(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Pilih materi buku —</option>
                      {filteredBooks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                    {filteredBooks.length === 0 && bookQuery.trim() && (
                      <p className="text-[11px] text-gray-500">Tidak ada materi yang cocok dengan pencarian.</p>
                    )}
                    {selectedBook && (
                      <div className="rounded-lg border border-teal-100 bg-white px-3 py-2.5 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                          Ringkasan isi buku
                        </p>
                        {selectedBook.summary?.trim() ? (
                          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed m-0 max-h-36 overflow-y-auto">
                            {selectedBook.summary.trim()}
                          </pre>
                        ) : (
                          <p className="text-xs text-gray-400">Tidak ada ringkasan untuk materi ini.</p>
                        )}
                        {selectedBook.suggestedTpCodes && selectedBook.suggestedTpCodes.length > 0 && (
                          <p className="text-[11px] text-gray-500">
                            TP terkait:{' '}
                            <span className="font-medium text-gray-700">
                              {selectedBook.suggestedTpCodes.join(', ')}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Judul materi</span>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                }}
                placeholder={
                  titleSource === 'book'
                    ? 'Pilih materi buku di atas, atau sesuaikan judul di sini'
                    : 'Contoh: Ekosistem dan Rantai Makanan'
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              {titleSource === 'book' && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Judul terisi otomatis dari materi buku; Anda masih bisa mengubahnya sebelum menyimpan.
                </p>
              )}
            </label>

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
                {selectedBook?.summary?.trim()
                  ? ' Manfaatkan ringkasan materi buku di atas sebagai panduan isi HTML.'
                  : ''}
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
