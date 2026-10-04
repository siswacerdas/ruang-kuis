# Ruang Kuis

Website latihan soal (kuis) untuk siswa dan admin (guru).

## Tujuan Proyek

- **Admin (Guru)**: Login khusus untuk mengelola soal, melihat progress siswa, dan fitur administrasi lainnya.
- **Siswa**: Mengerjakan latihan soal secara online.

Backend & database akan menggunakan **Firebase** (Authentication + Firestore).
Frontend saat ini masih dalam tahap awal.

## Status Saat Ini

Proyek baru dimulai. Lihat file [PROGRESS.md](./PROGRESS.md) untuk catatan kemajuan.

## Cara Menjalankan (Nanti)

Panduan lengkap akan ditambahkan setelah struktur proyek siap.

## Struktur Folder (Rencana)

```
ruang-kuis/
├── README.md
├── PROGRESS.md
├── docs/
│   └── ANTI_REGRESSION.md
├── src/                  # kode frontend (nanti)
├── public/               # aset statis (nanti)
└── ...
```

## Kontak

Dibuat oleh Arif Azwar Anas (@siswacerdas).


## Deploy (Firebase Hosting)

Lihat panduan lengkap: [docs/DEPLOY.md](docs/DEPLOY.md)

Ringkas:

```bash
npm install
npm run build
firebase login
firebase use ruang-kuis
firebase deploy --only hosting
```

URL siswa: `https://ruang-kuis.web.app/kerjakan`  
URL admin: `https://ruang-kuis.web.app/login`
