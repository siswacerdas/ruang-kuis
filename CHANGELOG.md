# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Progress per studentId + riwayat siswa
- Tipe `LatihanAttempt.studentId` (sudah diisi saat submit dari `rk_session`).
- **Laporan**: agregasi per siswa memakai `studentId` bila ada, fallback nama (data lama).
- Halaman **`/kerjakan/riwayat`**: riwayat kuis, rata-rata, terbaik, capaian TP untuk siswa login.
- Taut **Riwayat kuis saya** di halaman token (`KerjakanEntry`).

### Added — Dashboard live & hasil siswa
- Dashboard: angka live + pengerjaan terbaru.
- KerjakanResult: feedback skor, warna TP, saran latihan ulang.

### Added — Progress di Laporan
- Tren skor, waktu pengerjaan, perhatian TP, profil per siswa.

### Changed — Daftar materi bank soal
- Layout master–detail; edit nama/tautan/TP.

---

## [0.3.0] — 2026-10-04

### Added — Stimulus & preview
- Editor stimulus, kompres gambar, preview, fix import koma.

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, skema, alur kerjakan awal.

---
