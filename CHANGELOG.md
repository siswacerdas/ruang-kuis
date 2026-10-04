# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Fixed (manual push UI besar)
- **`src/pages/TopicQuestions.tsx`** & **`KerjakanQuiz.tsx`**: pastikan file patch terbaru sudah di repo lokal sebelum deploy (lihat patch zip di chat).

---

## [0.3.0] — 2026-10-04

### Added — Stimulus & preview (Fase C lanjut)
- Editor stimulus: tebal, miring, garis bawah, paragraf, rata kiri/tengah/kanan/kiri-kanan, jarak baris (per paragraf terpilih bila ada seleksi), persamaan LaTeX (opsional KaTeX).
- **Preview stimulus** di form edit (hanya bacaan + gambar).
- **Preview kuis** di daftar soal: tampilan ala siswa (stimulus HTML + gambar), tanpa kunci jawaban.
- Detail daftar soal menampilkan stimulus terformat + gambar.
- Unggah gambar: kompres & resize otomatis (~1200px, ~450 KB).

### Fixed
- Import gagal jika kunci teks mengandung koma — `resolveCorrectAnswers` cocokkan string utuh dulu.
- Saat edit soal, daftar soal tidak tampil di bawah form.

### Changed
- Preview cuplikan di form edit dihapus; preview penuh di daftar soal.

---

## [0.2.2] — 2026-10-04

### Changed
- `docs/template_import_soal.csv`: kolom stimulus, kompleksitas, skor; kunci teks opsi.

---

## [0.2.1] — 2026-10-04

### Added (Fase B — skema)
- Field opsional: stimulusImage, tipeMateri, kompleksitas, skor.
- mapTkaType(), resolveCorrectAnswers().

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, anti-regresi, rencana A→B→C.

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- Setup app, bank soal, latihan, alur kerjakan.

---
