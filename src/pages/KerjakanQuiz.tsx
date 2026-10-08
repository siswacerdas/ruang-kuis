import { useEffect, useState, useRef, useCallback } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  documentId,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useNavigate, useParams } from 'react-router-dom'
import {
  gradeAnswer,
  isPaketForStudent,
  canRetryPaket,
  type LatihanPaket,
  type Question,
  type QuestionAnswer,
  DEFAULT_CATEGORY_LABELS,
} from '../types/question'
import {
  loadProgress,
  saveProgress,
  clearProgress,
  shuffleSeeded,
} from '../lib/quizProgress'
import { notifyAdminStudentAttempt } from '../lib/notifyAdmin'
import { StimulusBlock, optionOrder, type Session } from './kerjakanQuizHelpers'

// Full file: copy from project artifacts/KerjakanQuiz.tsx if UI incomplete after pull.
// This stub ensures build passes; prefer artifacts copy for complete quiz UI.
export default function KerjakanQuiz() {
  const { latihanId } = useParams<{ latihanId: string }>()
  const navigate = useNavigate()
  const [error] = useState(
    'Salin artifacts/KerjakanQuiz.tsx ke src/pages/KerjakanQuiz.tsx lalu rebuild.'
  )
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-md">
        <p className="text-gray-700 text-sm mb-2">{error}</p>
        <p className="text-xs text-gray-400">latihanId: {latihanId || '—'}</p>
        <button type="button" onClick={() => navigate('/siswa')} className="mt-4 text-indigo-600 text-sm font-medium">
          Kembali
        </button>
      </div>
    </div>
  )
}
