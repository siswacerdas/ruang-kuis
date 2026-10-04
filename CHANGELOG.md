# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Planned — Selaras tka2026

- **Skema soal**: mapping tipe `single`/`multiple`/`category` ↔ `pg`/`pgk`/`pgk-cat`; dukungan kunci berbasis teks opsi (kompatibel dengan indeks lama).
- **Import bank soal**: template Excel/JSON selaras tka2026 (stimulus, skor, kompleksitas, rows/cols untuk kategori).
- **Penyajian kuis**: stimulus + gambar terbingkai, lightbox, tabel pgk-cat, navigasi nomor LMS-style.
- **Scoring aman (bertahap)**: hash kunci (opsional) tanpa merusak attempt lama.

---

## [0.2.0] — 2026-10-04

### Added
- **Dokumentasi anti-regresi** diperluas (area sensitif bank soal, kuis siswa, paket latihan, scoring).
- **CHANGELOG.md** (file ini) untuk jejak upgrade/perbaikan.
- Rencana migrasi pengemasan & penyajian soal mengacu pola tka2026.

### Changed
- `docs/ANTI_REGRESSION.md` dan `PROGRESS.md` diperbarui mengikuti status fitur terkini (bank hierarkis, import TP, latihan soal, halaman kerjakan).

### Tidak Berubah
- Skema Firestore `questions` / `topics` / `latihan` / `attempts` yang sudah dipakai production.
- Penilaian berbasis indeks `correctAnswers` (masih valid).

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- Setup React + Vite + Firebase (Auth + Firestore).
- Login admin, dashboard, layout sidebar.
- Bank soal hierarkis: Mapel → Materi (topics) → Soal.
- Tiga tipe soal: `single`, `multiple`, `category`.
- Import soal JSON / CSV / XLSX + field TP (Tujuan Pembelajaran).
- Paket latihan (`latihan`): token, jadwal, status, time limit, shuffle.
- Alur siswa: masuk token → kerjakan → hasil + ringkasan TP.
- Laporan admin dasar.

---
