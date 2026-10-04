# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added
- **Lightbox gambar stimulus di bank soal (admin)** — `TopicQuestions.tsx`: tombol 🔍 Lihat lebih besar pada panel detail, preview stimulus, dan preview kuis. Zoom +/− / 100%. Tutup **hanya** lewat tombol Tutup atau Esc (klik backdrop tidak menutup). Pola sama dengan `KerjakanQuiz` siswa.

### Fixed (manual push UI besar)
- **`src/pages/TopicQuestions.tsx`** & **`KerjakanQuiz.tsx`**: pastikan file patch terbaru sudah di repo lokal sebelum deploy (lihat patch zip di chat).

---

## [0.3.0] — 2026-10-04

### Added — Stimulus & preview (Fase C lanjut)
- Editor stimulus kaya fitur: **tebal, miring, garis bawah**, paragraf, **rata kiri/tengah/kanan/kiri-kanan**, jarak baris (per paragraf terpilih bila ada seleksi), sisip **persamaan LaTeX** (opsional KaTeX di `index.html`).
- **Preview stimulus** di form edit (hanya bacaan + gambar stimulus).
- **Preview kuis** di **daftar soal** (panel detail): tampilan ala siswa termasuk stimulus HTML + gambar, tanpa kunci jawaban.
- Panel detail daftar soal menampilkan **stimulus terformat + gambar** (sebelumnya hanya teks polos / tanpa gambar).
- Unggah gambar stimulus: **kompres & resize otomatis** (maks ~1200px, target ~450 KB) — tidak menolak file >1,5 MB.

### Fixed
- Import soal gagal jika kunci jawaban teks mengandung **koma** (contoh: `Sabtu, 11 Oktober…`) — `resolveCorrectAnswers` mencocokkan string utuh dulu; pemisah multi-kunci mengutamakan `;` / `|`.
- Saat **edit soal**, daftar soal tidak lagi tampil di bawah form (hanya form editor).

### Changed
- Form edit: preview cuplikan di dalam form dihapus; preview penuh dipindah ke daftar soal.

---

## [0.2.2] — 2026-10-04

### Changed
- `docs/template_import_soal.csv`: kolom `stimulus`, `kompleksitas`, `skor`; contoh kunci teks opsi; tipe `pg`/`pgk`.

---

## [0.2.1] — 2026-10-04

### Added (Fase B — skema)
- Field opsional: `stimulusImage`, `tipeMateri`, `kompleksitas`, `skor`.
- `mapTkaType()`, `resolveCorrectAnswers()` (kunci teks opsi / indeks / A–D).

### Tidak Berubah
- `correctAnswers: number[]`, scoring, collection Firestore existing.

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, anti-regresi diperluas, rencana A→B→C (selaras tka2026).

---

## [0.1.0] — 2026-10-03 / 2026-10-04

### Added
- Setup app, bank soal, latihan, alur kerjakan.

---
