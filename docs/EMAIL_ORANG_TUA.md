# Notifikasi Hasil Kuis ke Email Orang Tua

Setelah siswa menyelesaikan latihan, Cloud Function `onAttemptCreated` mengirim ringkasan skor ke **email orang tua** (`students.parentEmail`), jika field tersebut terisi dan valid.

## Prasyarat

1. **Firebase Blaze plan** (pay-as-you-go) — wajib untuk Cloud Functions.
2. Akun **[Resend](https://resend.com)** (gratis: 100 email/hari, 3.000/bulan).
3. Node.js 20+ di mesin lokal untuk build/deploy.

## Langkah setup (sekali saja)

### 1. Isi email orang tua di aplikasi

Di menu **Daftar Siswa**:

- Klik **Edit** per siswa → isi **Email orang tua**, atau
- Klik **Sinkron email ortu** dan unggah CSV dengan kolom `NISN` (atau Nama) + `Email Orang Tua`.

Contoh CSV (delimiter `;` atau `,`):

```csv
Nama Siswa;Email Orang Tua;NISN
Abdurrahman Ar Ribery;ortu@gmail.com;3153742941
```

Siswa tanpa email ortu **dilewati** (tidak error).

### 2. Buat API key Resend

1. Daftar / login di https://resend.com
2. **API Keys** → Create → salin key (`re_...`)
3. (Opsional tapi disarankan) verifikasi domain sendiri agar From bukan `onboarding@resend.dev`

### 3. Simpan secret di Firebase

```bash
firebase login
firebase use ruang-kuis

# Tempel API key saat diminta (tidak akan masuk ke git)
firebase functions:secrets:set RESEND_API_KEY
```

### 4. Install & deploy Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Atau dari root (setelah `functions/node_modules` terpasang):

```bash
firebase deploy --only functions
```

Region default: **asia-southeast2** (Jakarta).

### 5. (Opsional) Ganti alamat pengirim

Default: `Ruang Kuis <onboarding@resend.dev>` (hanya untuk uji; Resend membatasi penerima ke email akun Anda).

Setelah domain terverifikasi di Resend:

```bash
# Di functions/src/index.ts, ubah konstanta FROM_EMAIL, lalu deploy ulang
# contoh: Ruang Kuis <kuis@sekolahanda.sch.id>
```

Atau set env saat deploy (lihat dokumentasi Firebase params).

## Cara kerja

```
Siswa submit kuis
  → dokumen baru di Firestore collection `attempts`
  → trigger onAttemptCreated
  → baca students/{studentId}.parentEmail
  → jika valid + RESEND_API_KEY ada → kirim email HTML
  → update attempt: parentEmailStatus = sent | error
```

Field yang ditulis ke dokumen attempt:

| Field | Arti |
|--------|------|
| `parentEmailStatus` | `sent` / `error` |
| `parentEmailTo` | alamat yang dikirimi |
| `parentEmailMessageId` | ID Resend |
| `parentEmailError` | pesan error (jika gagal) |
| `parentEmailAt` | timestamp |

## Uji coba

1. Pastikan satu siswa punya `parentEmail` = email Anda sendiri.
2. Kerjakan & submit satu paket latihan sebagai siswa itu.
3. Cek inbox (+ spam).
4. Di Firestore → `attempts` → dokumen terbaru → cek `parentEmailStatus`.

Log Function:

```bash
firebase functions:log --only onAttemptCreated
```

## Biaya perkiraan

- Resend free tier biasanya cukup untuk 1 kelas (~25 siswa × beberapa kuis/minggu).
- Cloud Functions: gratis sampai kuota Spark/Blaze harian; beban sangat kecil (1 invokasi per attempt).

## Keamanan & privasi

- Email hanya dikirim ke `parentEmail` milik siswa yang mengerjakan.
- Secret API key tidak masuk ke frontend / git.
- Siswa tanpa `parentEmail` tidak memicu kirim.
- Sudah ada izin dari orang tua (sesuai kebijakan sekolah Anda).

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Tidak ada email | `parentEmail` terisi? Secret ter-set? Deploy functions sukses? |
| Resend tolak | Domain From belum verifikasi / masih pakai onboarding + penerima bukan email akun Resend |
| Function error | `firebase functions:log` |
| Blaze required | Upgrade project di Firebase Console |
