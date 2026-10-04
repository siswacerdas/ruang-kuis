# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Dashboard live (`Dashboard.tsx`)
- Kartu angka dari Firestore: pengerjaan kuis, siswa unik, rata skor, paket, materi, soal.
- Daftar **pengerjaan terbaru** (8 attempt terakhir) + taut ke Laporan.

### Added — Hasil kuis siswa (`KerjakanResult.tsx`)
- Feedback teks sesuai rentang skor; warna skor/TP; blok **Perlu dilatih lagi** (TP < 70%).

### Added — Progress siswa di Laporan (`Laporan.tsx`)
- Dashboard progress berbasis **attempts (kuis saja)**: kartu pengerjaan, siswa unik, rata skor, waktu pengerjaan, % paket tersentuh.
- **Tren skor** per minggu/bulan; **waktu pengerjaan**; **perhatian TP**; profil per siswa.

### Changed — Daftar materi bank soal (`SubjectTopics.tsx`)
- Layout master–detail; edit nama/tautan/TP; filter daftar.

### Added
- Lightbox stimulus di bank soal (admin).

---

## [0.3.0] — 2026-10-04

### Added — Stimulus & preview (Fase C lanjut)
- Editor stimulus kaya, preview, kompres gambar, fix import koma, hide list saat edit.

---

## [0.2.2] — 2026-10-04

### Changed
- Template import CSV (stimulus, kompleksitas, skor).

---

## [0.2.1] — 2026-10-04

### Added (Fase B — skema)
- Field stimulusImage, mapTkaType, resolveCorrectAnswers.

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, anti-regresi, rencana A→B→C.

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- Setup app, bank soal, latihan, alur kerjakan.

---
