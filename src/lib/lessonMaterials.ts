import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import type { SubjectKey } from '../types/question'
import type { PresentationSlide } from './openaiPresentation'
import { db } from './firebase'

/** drive = PDF Google Drive; presentation = slide AI lama; html-lesson = materi belajar mandiri HTML */
export type LessonMaterialKind = 'drive' | 'presentation' | 'html-lesson'

/** draft = hanya admin; published = tampil ke siswa. Data lama tanpa field = published. */
export type LessonMaterialStatus = 'draft' | 'published'

export interface LessonPdf {
  id: string
  subjectKey: SubjectKey
  title: string
  fileName: string
  sizeBytes: number
  /** Kosong untuk materi AI (presentasi / html-lesson) */
  driveFileId: string
  /** true jika data masih dari seed statis (belum di Firestore) */
  isStatic?: boolean
  /** Default 'drive' bila tidak ada (kompatibel data lama) */
  kind?: LessonMaterialKind
  /** Isi slide (hanya kind === 'presentation') */
  slides?: PresentationSlide[]
  /** HTML materi belajar mandiri (kind === 'html-lesson') */
  htmlContent?: string
  /** Jumlah bagian (html-lesson), opsional */
  sectionsCount?: number
  /** Outline sumber generate AI */
  outline?: string
  generatedBy?: string
  /** draft | published. Undefined / data lama = published */
  status?: LessonMaterialStatus
  /**
   * Urutan tampil dalam satu mata pelajaran (lebih kecil = lebih dulu).
   * Undefined / data lama = diurutkan di belakang (setelah yang punya angka).
   */
  sortOrder?: number
  publishedAt?: Timestamp | null
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

export function isPresentation(m: Pick<LessonPdf, 'kind' | 'slides'>): boolean {
  return m.kind === 'presentation' || (Array.isArray(m.slides) && m.slides.length > 0)
}

export function isHtmlLesson(m: Pick<LessonPdf, 'kind' | 'htmlContent'>): boolean {
  return m.kind === 'html-lesson' || (typeof m.htmlContent === 'string' && m.htmlContent.length > 0)
}

export function isAiMaterial(m: Pick<LessonPdf, 'kind' | 'slides' | 'htmlContent'>): boolean {
  return isPresentation(m) || isHtmlLesson(m)
}

/** Materi terlihat siswa: status published, atau field status belum ada (data lama). */
export function isPublished(m: Pick<LessonPdf, 'status' | 'isStatic'>): boolean {
  if (m.isStatic) return true
  return m.status !== 'draft'
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
    status: 'published',
  },
  {
    id: 'bin-mendeskripsikan',
    subjectKey: 'bahasa-indonesia',
    title: 'Mendeskripsikan Informasi',
    fileName: 'Bahasa_Indonesia_Mendeskripsikan_Informasi.pdf',
    sizeBytes: 4202695,
    driveFileId: '1TONyTPbbrjSDQMVWuRVZe8CgMzeZatjK',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'bin-sebab-akibat',
    subjectKey: 'bahasa-indonesia',
    title: 'Sebab Akibat',
    fileName: 'Bahasa_Indonesia_Sebab_Akibat.pdf',
    sizeBytes: 5887134,
    driveFileId: '1ILKJ0-TzuSwkSJtOBQeOBTnxmjnzByPU',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'ipas-aliran-energi',
    subjectKey: 'ipas',
    title: 'Aliran Energi dan Simbiosis',
    fileName: 'IPAS_Aliran_Energi_dan_Simbiosis.pdf',
    sizeBytes: 2733225,
    driveFileId: '1pujAGE3sMa9Vi6D_sb8q5IGQyjrYADmU',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'ipas-ekosistem',
    subjectKey: 'ipas',
    title: 'Pengayaan Ekosistem dan Adaptasi',
    fileName: 'IPAS_Pengayaan_Ekosistem_dan_Adaptasi.pdf',
    sizeBytes: 6537031,
    driveFileId: '1VU33aMhOxGHdqReHtnFKLxX1DLCxXuLG',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'ipas-perubahan-alam',
    subjectKey: 'ipas',
    title: 'Perubahan Kondisi Alam',
    fileName: 'IPAS_Perubahan_Kondisi_Alam.pdf',
    sizeBytes: 5261555,
    driveFileId: '19hcOi6wibY5qXTwsoltC6j9GqCRoD8UP',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'pp-nilai-norma',
    subjectKey: 'pendidikan-pancasila',
    title: 'Nilai, Norma, dan Aturan',
    fileName: 'Pendidikan_Pancasila_Nilai_Norma_dan_Aturan.pdf',
    sizeBytes: 3497473,
    driveFileId: '1TDNlemN_nA9gTeMiQ3lYI5gnGCg9sUlv',
    isStatic: true,
    status: 'published',
  },
  {
    id: 'rupa-garis-tekstur',
    subjectKey: 'seni-rupa',
    title: 'Unit 1 · Garis dan Tekstur',
    fileName: 'Seni_Budaya_Presentasi_Materi_Unit_1_Garis_dan_Tekstur.pdf',
    sizeBytes: 3170511,
    driveFileId: '1XgGkQEkhTxYCUEoxC8OECB3Ct1LZeuhZ',
    isStatic: true,
    status: 'published',
  },
]

/** Bandingkan urutan materi: sortOrder naik dulu, lalu judul (kompatibel data lama tanpa sortOrder). */
export function compareLessonOrder(a: LessonPdf, b: LessonPdf): number {
  const ao = a.sortOrder
  const bo = b.sortOrder
  const aHas = typeof ao === 'number' && Number.isFinite(ao)
  const bHas = typeof bo === 'number' && Number.isFinite(bo)
  if (aHas && bHas && ao !== bo) return ao - bo
  if (aHas && !bHas) return -1
  if (!aHas && bHas) return 1
  return a.title.localeCompare(b.title, 'id')
}

export function pdfsForSubject(list: LessonPdf[], key: string): LessonPdf[] {
  return list.filter((p) => p.subjectKey === key).sort(compareLessonOrder)
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

function staticSeed(): LessonPdf[] {
  const orderBySubject: Record<string, number> = {}
  return LESSON_PDFS.map((p) => {
    const next = orderBySubject[p.subjectKey] ?? 0
    orderBySubject[p.subjectKey] = next + 10
    return { ...p, isStatic: true, status: 'published' as const, sortOrder: next }
  })
}

/**
 * Hapus undefined secara rekursif — Firestore menolak field undefined.
 */
export function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

function parseStatus(raw: unknown): LessonMaterialStatus {
  return raw === 'draft' ? 'draft' : 'published'
}

/**
 * Ambil katalog dari Firestore.
 * Jika koleksi kosong / rules belum di-deploy (permission-denied),
 * jatuh ke seed statis agar materi tetap tampil.
 *
 * @param audience 'admin' = semua; 'student' = hanya published
 */
export async function fetchLessonMaterials(
  audience: 'admin' | 'student' = 'admin'
): Promise<LessonPdf[]> {
  try {
    const snap = await getDocs(collection(db, 'lessonMaterials'))
    if (snap.empty) {
      const seed = staticSeed()
      return audience === 'student' ? seed.filter(isPublished) : seed
    }
    const list = snap.docs
      .map((d) => {
        const data = d.data()
        let kind: LessonMaterialKind = 'drive'
        if (data.kind === 'html-lesson' || (typeof data.htmlContent === 'string' && data.htmlContent.length > 0)) {
          kind = 'html-lesson'
        } else if (data.kind === 'presentation' || (Array.isArray(data.slides) && data.slides.length > 0)) {
          kind = 'presentation'
        }
        const slides = Array.isArray(data.slides) ? (data.slides as PresentationSlide[]) : undefined
        const htmlContent = typeof data.htmlContent === 'string' ? data.htmlContent : undefined
        return {
          id: d.id,
          subjectKey: data.subjectKey as SubjectKey,
          title: String(data.title || ''),
          fileName: String(data.fileName || ''),
          sizeBytes: Number(data.sizeBytes) || 0,
          driveFileId: String(data.driveFileId || ''),
          kind,
          slides,
          htmlContent,
          sectionsCount: data.sectionsCount != null ? Number(data.sectionsCount) : undefined,
          outline: data.outline ? String(data.outline) : undefined,
          generatedBy: data.generatedBy ? String(data.generatedBy) : undefined,
          status: parseStatus(data.status),
          sortOrder:
            data.sortOrder != null && Number.isFinite(Number(data.sortOrder))
              ? Number(data.sortOrder)
              : undefined,
          publishedAt: data.publishedAt ?? null,
          isStatic: false,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        } satisfies LessonPdf
      })
      .filter((p) => p.title && (p.driveFileId || isPresentation(p) || isHtmlLesson(p)))
      .sort(
        (a, b) =>
          a.subjectKey.localeCompare(b.subjectKey) || compareLessonOrder(a, b)
      )

    if (audience === 'student') {
      return list.filter(isPublished)
    }
    return list
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code || ''
    const msg = String((e as { message?: string })?.message || e)
    if (code === 'permission-denied' || /insufficient permissions|permission-denied/i.test(msg)) {
      console.warn('[lessonMaterials] Firestore permission denied — memakai seed lokal. Deploy firestore.rules.')
      const seed = staticSeed()
      return audience === 'student' ? seed.filter(isPublished) : seed
    }
    throw e
  }
}

export async function saveLessonMaterial(
  material: Omit<LessonPdf, 'id' | 'isStatic' | 'createdAt' | 'updatedAt' | 'publishedAt'> & {
    id?: string
    /** Default: draft untuk materi baru; edit tanpa status = pertahankan di Firestore */
    status?: LessonMaterialStatus
  }
): Promise<string> {
  const isNew = !material.id
  const id = material.id || slugId(material.title, material.subjectKey)
  let kind: LessonMaterialKind = 'drive'
  if (material.kind === 'html-lesson' || (material.htmlContent && material.htmlContent.length > 0)) {
    kind = 'html-lesson'
  } else if (material.kind === 'presentation' || (material.slides && material.slides.length > 0)) {
    kind = 'presentation'
  }

  if (kind === 'drive' && !material.driveFileId?.trim()) {
    throw new Error('Tautan Google Drive atau File ID wajib untuk materi PDF.')
  }
  if (kind === 'presentation' && (!material.slides || material.slides.length === 0)) {
    throw new Error('Presentasi AI harus memiliki minimal satu slide.')
  }
  if (kind === 'html-lesson' && !material.htmlContent?.trim()) {
    throw new Error('Materi HTML harus memiliki konten.')
  }

  // Materi baru default draft. Edit tanpa status eksplisit: jangan timpa status yang ada.
  const status: LessonMaterialStatus | undefined =
    material.status !== undefined
      ? material.status
      : isNew
        ? 'draft'
        : undefined

  const payload: Record<string, unknown> = {
    subjectKey: material.subjectKey,
    title: material.title.trim(),
    fileName: (material.fileName || '').trim(),
    sizeBytes: Number(material.sizeBytes) || 0,
    driveFileId: (material.driveFileId || '').trim(),
    kind,
    updatedAt: serverTimestamp(),
  }
  if (status !== undefined) {
    payload.status = status
    if (status === 'published') {
      payload.publishedAt = serverTimestamp()
    }
  }
  if (material.sortOrder != null && Number.isFinite(Number(material.sortOrder))) {
    payload.sortOrder = Number(material.sortOrder)
  } else if (isNew) {
    // Materi baru ditaruh di akhir mapel (nilai besar agar tidak menggeser yang sudah diurutkan).
    payload.sortOrder = Date.now()
  }
  if (kind === 'presentation') {
    payload.slides = stripUndefined(material.slides)
    if (material.outline?.trim()) payload.outline = material.outline.trim()
    if (material.generatedBy) payload.generatedBy = material.generatedBy
  }
  if (kind === 'html-lesson') {
    payload.htmlContent = material.htmlContent
    if (material.outline?.trim()) payload.outline = material.outline.trim()
    if (material.generatedBy) payload.generatedBy = material.generatedBy
    if (material.sectionsCount != null) payload.sectionsCount = material.sectionsCount
  }
  if (isNew) payload.createdAt = serverTimestamp()

  const clean = stripUndefined(payload)
  await setDoc(doc(db, 'lessonMaterials', id), clean, { merge: true })
  return id
}

/**
 * Simpan urutan materi dalam satu mapel.
 * `orderedIds` = daftar id dari atas ke bawah (posisi 0, 10, 20, ...).
 * Hanya dokumen non-static yang di-update.
 */
export async function reorderLessonMaterials(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => {
    batch.set(
      doc(db, 'lessonMaterials', id),
      { sortOrder: index * 10, updatedAt: serverTimestamp() },
      { merge: true }
    )
  })
  await batch.commit()
}

/** Ubah status publish tanpa mengubah konten lain. */
export async function setLessonMaterialStatus(
  id: string,
  status: LessonMaterialStatus
): Promise<void> {
  const payload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  }
  if (status === 'published') {
    payload.publishedAt = serverTimestamp()
  }
  await setDoc(doc(db, 'lessonMaterials', id), payload, { merge: true })
}

export async function deleteLessonMaterial(id: string): Promise<void> {
  await deleteDoc(doc(db, 'lessonMaterials', id))
}

/** Salin seed LESSON_PDFS ke Firestore (sekali). */
export async function seedLessonMaterialsFromStatic(): Promise<number> {
  let count = 0
  // Beri sortOrder berurutan per mapel sesuai urutan seed, agar migrasi langsung terurut.
  const orderBySubject: Record<string, number> = {}
  for (const p of LESSON_PDFS) {
    const next = orderBySubject[p.subjectKey] ?? 0
    orderBySubject[p.subjectKey] = next + 10
    await setDoc(
      doc(db, 'lessonMaterials', p.id),
      {
        subjectKey: p.subjectKey,
        title: p.title,
        fileName: p.fileName,
        sizeBytes: p.sizeBytes,
        driveFileId: p.driveFileId,
        kind: 'drive',
        status: 'published',
        sortOrder: next,
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
    count += 1
  }
  return count
}
