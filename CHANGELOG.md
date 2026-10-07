# Changelog

Semua perubahan penting pada proyek **Ruang Kuis** dicatat di file ini (satu-satunya changelog).

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/), dan proyek ini mengikuti [Semantic Versioning](https://semver.org/lang/id/).

---

## [Unreleased]

### Added — Urutan materi belajar (admin/guru)
- Field `sortOrder` pada `lessonMaterials` agar admin bisa mengurutkan materi per mapel.
- Tombol **↑ / ↓** di daftar materi admin: nomor 01 = dipelajari lebih dulu oleh siswa.
- Daftar siswa mengikuti urutan yang sama (bukan alfabet).
- Materi baru otomatis di akhir daftar; migrasi seed mendapat urutan sesuai urutan seed.
- File: `src/lib/lessonMaterials.ts`, `src/pages/MateriBody.tsx`.

### Changed — Beres-beres repo
- Cache Firebase CLI (`.firebase/`, termasuk `hosting.*.cache`) tidak lagi dilacak; folder di-gitignore.
- `ai-image-compress.patch` dihapus. Kompres gambar stimulus sudah ada di `src/lib/imageCompress.ts`.
- Changelog hanya di root. `src/CHANGELOG.md` dihapus (subset yang ketinggalan).
- Impor format tka2026 ditutup. Berkas itu hanya referensi penyajian kuis, bukan backlog impor.

### Added — Materi HTML, draft/publish, AI lesson
- Status materi `draft` / `published`. Siswa hanya melihat yang terbit; admin melihat badge status.
- Form input/edit materi HTML dengan pratinjau (`HtmlMaterialEditor`, `MateriBody`).
- Halaman `/materi` dan `/siswa/materi` memakai fetch sesuai audiens.
- Generate materi AI disimpan sebagai draft, bukan langsung terbit.

### Added — Notifikasi hasil kuis ke email orang tua
- Field `parentEmail` pada data siswa (terpisah dari email login fiktif).
- **Daftar Siswa**: kolom email ortu, tombol **Edit**, form edit (nama, panggilan, NISN, email ortu), tombol **Sinkron email ortu** (CSV cocokkan NISN/nama).
- Cloud Function `onAttemptCreated` (region `asia-southeast2`): saat attempt baru, kirim ringkasan skor + capaian TP ke `parentEmail` lewat Resend.
- Status pengiriman ditulis kembali ke dokumen attempt (`parentEmailStatus`, `parentEmailTo`, dll.).
- Deskripsi singkat TP ikut tampil di email, bukan hanya kode.
- Panduan setup: `docs/EMAIL_ORANG_TUA.md`.
- Template import siswa menambah kolom `Email Orang Tua`.
- File: `src/types/student.ts`, `src/pages/SiswaList.tsx`, `functions/**`, `firebase.json`, `docs/EMAIL_ORANG_TUA.md`, `docs/template_import_siswa.csv`.

### Changed — Chip filter mapel menampilkan satuan sesuai tab aktif
- Tab **Tujuan Pembelajaran**: chip menampilkan jumlah **TP** (contoh: `AI (10 TP)`).
- Tab **Materi buku**: chip menampilkan jumlah **materi** (contoh: `AI (3 materi)`).
- Label kecil di atas chip menjelaskan arti angka agar tidak ambigu.
- File: `src/pages/TujuanPembelajaran.tsx`.

### Fixed — TP mapel hilang/tercampur + jumlah chip tidak akurat (Tujuan Pembelajaran)
- **Penyebab:** pengelompokan TP membandingkan `element` mentah (`''`) dengan label grup `'Umum'`, sehingga baris ber-element kosong membentuk **grup duplikat** dengan React key sama (`subjectKey-Umum`). React menggabungkan/menghilangkan baris → jumlah TP per mapel tidak cocok (mis. Al-Islam 10 → tampil 9) dan tampilan bisa terlihat “bercampur” antar mapel.
- **Perbaikan:** normalisasi `element` ke `'Umum'` sebelum banding & simpan grup; key section memakai indeks unik; chip filter memakai hitungan per-mapel yang stabil (`tpCountBySubject` / `materialCountBySubject`); tab Materi menampilkan jumlah materi (bukan jumlah TP).
- File: `src/pages/TujuanPembelajaran.tsx`.

### Added — Hapus TP / materi buku (satu, terpilih, semua yang tampil)
- Tombol **Hapus** per baris TP dan kartu materi; **Hapus TP/materi** di modal edit.
- Centang + **Pilih semua yang tampil**, **Hapus terpilih**, **Hapus semua yang tampil** (menghormati filter mapel & pencarian; konfirmasi ganda jika ≥ 20 item).
- Hapus TP melepas kode dari `suggestedTpCodes` materi terkait; hapus materi melepas judul dari `relatedMaterials` TP. Batch Firestore ≤ 400.
- File: `src/pages/TujuanPembelajaran.tsx`.

### Fixed — Impor siswa berhenti jika "Nama Panggilan" kosong (Siswa → Import CSV/Excel)
- **Penyebab:** baris tanpa nama panggilan dikirim ke Firestore dengan `nickname: undefined`, yang ditolak (`Unsupported field value: undefined`). Impor berhenti di baris itu, baris sesudahnya tidak masuk, daftar tidak dimuat ulang, dan pesan yang tampil menyesatkan ("Gagal membaca file").
- **Perbaikan:** field `nickname` hanya disertakan bila terisi. Satu baris yang gagal tidak lagi menghentikan baris lain; ringkasan menyebut baris data yang gagal beserta penyebabnya, dan daftar selalu dimuat ulang. Impor ulang aman (siswa yang sudah ada dilewati berdasarkan email).
- File: `src/pages/SiswaList.tsx`.

### Fixed — Paket latihan gagal disimpan (Latihan Soal → Generate Otomatis / Buat Manual)
- **Penyebab:** `LatihanForm` mengirim field opsional dengan nilai `undefined` (`description` kosong, `timeLimitMinutes` = 0) ke Firestore, yang menolak nilai `undefined` (`Unsupported field value: undefined`). Paket hanya tersimpan jika Deskripsi terisi **dan** Batas waktu > 0, sehingga paket tidak muncul di daftar.
- **Perbaikan:** paket baru tidak lagi menyertakan field opsional yang kosong; saat edit, field yang dikosongkan dihapus dari dokumen dengan `deleteField()`.
- Pesan error simpan kini menampilkan detail penyebab dan layar otomatis menggulir ke pesan tersebut (sebelumnya tampil di atas form, jauh dari tombol simpan).
- Tombol **Cepat: 10 soal / 20 soal** kini memakai jumlah yang benar (sebelumnya memakai jumlah lama karena state belum ter-update).
- File: `src/pages/LatihanForm.tsx`.

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
- Hasil otomatis dikonversi di browser ke JPEG kecil (maks 800 px, ≈150 KB) lewat `src/lib/imageCompress.ts`.
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

### Changed — Sambutan login
- Teks hero login lebih hangat, fokus belajar bukan teknis.

---

## [0.3.0] — 2026-10-04

### Added — Stimulus & preview
- Editor stimulus, kompres gambar, preview, fix import koma.

---

## [0.2.0] — 2026-10-04

### Added
- CHANGELOG, skema, alur kerjakan awal.

---
