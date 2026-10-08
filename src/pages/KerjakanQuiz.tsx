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

// FILE TOO LARGE FOR SINGLE MESSAGE - see patch below
export default function KerjakanQuiz() {
  return null
}
