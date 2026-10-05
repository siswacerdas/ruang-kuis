import type { SubjectKey } from '../types/question'

export interface LessonPdf {
  id: string
  subjectKey: SubjectKey
  title: string
  fileName: string
  sizeBytes: number
  driveFileId: string
}

/** Katalog presentasi dari folder Drive Pustaka Belajar (siapa pun yang punya tautan). */
export const PUSTAKA_FOLDER_ID = '15Gv1apEOBeyhbwFeVyjovr_Dm7mOPtvm'

export const LESSON_PDFS: LessonPdf[] = [
  {
    id: 'bin-kata-sifat',
    subjectKey: 'bahasa-indonesia',
    title: 'Kata Sifat dan Kata Keterangan',
    fileName: 'Bahasa_Indonesia_Kata_Sifat_dan_Kata_Keterangan.pdf',
    sizeBytes: 4870060,
    driveFileId: '1fHRDxuZQn67A0TjD8I8WuNmEyA43oUsG',
  },
  {
    id: 'bin-mendeskripsikan',
    subjectKey: 'bahasa-indonesia',
    title: 'Mendeskripsikan Informasi',
    fileName: 'Bahasa_Indonesia_Mendeskripsikan_Informasi.pdf',
    sizeBytes: 4202695,
    driveFileId: '1TONyTPbbrjSDQMVWuRVZe8CgMzeZatjK',
  },
  {
    id: 'bin-sebab-akibat',
    subjectKey: 'bahasa-indonesia',
    title: 'Sebab Akibat',
    fileName: 'Bahasa_Indonesia_Sebab_Akibat.pdf',
    sizeBytes: 5887134,
    driveFileId: '1ILKJ0-TzuSwkSJtOBQeOBTnxmjnzByPU',
  },
  {
    id: 'ipas-aliran-energi',
    subjectKey: 'ipas',
    title: 'Aliran Energi dan Simbiosis',
    fileName: 'IPAS_Aliran_Energi_dan_Simbiosis.pdf',
    sizeBytes: 2733225,
    driveFileId: '1pujAGE3sMa9Vi6D_sb8q5IGQyjrYADmU',
  },
  {
    id: 'ipas-ekosistem',
    subjectKey: 'ipas',
    title: 'Pengayaan Ekosistem dan Adaptasi',
    fileName: 'IPAS_Pengayaan_Ekosistem_dan_Adaptasi.pdf',
    sizeBytes: 6537031,
    driveFileId: '1VU33aMhOxGHdqReHtnFKLxX1DLCxXuLG',
  },
  {
    id: 'ipas-perubahan-alam',
    subjectKey: 'ipas',
    title: 'Perubahan Kondisi Alam',
    fileName: 'IPAS_Perubahan_Kondisi_Alam.pdf',
    sizeBytes: 5261555,
    driveFileId: '19hcOi6wibY5qXTwsoltC6j9GqCRoD8UP',
  },
  {
    id: 'pp-nilai-norma',
    subjectKey: 'pendidikan-pancasila',
    title: 'Nilai, Norma, dan Aturan',
    fileName: 'Pendidikan_Pancasila_Nilai_Norma_dan_Aturan.pdf',
    sizeBytes: 3497473,
    driveFileId: '1TDNlemN_nA9gTeMiQ3lYI5gnGCg9sUlv',
  },
  {
    id: 'rupa-garis-tekstur',
    subjectKey: 'seni-rupa',
    title: 'Unit 1 · Garis dan Tekstur',
    fileName: 'Seni_Budaya_Presentasi_Materi_Unit_1_Garis_dan_Tekstur.pdf',
    sizeBytes: 3170511,
    driveFileId: '1XgGkQEkhTxYCUEoxC8OECB3Ct1LZeuhZ',
  },
]

export function pdfsForSubject(key: string): LessonPdf[] {
  return LESSON_PDFS.filter((p) => p.subjectKey === key)
}

export function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export function viewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
