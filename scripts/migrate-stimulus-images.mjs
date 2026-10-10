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
 *   node scripts/migrate-stimulus-images.mjs                     # laporan saja (aman, tidak mengubah apa pun)
 *   node scripts/migrate-stimulus-images.mjs --apply --limit=3   # coba 3 soal dulu
 *   node scripts/migrate-stimulus-images.mjs --apply             # semuanya
 *   opsi: --max-side=800 --quality=72 --limit=20
 *
 * Pemulihan bila perlu: node scripts/restore-stimulus-images.mjs --apply
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
let migrated = 0
let skipped = 0
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
    const backupFile = new URL(`./backup-stimulus-${d.id}.json`, import.meta.url)
    fs.writeFileSync(backupFile, JSON.stringify({ id: d.id, stimulusImage: raw }))
    try {
      // Hanya menimpa bila dokumen belum diubah sejak dibaca (mis. guru sedang mengedit soal ini)
      await d.ref.update({ stimulusImage: url }, { lastUpdateTime: d.updateTime })
    } catch (e) {
      fs.rmSync(backupFile, { force: true }) // tidak jadi diubah -> cadangan tidak diperlukan
      throw e
    }
    migrated++
  } catch (e) {
    skipped++
    console.warn(`LEWAT ${d.id}:`, e.message)
  }
}

console.log(
  `\nRingkasan: ${work.length} soal | base64 ${kb(before)} -> JPEG ${kb(after)} ` +
    `(hemat ${before ? Math.round((1 - after / before) * 100) : 0}%)`
)
if (APPLY) console.log(`Berhasil dimigrasi: ${migrated} | dilewati: ${skipped}`)
if (!APPLY) console.log('Dry run selesai. Tambahkan --apply untuk menjalankan.')

/* ---- Laporan baca-saja: gambar base64 di koleksi lain (tidak diubah oleh script ini) ---- */
const DATA_URL = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g
function dataUrlBytes(value) {
  if (typeof value === 'string') return (value.match(DATA_URL) || []).reduce((n, m) => n + m.length, 0)
  if (Array.isArray(value)) return value.reduce((n, v) => n + dataUrlBytes(v), 0)
  if (value && typeof value === 'object') return Object.values(value).reduce((n, v) => n + dataUrlBytes(v), 0)
  return 0
}
for (const name of ['lessonMaterials', 'bookMaterials', 'topics']) {
  const snapOther = await db.collection(name).get()
  const rows = snapOther.docs
    .map((d) => ({ id: d.id, title: d.data().title || d.data().name || '', bytes: dataUrlBytes(d.data()) }))
    .filter((r) => r.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
  const total = rows.reduce((n, r) => n + r.bytes, 0)
  console.log(`\n[${name}] dokumen: ${snapOther.size} | berisi gambar base64: ${rows.length} | total ${kb(total)}`)
  rows.slice(0, 5).forEach((r) => console.log(`   ${r.id} ${String(r.title).slice(0, 40)} — ${kb(r.bytes)}`))
}
