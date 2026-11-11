# Monitoring BSU 2026: aturan proyek

- Balas dalam bahasa Indonesia.
- Repo GitHub: izzarsohib-spec/monitoring-bsu (private). Push hanya setelah menunjukkan berkas yang ikut dan atas permintaan user.
- Supabase project pengadaan (`vqcusagijiavaoljfrib`) dipakai bersama sistem pengadaan: semua objek proyek ini hanya di schema `monitoring_bsu_2026`; jangan mengubah tabel di `public`.
- Token Supabase diambil dari keystore lokal (`~\keystore\keys.ps1`, `key-get supabase -Show`). Jangan menulis token ke berkas, repo, atau chat. Jangan menulis ke secrets project tanpa izin user.
- Data peserta (nama, NIK, rekening) tidak boleh masuk repo; `data/` dan `supabase/*.csv` diabaikan git.
- Berkas pembanding lokasi: kolom B lokasi data acuan, C lokasi di form, D lokasi penerima BSU. Baris yang kolom C atau D-nya kosong diberi warna kuning, dan kolom itu dibiarkan kosong (jangan ditebak).
- Sumber jawaban Google Form: spreadsheet jawaban Form (ID disimpan di tabel `pengaturan` Supabase, kunci `sheet_id`; JANGAN ditulis di repo karena spreadsheet dibagikan lewat link dan berisi NIK) (tab "Form Responses 1"), terus bertambah; sinkron otomatis tiap 5 menit.
- Penerima BSU: `D:\BSU 2026\<wilayah>\<lokasi>\template_koreksi_*.xlsx` (sheet `update_data_koreksi`). Folder bertanda "(TIDAK)" = lokasi tidak menerima BSU.
- Tampilan (Monitoring dan Administrator) mengikuti halaman Monitoring pengisian seragam: `tema.css` + `tema-terang.css` disalin dari `ukuran-pekerja\docs` (kartu putih, garis #DCE3EC, sudut 16px, sidebar navy); halaman Kelola anggota memakai kelas yang sama ditambah `docs/anggota.css`. Prototipe `web-baru` yang lama sudah ditinggalkan karena dinilai jelek.
- Pencocokan orang memakai NIK sebagai kunci utama (`peserta_sensitif.nik` data acuan, `form_sensitif.nik` jawaban Form, `bsu_sensitif.nik` penerima BSU); nama hanya cadangan bila NIK kosong atau bukan 16 angka, dan hasil cadangan itu masuk antrean "Perlu dicek".
- Data acuan (master) berasal dari file BPJS Ketenagakerjaan + PDF F2A (`D:\f2a`, rekap `D:\f2a\Rekap NIK.xlsx`: nama, lokasi, nik); lokasi acuan = nama di sheet MENU file BPJS.
- Data acuan lama sudah dihapus dari Supabase (11 Nov 2026); cadangan lokal di `data/cadangan-acuan-2026-11-11/`.
- Halaman Administrator = "Kelola anggota" (`docs/admin.html`): tambah/hapus anggota manual di (1) data Google Form (nama, lokasi, HP, rekening, nama pemilik rekening; NIK opsional) dan (2) data master (nama, lokasi, NIK). Fungsi server di `supabase/009-kelola-anggota.sql`, hanya admin. Anggota Form manual berkunci `manual:...` agar sinkron tidak menandainya hilang. Halaman lama (tujuh tab) dan "Perlu tindakan" dihapus atas permintaan user (11 Nov 2026), masih ada di riwayat git (commit 75c4fda) dan fungsinya di `supabase/008`.
