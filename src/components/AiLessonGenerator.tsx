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

  // RESTORE STUB - full file in artifacts/RESTORE_AiLessonGenerator.tsx
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md">
        <p className="text-sm text-red-600">AiLessonGenerator perlu di-restore dari commit b49d6e0 atau artifacts/RESTORE_AiLessonGenerator.tsx</p>
        <button type="button" onClick={onClose} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Tutup</button>
      </div>
    </div>
  )
}
