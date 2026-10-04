# Anti-Regresi — Ruang Kuis

Checklist **wajib** sebelum dan sesudah perubahan kode.  
Tujuan: mencegah fitur yang sudah jalan tiba-tiba rusak (regresi).

Referensi pola: tka2026 (stimulus, tiga tipe soal, preview, gate token/waktu).

---

## Checklist umum (selalu)

- [ ] `npm run build` tanpa error
- [ ] Tidak ada error merah di Console browser
- [ ] Desktop + mobile tetap rapi
- [ ] CHANGELOG.md sudah diisi untuk perubahan ini

---

## Area sensitif

| Area | File / koleksi |
|------|----------------|
| Skema soal & kunci | `src/types/question.ts`, `questions` |
| Import bank soal | `TopicQuestions.tsx` (`normalizeImportItem`, `resolveCorrectAnswers`) |
| Editor stimulus | `TopicQuestions.tsx` (HTML, gambar, kompres) |
| UI daftar / preview | `TopicQuestions.tsx` (detail + modal preview kuis) |
| UI kuis siswa | `KerjakanQuiz.tsx` |
| Paket latihan | `LatihanForm.tsx`, `latihan` |
| Penilaian | `gradeAnswer`, `attempts` |

---

## 1. Login & dashboard admin

- [ ] Login / logout / proteksi route admin

---

## 2. Bank soal

- [ ] CRUD soal (tambah, edit, hapus)
- [ ] Saat **Edit/Soal baru**: form penuh; **daftar soal tidak** ikut tampil di bawah form
- [ ] Tiga tipe: single / multiple / category
- [ ] Stimulus HTML (B/I/U, perataan, spasi baris, persamaan) tersimpan & tampil lagi saat edit
- [ ] Gambar stimulus: unggah file besar → otomatis dikompres; preview di detail daftar
- [ ] **Preview stimulus** (form edit) hanya menampilkan bacaan + gambar
- [ ] **Preview kuis** (dari daftar) menampilkan stimulus + gambar + opsi **tanpa** kunci jawaban
- [ ] Field skor / kompleksitas / TP tersimpan

### Import

- [ ] JSON / CSV / XLSX
- [ ] Kunci: indeks, huruf A–D, **atau teks opsi yang mengandung koma**
- [ ] Tipe `pg` / `pgk` / `pgk-cat` / single / multiple / category
- [ ] Duplikat (`importKey`) tidak digandakan
- [ ] Import gagal tidak merusak data lama

---

## 3. Paket latihan

- [ ] CRUD paket, token, jadwal, `questionIds` urutan stabil
- [ ] Jangan ubah `questionIds` paket yang sudah punya attempt tanpa konfirmasi

---

## 4. Kuis siswa (`/kerjakan`)

- [ ] Token + nama; satu soal per layar; timer; navigasi nomor
- [ ] Stimulus HTML + gambar terbingkai; lightbox (Tutup / Esc, tidak tutup saat klik backdrop)
- [ ] single / multiple / category (tabel desktop + kartu mobile)
- [ ] Submit → `attempts` → hasil; auto-submit waktu habis
- [ ] Skor & ringkasan TP

---

## 5. Firebase

- [ ] Rules: siswa tidak baca kunci mentah / ubah attempt orang lain
- [ ] Query `documentId in` batch ≤ 30
- [ ] Data-URL gambar stimulus tidak melebihi batas praktis dokumen (kompres client ~450 KB)

---

## 6. Definition of Done

- [ ] Skenario normal + edge case relevan lulus
- [ ] Tidak merusak fitur existing
- [ ] CHANGELOG diupdate
- [ ] Hard-refresh / deploy diverifikasi jika menyentuh hosting

---

*Update terakhir: 2026-10-04 — stimulus rich text, preview daftar, kompres gambar, fix import koma, hide list saat edit*
