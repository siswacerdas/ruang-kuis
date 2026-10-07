import type { LessonPdf } from '../lib/lessonMaterials'

/** Tombol naik/turun urutan materi (admin). */
export function MateriReorderButtons({
  index,
  total,
  isStatic,
  busy,
  onMove,
}: {
  index: number
  total: number
  isStatic?: boolean
  busy: boolean
  onMove: (index: number, direction: -1 | 1) => void
}) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onMove(index, -1)}
        disabled={busy || index === 0 || !!isStatic}
        className="w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
        title="Naikkan urutan (dipelajari lebih dulu)"
        aria-label="Naikkan urutan"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      </button>
      <button
        type="button"
        onClick={() => onMove(index, 1)}
        disabled={busy || index === total - 1 || !!isStatic}
        className="w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
        title="Turunkan urutan"
        aria-label="Turunkan urutan"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
    </div>
  )
}

export async function moveMaterialInList(
  pdfs: LessonPdf[],
  index: number,
  direction: -1 | 1,
  reorder: (ids: string[]) => Promise<void>,
): Promise<boolean> {
  const target = index + direction
  if (target < 0 || target >= pdfs.length) return false
  if (pdfs.some((p) => p.isStatic)) {
    alert('Data seed statis. Migrasi ke Firestore dulu agar bisa mengurutkan materi.')
    return false
  }
  const next = [...pdfs]
  const tmp = next[index]
  next[index] = next[target]
  next[target] = tmp
  await reorder(next.map((p) => p.id))
  return true
}
