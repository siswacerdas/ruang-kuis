# Ruang Kuis

Website latihan soal untuk siswa dan admin (guru). Backend: Firebase Authentication + Firestore. Frontend: Vite, React, TypeScript, Tailwind.

## Tujuan

- **Admin (guru):** kelola bank soal, paket latihan, tujuan pembelajaran, materi, laporan, dan daftar siswa.
- **Siswa:** mengerjakan paket, melihat hasil/riwayat, materi yang sudah terbit, dan latihan mandiri.

## Status

Aplikasi sudah dipakai (hosting Firebase). Catatan fitur ada di [CHANGELOG.md](./CHANGELOG.md). Checklist sebelum ubah kode: [docs/ANTI_REGRESSION.md](docs/ANTI_REGRESSION.md).

Pola penyajian kuis (stimulus, tiga tipe soal, preview) mengacu ke tka2026 sebagai **referensi tampilan saja**, bukan format impor.

## Menjalankan

```bash
npm install
npm run dev
```

Salin `.env.example` ke `.env` dan isi kredensial Firebase / kunci yang dipakai fitur AI.

## Deploy (Firebase Hosting)

Panduan: [docs/DEPLOY.md](docs/DEPLOY.md)

```bash
npm install
npm run build
firebase login
firebase use ruang-kuis
firebase deploy --only hosting
```

URL siswa: `https://ruang-kuis.web.app/kerjakan`  
URL admin: `https://ruang-kuis.web.app/login`

## Kontak

Dibuat oleh Arif Azwar Anas (@siswacerdas).
