import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import Layout from '../components/Layout'
import { db } from '../lib/firebase'
import { SUBJECTS, getSubject } from '../types/question'
import type { BookMaterial, LearningObjective, SubjectKey, TpSeedFile } from '../types/tp'

type Tab = 'tp' | 'materi'

const emptyTp = (): LearningObjective => ({
  code: '',
  subjectKey: 'bahasa-indonesia',
  element: '',
  order: 1,
  statement: '',
  weight: 1,
  active: true,
  className: '5A',
  phase: 'C',
})

function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'materi'
}

/** Ringkasan multi-baris — dipertahankan newline agar bisa dibaca sistem (outline untuk AI soal). */
function SummaryBlock({ text, className = '': { text?: string; className?: string }) {
  const t = (text || '').trim()
  if (!t) return <p className={`text-sm text-gray-400 ${className}`}>—</p>
  return (
    <pre
      className={`text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed m-0 ${className}`}
    >
      {t}
    </pre>
  )
}
