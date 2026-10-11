/**
 * Query riwayat yang tumbuh sebanding dengan "paket yang relevan", bukan seluruh sejarah.
 *
 * - Dokumen dicari berdasarkan daftar id (potongan ≤30, batas operator `in` Firestore).
 * - Hasil kuis siswa dicari hanya untuk paket yang sedang ditampilkan (bukan semua riwayat).
 */
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'

export const IN_LIMIT = 30

export function chunk<T>(items: T[], size = IN_LIMIT): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const uniq = (ids: (string | undefined | null)[]) =>
  [...new Set(ids.filter((x): x is string => !!x))]

/** Ambil dokumen berdasarkan id (mis. hanya paket yang muncul di riwayat siswa). */
export async function getDocsByIds(
  collectionName: string,
  ids: (string | undefined | null)[]
): Promise<QueryDocumentSnapshot[]> {
  const list = uniq(ids)
  if (list.length === 0) return []
  const snaps = await Promise.all(
    chunk(list).map((c) =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', c)))
    )
  )
  return snaps.flatMap((s) => s.docs)
}

/** Hasil kuis guru milik satu siswa, terbatas pada paket tertentu. */
export async function getAttemptsForPakets(
  field: 'studentId' | 'studentName',
  value: string,
  latihanIds: (string | undefined | null)[]
): Promise<QueryDocumentSnapshot[]> {
  const list = uniq(latihanIds)
  if (list.length === 0 || !value) return []
  const snaps = await Promise.all(
    chunk(list).map((c) =>
      getDocs(
        query(collection(db, 'attempts'), where(field, '==', value), where('latihanId', 'in', c))
      )
    )
  )
  return snaps.flatMap((s) => s.docs)
}

/** Gabungkan dokumen dari beberapa query tanpa duplikat (id yang sama dihitung sekali). */
export function dedupeDocs<T extends { id: string }>(...lists: T[][]): T[] {
  const map = new Map<string, T>()
  lists.flat().forEach((d) => map.set(d.id, d))
  return [...map.values()]
}
