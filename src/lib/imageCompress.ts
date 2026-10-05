/**
 * Konversi gambar (data-URL / URL) menjadi JPEG kecil yang aman disimpan di Firestore.
 *
 * Dipakai untuk gambar hasil generate AI (keluaran model 1024×1024 PNG ±1–2 MB).
 * Untuk unggahan manual tetap memakai compressStimulusImage di TopicQuestions.tsx
 * (sengaja tidak diubah agar perilaku lama tidak bergeser).
 */

export type CompressedImage = {
  dataUrl: string
  width: number
  height: number
  bytesApprox: number
}

export type CompressOptions = {
  /** Sisi terpanjang maksimum (px). Default 800 — cukup jelas untuk ilustrasi soal. */
  maxSide?: number
  /** Batas panjang data-URL (karakter). Default 200_000 ≈ 150 KB. */
  targetChars?: number
  /** Sisi terpanjang minimum saat diperkecil bertahap. Default 480. */
  minSide?: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // URL jarak jauh butuh CORS agar canvas tidak "tainted"; data-URL tidak perlu.
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(
        new Error(
          /^https?:/i.test(src)
            ? 'Gambar dari URL tidak bisa diproses (diblokir CORS). Coba generate ulang.'
            : 'Data gambar tidak valid'
        )
      )
    img.src = src
  })
}

export async function compressImageSrc(
  src: string,
  opts: CompressOptions = {}
): Promise<CompressedImage> {
  const maxSide = opts.maxSide ?? 800
  const target = opts.targetChars ?? 200_000
  const minSide = opts.minSide ?? 480

  const img = await loadImage(src)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  let w = Math.max(1, Math.round(img.width * scale))
  let h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia')

  const draw = () => {
    canvas.width = w
    canvas.height = h
    // Latar putih: PNG transparan jadi JPEG tanpa area hitam
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
  }

  draw()
  let quality = 0.85
  let out = canvas.toDataURL('image/jpeg', quality)
  while (out.length > target && quality > 0.5) {
    quality = Math.round((quality - 0.07) * 100) / 100
    out = canvas.toDataURL('image/jpeg', quality)
  }

  // Masih terlalu besar → perkecil resolusi bertahap
  while (out.length > target && Math.max(w, h) > minSide) {
    w = Math.max(1, Math.round(w * 0.85))
    h = Math.max(1, Math.round(h * 0.85))
    draw()
    out = canvas.toDataURL('image/jpeg', 0.7)
  }

  return {
    dataUrl: out,
    width: canvas.width,
    height: canvas.height,
    bytesApprox: Math.round((out.length * 3) / 4),
  }
}
