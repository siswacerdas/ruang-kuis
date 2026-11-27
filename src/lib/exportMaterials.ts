import {
  compareLessonOrder,
  isHtmlLesson,
  isPresentation,
  isPublished,
  type LessonPdf,
} from './lessonMaterials'

export const MATERIAL_EXPORT_FORMAT = 'ruang-kuis-materi'
export const MATERIAL_EXPORT_VERSION = 1

/** Timestamp Firestore → string ISO (null bila kosong). */
function toIso(value: LessonPdf['createdAt']): string | null {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null
}

function toExportItem(m: LessonPdf) {
  const kind = isHtmlLesson(m) ? 'html-lesson' : isPresentation(m) ? 'presentation' : 'drive'
  // Field opsional yang undefined otomatis tidak ditulis oleh JSON.stringify.
  return {
    id: m.id,
    subjectKey: m.subjectKey,
    title: m.title,
    kind,
    status: isPublished(m) ? 'published' : 'draft',
    sortOrder: m.sortOrder,
    fileName: m.fileName,
    sizeBytes: m.sizeBytes,
    driveFileId: m.driveFileId,
    sectionsCount: m.sectionsCount,
    outline: m.outline,
    generatedBy: m.generatedBy,
    htmlContent: m.htmlContent,
    slides: m.slides,
    createdAt: toIso(m.createdAt),
    updatedAt: toIso(m.updatedAt),
    publishedAt: toIso(m.publishedAt),
  }
}

/** Susun isi berkas ekspor. Urutan: mapel, lalu urutan belajar. */
export function buildMaterialExport(materials: LessonPdf[], now = new Date()) {
  const sorted = [...materials].sort(
    (a, b) => a.subjectKey.localeCompare(b.subjectKey) || compareLessonOrder(a, b)
  )
  return {
    format: MATERIAL_EXPORT_FORMAT,
    version: MATERIAL_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    count: sorted.length,
    materials: sorted.map(toExportItem),
  }
}

function fileSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48)
      .replace(/^-|-$/g, '') || 'materi'
  )
}

/** Unduh materi sebagai berkas .json. `label` dipakai di nama berkas. */
export function downloadMaterialsJson(materials: LessonPdf[], label: string): void {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const json = JSON.stringify(buildMaterialExport(materials, now), null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `materi_${fileSlug(label)}_${date}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
