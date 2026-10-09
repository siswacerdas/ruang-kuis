# Hemat bacaan Firestore — Tahap 2

Perubahan (semua punya cadangan ke cara lama bila agregasi gagal):
- Dashboard: jumlah pengerjaan, rata-rata skor, soal, paket, materi dihitung di server
  (`getAggregateFromServer` / `getCountFromServer`); 8 pengerjaan terbaru lewat query `limit(8)`.
  Kartu "Siswa unik" diganti "Siswa" = siswa aktif terdaftar (bukan nama unik dari semua pengerjaan).
- Bank Soal & Subjek/Topik: jumlah soal/materi dihitung per mapel/materi di server.
- Header admin: satu listener bersama (tidak per halaman), difilter `status == pending` dan `read == false`,
  ditahan 60 dtk saat pindah halaman.
- Input Nilai: hapus penilaian membaca hanya nilai miliknya; buka nilai membaca penilaian ini + yang sama mapel.

Daftar uji (akun guru):
1. Dashboard: angka muncul, 8 pengerjaan terbaru benar, kartu Siswa menuju Daftar Siswa.
2. Bank Soal: jumlah materi & soal per mapel sama dengan sebelumnya. Buka satu mapel: jumlah soal per materi sama.
3. Pindah-pindah halaman admin: badge pengajuan ortu & lonceng tetap benar; ajukan akun ortu uji → badge bertambah.
4. Input Nilai: buka penilaian, ubah & simpan nilai; (opsional) catatan AI tetap memakai penilaian lain.
5. Pantau Firebase Console → Firestore → Usage: bacaan per hari harus turun.
Rollback: `git revert` commit tahap 2 lalu deploy hosting.
