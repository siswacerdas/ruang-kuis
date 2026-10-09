/**
 * Migrasi gambar soal lama: stimulusImage "data:image/..." (base64 di Firestore)
 * -> JPEG kecil di Firebase Storage, dokumen hanya menyimpan URL.
 *
 * Default = DRY RUN (hanya laporan, tidak mengubah apa pun).
 *
 * Persiapan (sekali, di akar repo):
 *   npm i --no-save firebase-admin sharp
 *   Unduh service account: Firebase Console > Project settings > Service accounts > Generate new private key
 *   export GOOGLE_APPLICATION_CREDENTIALS=/jalur/ke/serviceAccount.json
 *
 * Pakai:
 *   node scripts/migrate-stimulus-images.mjs            # laporan saja
 *   node scripts/migrate-stimulus-images.mjs --apply    # lakukan migrasi
 *   opsi: --max-side=800 --quality=72 --limit=20
 *
 * Aman: cadangan data asli ditulis ke scripts/backup-stimulus-<waktu>.json SEBELUM ada perubahan;
 * dokumen yang gagal diproses dilewati; bisa dijalankan ulang (yang sudah URL tidak disentuh).
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import admin from 'firebase-admin'
import sharp from 'sharp'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)
const APPLY = args.apply === true
const MAX_SIDE = Number(args['max-side'] || 800)
const QUALITY = Number(args.quality || 72)
const LIMIT = Number(args.limit || Infinity)
const BUCKET = process.env.STORAGE_BUCKET || 'ruang-kuis.firebasestorage.app'

admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket: BUCKET })
const db = admin.firestore()
const bucket = admin.storage().bucket()

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

async function compress(buf) {
  return sharp(buf)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // PNG transparan -> latar putih
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer()
}

const snap = await db.collection('questions').get()
const targets = snap.docs.filter((d) => String(d.data().stimulusImage || '').startsWith('data:image'))
console.log(`Total soal: ${snap.size} | masih base64: ${targets.length} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)

let before = 0
let after = 0
const work = targets.slice(0, LIMIT)

for (const d of work) {
  const raw = d.data().stimulusImage
  before += raw.length
  try {
    const buf = Buffer.from(raw.split(',')[1], 'base64')
    const out = await compress(buf)
    after += out.length
    console.log(`${d.id}: ${kb(raw.length)} -> ${kb(out.length)}`)
    if (!APPLY) continue

    const path = `stimulus/migrated/${d.id}.jpg`
    const token = crypto.randomUUID()
    await bucket.file(path).save(out, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public,max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    })
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
    // cadangan ditulis dulu ke disk, baru dokumen diubah
    fs.writeFileSync(
      new URL(`./backup-stimulus-${d.id}.json`, import.meta.url),
      JSON.stringify({ id: d.id, stimulusImage: raw })
    )
    await d.ref.update({ stimulusImage: url })
  } catch (e) {
    console.warn(`LEWAT ${d.id}:`, e.message)
  }
}

console.log(
  `\nRingkasan: ${work.length} soal | base64 ${kb(before)} -> JPEG ${kb(after)} ` +
    `(hemat ${before ? Math.round((1 - after / before) * 100) : 0}%)`
)
if (!APPLY) console.log('Dry run selesai. Tambahkan --apply untuk menjalankan.')
