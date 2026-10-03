# Catatan Progress - Ruang Kuis

File ini digunakan untuk mencatat kemajuan proyek secara kronologis.
Update file ini setiap kali ada progress berarti.

---

## 2026-10-03

### Yang sudah dilakukan
- [x] Membuat repository `ruang-kuis` di GitHub
- [x] Membuat `README.md`
- [x] Membuat `PROGRESS.md` (file ini)
- [x] Membuat `docs/ANTI_REGRESSION.md`
- [x] Memutuskan tech stack: **Vite + React + TypeScript + Tailwind CSS**
- [x] Setup project Vite + React + TypeScript
- [x] Install dan konfigurasi Tailwind CSS v4
- [x] Install React Router
- [x] Membuat halaman **Login Admin**
- [x] Setup Firebase project + Authentication (Email/Password)
- [x] Hubungkan Firebase Auth ke aplikasi
- [x] Login Admin berhasil menggunakan Firebase
- [x] Membuat halaman **Dashboard Admin**
- [x] Proteksi route (hanya user login yang bisa akses)
- [x] Fitur **Logout** + redirect otomatis
- [x] Setup **Firestore Database**
- [x] Fitur **Kelola Soal** (CRUD lengkap):
  - Tambah soal manual
  - Edit soal
  - Hapus soal
  - Lihat daftar soal
- [x] Fitur **Import Soal** dari file (JSON, CSV, Excel)
- [x] Berhasil import 5 contoh soal biotik-abiotik (IPAS Kelas 5 SD)
- [x] Membuat Dokumen Serah Terima untuk melanjutkan di percakapan baru

### Keputusan Teknis
- Frontend: Vite + React + TypeScript + Tailwind CSS v4
- Backend: Firebase (Authentication + Firestore)
- Hosting nanti: Firebase Hosting
- Preferensi development: kode digenerate langsung di GitHub, user tinggal `git pull`

### Selanjutnya (Prioritas)
- [ ] Halaman untuk siswa mengerjakan latihan soal
- [ ] Menampilkan skor / hasil latihan
- [ ] Sistem role (Admin vs Siswa) — opsional
- [ ] Kunci Firestore Security Rules (saat ini masih test mode)
- [ ] Deploy ke Firebase Hosting

---

*Catatan: Selalu update file ini setelah menyelesaikan task penting.*
*Update terakhir: 2026-10-03*
