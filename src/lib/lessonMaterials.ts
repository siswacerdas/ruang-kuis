import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'
import type { SubjectKey } from '../types/question'
import { db } from './firebase'

export interface LessonPdf {
  id: string
  subjectKey: SubjectKey
  title: string
  fileName: string
  sizeBytes: number
  driveFileId: string
  /** true jika data masih dari seed statis (belum di Firestore) */
  isStatic?: boolean
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

/** Katalog presentasi dari folder Drive Pustaka Belajar (siapa pun yang punya tautan). */
export const PUSTAKA_FOLDER_ID = '15Gv1apEOBeyhbwFeVyjovr_Dm7mOPtvm'

/** Seed awal — dipakai fallback & tombol migrasi admin. */
export const LESSON_PDFS: LessonPdf[] = [
  {
    id: 'bin-kata-sifat',
    subjectKey: 'bahasa-indonesia',
    title: 'Kata Sifat dan Kata Keterangan',
    fileName: 'Bahasa_Indonesia_Kata_Sifat_dan_Kata_Keterangan.pdf',
    sizeBytes: 4870060,
    driveFileId: '1fHRDxuZQn67A0TjD8I8WuNmEyA43oUsG',
    isStatic: true,
  },
  {
    id: 'bin-mendeskripsikan',
    subjectKey: 'bahasa-indonesia',
    title: 'Mendeskripsikan Informasi',
    fileName: 'Bahasa_Indonesia_Mendeskripsikan_Informasi.pdf',
    sizeBytes: 4202695,
    driveFileId: '1TONyTPbbrjSDQMVWuRVZe8CgMzeZatjK',
    isStatic: true,
  },
  {
    id: 'bin-sebab-akibat',
    subjectKey: 'bahasa-indonesia',
    title: 'Sebab Akibat',
    fileName: 'Bahasa_Indonesia_Sebab_Akibat.pdf',
    sizeBytes: 5887134,
    driveFileId: '1ILKJ0-TzuSwkSJtOBQeOBTnxmjnzByPU',
    isStatic: true,
  },
  {
    id: 'ipas-aliran-energi',
    subjectKey: 'ipas',
    title: 'Aliran Energi dan Simbiosis',
    fileName: 'IPAS_Aliran_Energi_dan_Simbiosis.pdf',
    sizeBytes: 2733225,
    driveFileId: '1pujAGE3sMa9Vi6D_sb8q5IGQyjrYADmU',
    isStatic: true,
  },
  {
    id: 'ipas-ekosistem',
    subjectKey: 'ipas',
    title: 'Pengayaan Ekosistem dan Adaptasi',
    fileName: 'IPAS_Pengayaan_Ekosistem_dan_Adaptasi.pdf',
    sizeBytes: 6537031,
    driveFileId: '1VU33aMhOxGHdqReHtnFKLxX1DLCxXuLG',
    isStatic: true,
  },
  {
    id: 'ipas-perubahan-alam',
    subjectKey: 'ipas',
    title: 'Perubahan Kondisi Alam',
    fileName: 'IPAS_Perubahan_Kondisi_Alam.pdf',
    sizeBytes: 5261555,
    driveFileId: '19hcOi6wibY5qXTwsoltC6j9GqCRoD8UP',
    isStatic: true,
  },
  {
    id: 'pp-nilai-norma',
    subjectKey: 'pendidikan-pancasila',
    title: 'Nilai, Norma, dan Aturan',
    fileName: 'Pendidikan_Pancasila_Nilai_Norma_dan_Aturan.pdf',
    sizeBytes: 3497473,
    driveFileId: '1TDNlemN_nA9gTeMiQ3lYI5gnGCg9sUlv',
    isStatic: true,
  },
  {
    id: 'rupa-garis-tekstur',
    subjectKey: 'seni-rupa',
    title: 'Unit 1 · Garis dan Tekstur',
    fileName: 'Seni_Budaya_Presentasi_Materi_Unit_1_Garis_dan_Tekstur.pdf',
    sizeBytes: 3170511,
    driveFileId: '1XgGkQEkhTxYCUEoxC8OECB3Ct1LZeuhZ',
    isStatic: true,
  },
]

export function pdfsForSubject(list: LessonPdf[], key: string): LessonPdf[] {
  return list.filter((p) => p.subjectKey === key)
}

export function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export function viewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Ekstrak file ID dari tautan Drive atau ID mentah. */
export function parseDriveFileId(input: string): string {
  const raw = input.trim()
  if (!raw) return ''
  const m1 = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  const m3 = raw.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (m3) return m3[1]
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw
  return ''
}

export function slugId(title: string, subjectKey: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${subjectKey}__${base || 'materi'}-${Date.now().toString(36)}`
}

export async function fetchLessonMaterials(): Promise<LessonPdf[]> {
  const snap = await getDocs(collection(db, 'lessonMaterials'))
  if (snap.empty) {
    return LESSON_PDFS.map((p) => ({ ...p, isStatic: true }))
  }
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        subjectKey: data.subjectKey as SubjectKey,
        title: String(data.title || ''),
        fileName: String(data.fileName || ''),
        sizeBytes: Number(data.sizeBytes) || 0,
        driveFileId: String(data.driveFileId || ''),
        isStatic: false,
        createdAt: data.createdAt ?? null,
        updatedAt: data.updatedAt ?? null,
      } satisfies LessonPdf
    })
    .filter((p) => p.title && p.driveFileId)
    .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.title.localeCompare(b.title, 'id'))
}

export async function saveLessonMaterial(
  material: Omit<LessonPdf, 'isStatic' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const isNew = !material.id
  const id = material.id || slugId(material.title, material.subjectKey)
  const payload: Record<string, unknown> = {
    subjectKey: material.subjectKey,
    title: material.title.trim(),
    fileName: (material.fileName || '').trim(),
    sizeBytes: Number(material.sizeBytes) || 0,
    driveFileId: material.driveFileId.trim(),
    updatedAt: serverTimestamp(),
  }
  if (isNew) payload.createdAt = serverTimestamp()
  await setDoc(doc(db, 'lessonMaterials', id), payload, { merge: true })
  return id
}

export async function deleteLessonMaterial(id: string): Promise<void> {
  await deleteDoc(doc(db, 'lessonMaterials', id))
}

/** Salin seed LESSON_PDFS ke Firestore (sekali). */
export async function seedLessonMaterialsFromStatic(): Promise<number> {
  let count = 0
  for (const p of LESSON_PDFS) {
    await setDoc(
      doc(db, 'lessonMaterials', p.id),
      {
        subjectKey: p.subjectKey,
        title: p.title,
        fileName: p.fileName,
        sizeBytes: p.sizeBytes,
        driveFileId: p.driveFileId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
    count += 1
  }
  return count
}
