import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StudentNav from '../components/StudentNav'
import Layout from '../components/Layout'
import AiLessonGenerator from '../components/AiLessonGenerator'
import LessonViewer from '../components/LessonViewer'
import PresentationViewer from '../components/PresentationViewer'
import { SUBJECTS, getSubject, type SubjectKey } from '../types/question'
import HtmlMaterialEditor from '../components/HtmlMaterialEditor'
import {
  deleteLessonMaterial,
  fetchLessonMaterials,
  formatBytes,
  isHtmlLesson,
  isPresentation,
  isPublished,
  parseDriveFileId,
  pdfsForSubject,
  previewUrl,
  saveLessonMaterial,
  seedLessonMaterialsFromStatic,
  setLessonMaterialStatus,
  viewUrl,
  type LessonPdf,
} from '../lib/lessonMaterials'

const accent: Record<string, { bar: string; icon: string; badge: string }> = {
  rose: { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600', badge: 'text-rose-700 bg-rose-50' },
  red: { bar: 'bg-red-500', icon: 'bg-red-50 text-red-600', badge: 'text-red-700 bg-red-50' },
  emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600', badge: 'text-emerald-700 bg-emerald-50' },
  purple: { bar: 'bg-purple-500', icon: 'bg-purple-50 text-purple-600', badge: 'text-purple-700 bg-purple-50' },
  amber: { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600', badge: 'text-amber-800 bg-amber-50' },
  blue: { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600', badge: 'text-blue-700 bg-blue-50' },
  teal: { bar: 'bg-teal-500', icon: 'bg-teal-50 text-teal-600', badge: 'text-teal-700 bg-teal-50' },
  indigo: { bar: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600', badge: 'text-indigo-700 bg-indigo-50' },
}

type EditorState = {
  id?: string
  subjectKey: SubjectKey
  title: string
  fileName: string
  sizeBytes: string
  driveInput: string
}

function emptyEditor(subjectKey?: SubjectKey): EditorState {
  return {
    subjectKey: subjectKey || 'bahasa-indonesia',
    title: '',
    fileName: '',
    sizeBytes: '',
    driveInput: '',
  }
}

function PdfViewer({ pdf, onClose }: { pdf: LessonPdf; onClose: () => void }) {
  const subject = getSubject(pdf.subjectKey)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white w-full sm:max-w-5xl h-[95vh] sm:h-[90vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={pdf.title}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate tracking-tight">{pdf.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {[subject?.name, formatBytes(pdf.sizeBytes)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={viewUrl(pdf.driveFileId)}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Google Drive
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              Tutup
            </button>
          </div>
        </div>
        <iframe
          title={pdf.title}
          src={previewUrl(pdf.driveFileId)}
          className="flex-1 w-full bg-slate-50"
          allow="autoplay"
        />
      </div>
    </div>
  )
}

function MateriEditor({
  editor,
  setEditor,
  saving,
  error,
  onClose,
  onSave,
}: {
  editor: EditorState
  setEditor: (e: EditorState) => void
  saving: boolean
  error: string
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{editor.id ? 'Edit materi' : 'Tambah materi'}</h3>
          <p className="text-xs text-slate-500 mt-0.5">PDF tetap di Google Drive. Cukup tempel tautan atau file ID.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Mata pelajaran</span>
            <select
              value={editor.subjectKey}
              onChange={(e) => setEditor({ ...editor, subjectKey: e.target.value as SubjectKey })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              {SUBJECTS.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Judul materi</span>
            <input
              value={editor.title}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              placeholder="Contoh: Kata Sifat dan Kata Keterangan"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Tautan Google Drive atau File ID</span>
            <input
              value={editor.driveInput}
              onChange={(e) => setEditor({ ...editor, driveInput: e.target.value })}
              placeholder="https://drive.google.com/file/d/... atau ID mentah"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-[13px]"
            />
            {parseDriveFileId(editor.driveInput) && (
              <p className="text-[11px] text-emerald-600 mt-1">ID terdeteksi: {parseDriveFileId(editor.driveInput)}</p>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Nama file (opsional)</span>
              <input
                value={editor.fileName}
                onChange={(e) => setEditor({ ...editor, fileName: e.target.value })}
                placeholder="materi.pdf"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Ukuran byte (opsional)</span>
              <input
                type="number"
                min={0}
                value={editor.sizeBytes}
                onChange={(e) => setEditor({ ...editor, sizeBytes: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/80">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-white">
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
