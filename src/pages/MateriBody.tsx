import { useEffect, useMemo, useState } from 'react'
import AiLessonGenerator from '../components/AiLessonGenerator'
import HtmlMaterialEditor from '../components/HtmlMaterialEditor'
import LessonViewer from '../components/LessonViewer'
import PresentationViewer from '../components/PresentationViewer'
import { getSubject, type SubjectKey } from '../types/question'
import { loadSubjects, getCachedSubjects, type SubjectDoc } from '../lib/subjects'
import {
  deleteLessonMaterial,
  formatBytes,
  isHtmlLesson,
  isPresentation,
  isPublished,
  parseDriveFileId,
  pdfsForSubject,
  previewUrl,
  reorderLessonMaterials,
  saveLessonMaterial,
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
