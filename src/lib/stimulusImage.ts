/**
 * Unggah gambar stimulus ke Firebase Storage agar dokumen Firestore tetap kecil.
 *
 * - data:image / blob → kompres + upload → URL publik
 * - https:// URL yang sudah ada → dikembalikan apa adanya
 * - string kosong / null → null
 *
 * Kompatibel mundur: soal lama yang masih menyimpan data-URL tetap bisa ditampilkan
 * (renderer di KerjakanQuiz/PracticeQuiz sudah menerima keduanya).
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'
import { compressImageSrc } from './imageCompress'

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/jpeg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Pastikan nilai stimulusImage siap disimpan di Firestore:
 * unggah base64/blob ke Storage, atau biarkan URL HTTPS.
 */
export async function ensureStimulusImageStored(
  value: string | null | undefined,
  opts?: { pathPrefix?: string }
): Promise<string | null> {
  const raw = (value || '').trim()
  if (!raw) return null

  // Sudah URL publik (Storage / CDN / eksternal)
  if (/^https?:\/\//i.test(raw)) return raw

  // Bukan data-URL → anggap invalid, jangan simpan
  if (!raw.startsWith('data:image')) return null

  // Kompres dulu agar file Storage kecil
  let dataUrl = raw
  try {
    const compressed = await compressImageSrc(raw, {
      maxSide: 1000,
      targetChars: 280_000, // ~210 KB
      minSide: 480,
    })
    dataUrl = compressed.dataUrl
  } catch {
    // lanjut dengan original jika kompres gagal
  }

  const blob = dataUrlToBlob(dataUrl)
  const prefix = (opts?.pathPrefix || 'stimulus').replace(/\/+$/, '')
  const path = `${prefix}/${randomId()}.jpg`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, blob, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=31536000',
  })

  return getDownloadURL(storageRef)
}

/** Apakah string ini data-URL gambar (masih di Firestore lama)? */
export function isDataUrlImage(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith('data:image'))
}
