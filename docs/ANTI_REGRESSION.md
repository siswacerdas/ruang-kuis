# Anti-Regresi - Ruang Kuis

File ini berisi daftar fitur penting yang **tidak boleh rusak** saat melakukan perubahan kode.
Gunakan checklist ini sebelum menganggap suatu perubahan selesai.

Tujuan: Mencegah regresi (fitur yang sebelumnya sudah jalan tiba-tiba rusak).

---

## Checklist Umum (selalu dicek)

- [ ] Aplikasi bisa dibuka tanpa error di browser
- [ ] Tidak ada error di Console browser (F12 → Console)
- [ ] Tampilan tidak rusak di desktop dan mobile (responsive)

---

## Fitur yang Harus Tetap Berfungsi

### 1. Halaman Login Admin (belum dibuat)
- [ ] Form login muncul dengan baik
- [ ] Validasi email & password bekerja
- [ ] Login berhasil mengarahkan ke dashboard admin
- [ ] Login gagal menampilkan pesan error yang jelas
- [ ] Logout berfungsi dengan baik

### 2. Navigasi Dasar (nanti)
- [ ] Link antar halaman tidak error (404)
- [ ] Tombol kembali / navigasi berfungsi

### 3. Firebase Connection (nanti)
- [ ] Koneksi ke Firebase berhasil
- [ ] Auth state (login/logout) terdeteksi dengan benar

---

## Cara Menggunakan File Ini

1. Sebelum commit / push perubahan besar, buka file ini.
2. Cek ulang checklist yang relevan.
3. Jika ada yang rusak, perbaiki dulu sebelum lanjut.
4. Tambahkan checklist baru jika ada fitur baru yang penting.

---

*Update terakhir: 2026-10-02*
