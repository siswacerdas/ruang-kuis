# Anti-Regresi — Ruang Kuis

Checklist **wajib** sebelum dan sesudah perubahan kode.  
Tujuan: mencegah fitur yang sudah jalan tiba-tiba rusak (regresi).

Pola penyajian (stimulus, tiga tipe soal, preview, gate token/waktu) mengacu ke tka2026 sebagai **referensi tampilan saja**. Bukan format impor yang harus diimplementasikan.

Changelog satu-satunya: `CHANGELOG.md` di root repo.

---

## Checklist umum (selalu)

- [ ] `npm run build` tanpa error
- [ ] Tidak ada error merah di Console browser
- [ ] Desktop + mobile tetap rapi
- [ ] `CHANGELOG.md` (root) sudah diisi untuk perubahan ini
- [ ] Jangan commit `.firebase/` atau `dist/`

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
| Tujuan Pembelajaran | `TujuanPembelajaran.tsx`, `learningObjectives`, `bookMaterials` |
| Materi pelajaran | `Materi.tsx`, `MateriBody.tsx`, status draft/published |

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

- [ ] JSON / CSV / XLSX lewat template bank soal sendiri (bukan impor berkas tka2026)
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

## 7. Tujuan Pembelajaran & materi buku (`TujuanPembelajaran.tsx`)

- [ ] Chip filter mapel: angka = jumlah TP (tab TP) / materi (tab Materi) **per mapel**, cocok dengan data
- [ ] Filter satu mapel (mis. Al-Islam): hanya TP mapel itu; tidak bercampur dengan mapel lain
- [ ] Element kosong digabung ke grup **Umum** tanpa menghilangkan baris (tidak ada key React bentrok)
- [ ] CRUD: tambah / edit / simpan TP & materi buku
- [ ] **Hapus** satu TP / satu materi (daftar + modal); konfirmasi; tautan TP↔materi ikut dibersihkan
- [ ] Centang → **Hapus terpilih**; **Hapus semua yang tampil** (ikut filter); konfirmasi
- [ ] Impor JSON & ekspor JSON/CSV tetap jalan
- [ ] Setelah hapus massal, chip & daftar memuat ulang dengan jumlah benar

---

*Update terakhir: 2026-10-07 — changelog tunggal, impor TKA ditutup, cache hosting diabaikan*
