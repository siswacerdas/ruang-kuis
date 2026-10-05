# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Perbaiki stimulus teks dengan AI (editor soal)
- Tombol **✨ Perbaiki stimulus dengan AI** di bawah editor stimulus (muncul bila stimulus sudah terisi): AI merapikan stimulus agar jelas, runtut, berbahasa baku, dan pas dengan pertanyaan serta pilihan jawaban. Pertanyaan, pilihan, dan kunci tidak berubah.
- AI menerima pertanyaan, opsi + status kunci, pembahasan, dan stimulus lama; aturan: stimulus harus memuat data yang dibutuhkan, tidak boleh menyalin/menyatakan jawaban benar, tidak membuat pengecoh jadi benar, data & angka dipertahankan. Kolom arahan opsional dari guru.
- Keluaran dibatasi ke tag yang aman di editor guru **dan** halaman siswa (`p`, `br`, `b`, `i`, `u`, `sub`, `sup`, `span.math-tex`) lewat `src/lib/stimulusHtml.ts`.
- Pemeriksaan: peringatan bila angka stimulus lama hilang, stimulus memuat kalimat yang sama persis dengan jawaban benar, atau panjang berubah drastis; AI kedua menjawab soal tanpa melihat kunci lalu dibandingkan dengan kunci guru (dilewati untuk soal bergambar).
- Tombol **↩ Kembalikan stimulus semula**. Hasil AI tidak dipasang bila guru mengetik saat AI bekerja.
- File: `src/lib/stimulusHtml.ts` (baru), `src/lib/openaiQuestions.ts` (`improveStimulusWithAI`), `src/pages/TopicQuestions.tsx`.

### Added — Seimbangkan pilihan jawaban dengan AI (editor soal)
- Tombol **✨ Seimbangkan pilihan dengan AI** di bawah daftar pilihan: AI menulis ulang TEKS pilihan agar tidak ada pola yang membocorkan kunci (mis. jawaban benar = opsi terpanjang). Jumlah, urutan, dan kunci jawaban tidak berubah; berlaku untuk PG, PG kompleks, dan kategori.
- AI menerima pertanyaan, stimulus, pembahasan, dan tiap opsi beserta status kunci & panjangnya; ada kolom arahan opsional dari guru.
- Hasil diperiksa silang: AI kedua menjawab soal tanpa melihat kunci, lalu dibandingkan dengan kunci guru (peringatan merah bila berbeda). Dilewati untuk soal bergambar.
- Tombol **↩ Kembalikan pilihan semula** untuk membatalkan.
- **Peringatan pola panjang real time** (tanpa API) saat opsi benar jauh lebih panjang dari pengecoh.
- File: `src/lib/optionPattern.ts` (baru), `src/lib/openaiQuestions.ts` (`rewriteOptionsWithAI`), `src/pages/TopicQuestions.tsx`.

### Added — Generate gambar stimulus dengan AI (editor soal)
- Tombol **✨ Buat gambar dengan AI** di bawah field *Gambar stimulus* (muncul saat soal belum punya gambar; setelah jadi berubah menjadi **↻ Buat ulang**). Hanya membuat gambar, tidak mengubah isi soal.
- Prompt gambar ditulis AI dari pertanyaan, opsi, kunci (hanya agar konsisten, tidak digambar), dan stimulus teks; ada kolom arahan opsional dari guru.
- Memakai ulang `generateOpenAiImage` (model & aturan "tanpa teks/jawaban" yang sama dengan generate soal).
- Hasil otomatis dikonversi di browser ke JPEG kecil (maks 800 px, ±150 KB) lewat `src/lib/imageCompress.ts`.
- File: `src/lib/openaiQuestions.ts` (`generateStimulusImage`), `src/lib/imageCompress.ts` (baru), `src/pages/TopicQuestions.tsx`.

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
