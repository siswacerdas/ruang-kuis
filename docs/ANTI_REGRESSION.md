# Anti-Regresi - Ruang Kuis

File ini berisi daftar fitur penting yang **tidak boleh rusak** saat melakukan perubahan kode.
Gunakan checklist ini sebelum menganggap suatu perubahan selesai.

Tujuan: Mencegah regresi (fitur yang sebelumnya sudah jalan tiba-tiba rusak).

---

## Checklist Umum (selalu dicek)

- [ ] Aplikasi bisa dibuka tanpa error di browser (`npm run dev`)
- [ ] Tidak ada error di Console browser (F12 → Console)
- [ ] Tampilan tidak rusak di desktop dan mobile (responsive)
- [ ] `git pull` berhasil tanpa konflik besar

---

## Fitur yang Harus Tetap Berfungsi

### 1. Halaman Login Admin
- [ ] Form login muncul dengan baik di `/login`
- [ ] Validasi email & password bekerja
- [ ] Login berhasil mengarahkan ke `/dashboard`
- [ ] Login gagal menampilkan pesan error yang jelas
- [ ] User yang sudah login tidak bisa mengakses `/login` lagi (redirect ke dashboard)

### 2. Dashboard Admin
- [ ] Halaman `/dashboard` hanya bisa diakses setelah login
- [ ] Tombol **Logout** berfungsi dan mengarahkan ke `/login`
- [ ] Tombol **Tambah Soal** mengarah ke `/questions`
- [ ] User yang belum login dilempar ke `/login` jika membuka `/dashboard`

### 3. Halaman Kelola Soal (`/questions`)
- [ ] Daftar soal muncul dari Firestore
- [ ] Tombol **+ Tambah Soal** membuka form
- [ ] Form tambah soal berhasil menyimpan ke Firestore
- [ ] Tombol **Edit** mengisi form dengan data soal yang dipilih
- [ ] Tombol **Update Soal** berhasil mengubah data di Firestore
- [ ] Tombol **Hapus** berhasil menghapus soal (dengan konfirmasi)
- [ ] Tombol **Import Soal** menerima file `.json`, `.csv`, `.xlsx`
- [ ] Import berhasil menambahkan soal ke Firestore dan refresh daftar
- [ ] Navigasi “← Dashboard” kembali ke halaman dashboard

### 4. Firebase Connection
- [ ] Koneksi ke Firebase Authentication berhasil
- [ ] Koneksi ke Firestore berhasil
- [ ] Auth state (login/logout) terdeteksi dengan benar di seluruh aplikasi
- [ ] Data soal tersimpan di collection `questions`

### 5. Routing & Proteksi
- [ ] `/` redirect ke `/dashboard` (jika login) atau `/login` (jika belum)
- [ ] `/questions` dilindungi (hanya user login)
- [ ] Tidak ada halaman 404 untuk route yang sudah didefinisikan

---

## Cara Menggunakan File Ini

1. Sebelum commit / push perubahan besar, buka file ini.
2. Cek ulang checklist yang relevan.
3. Jika ada yang rusak, perbaiki dulu sebelum lanjut.
4. Tambahkan checklist baru jika ada fitur baru yang penting.

---

*Update terakhir: 2026-10-03*
