# Monitoring BSU 2026

Web untuk memantau siapa yang sudah dan belum mengisi Google Form data penerima Bantuan Subsidi Upah (BSU), dengan halaman administrator untuk mengedit data master.

- **Tahap 1 (jalan):** data acuan (3.709 peserta di 262 lokasi) dicocokkan dengan jawaban Google Form, lalu hasilnya dipantau per lokasi.
- **Tahap 2 (belum):** mencocokkan dengan daftar penerima BSU dan mengirim hasilnya lewat WhatsApp. Data penerima BSU sudah tersimpan, tetapi pengirimannya belum dibuat.

## Susunan

```
docs/       situs statis (HTML, CSS, JS murni; tanpa build), dilayani GitHub Pages
supabase/   skema database, fungsi sinkron, jadwal
```

Semua data ada di Supabase, schema `monitoring_bsu_2026` (terpisah dari tabel lain di `public`).

| Tabel / tampilan | Isi |
|---|---|
| `lokasi`, `peserta` | Data acuan (master) |
| `pemetaan_lokasi` | Nama lokasi acuan ↔ nama di Google Form ↔ nama folder BSU, plus status khusus |
| `form_jawaban`, `form_sensitif` | Jawaban Google Form. NIK, rekening, HP ada di `form_sensitif` (khusus admin) |
| `bsu_penerima`, `bsu_sensitif` | Daftar penerima BSU. NIK dan KPJ ada di `bsu_sensitif` (khusus admin) |
| `bsu_admin` | Daftar akun staf dan perannya (`admin` / `operator`) |
| `v_progres_lokasi` | Ringkasan per lokasi, **tanpa nama**; satu-satunya data yang terbuka tanpa login |
| `v_peserta_staff`, `v_jawaban_staff`, `v_bsu_staff` | Daftar dengan nama, hanya untuk staf yang login |

## Hak akses

| Pengguna | Bisa |
|---|---|
| Tanpa login | Melihat ringkasan jumlah per lokasi |
| Admin | Melihat nama peserta, menambah dan menghapus anggota di data Google Form dan data master (halaman Kelola anggota) |

Akses dijaga Row Level Security di database, bukan hanya di tampilan. Kunci `anon` di `docs/config.js` memang dirancang terlihat di browser.

## Sinkron Google Form

Fungsi `supabase/functions/sinkron-form` membaca spreadsheet jawaban (harus dibagikan "siapa saja dengan link") dan menyimpan ke `form_jawaban`. Dijalankan:

- otomatis tiap 5 menit oleh `pg_cron` (lihat `supabase/004-jadwal-sinkron.sql`);
- manual lewat tombol **Sinkron sekarang** di Administrator → Sinkron & pengguna.

Aturan sinkron:

- Kunci baris = waktu + NIK + nama (stempel waktu CSV tanpa milidetik dan ada yang kembar).
- Satu orang yang mengisi berkali-kali dihitung satu (jawaban terbaru, berdasarkan NIK; bila NIK tidak valid, berdasarkan nama dan lokasi).
- Baris yang hilang dari spreadsheet ditandai `hilang`, tidak dihapus.
- Baris yang diedit atau dipilihkan pasangannya oleh admin **dikunci**: sinkron berikutnya tidak menimpanya.

## Pencocokan nama

Dilakukan di dalam lokasi yang sama (fungsi `cocokkan_jawaban`, `cocokkan_bsu`): nama dinormalisasi (huruf besar, tanpa tanda baca dan gelar), lalu dihitung kemiripannya (jarak Levenshtein, termasuk urutan kata yang tertukar).

| Hasil | Syarat |
|---|---|
| `persis` | Sama persis dan hanya satu kandidat |
| `mirip` | Kemiripan ≥ 88% dan unggul ≥ 5 poin dari kandidat kedua |
| `cek` | Tidak memenuhi di atas: masuk antrean **Perlu dicek** |
| `tidak_ada` | Lokasi terpetakan tetapi tidak ada kandidat |
| `lokasi_belum` | Nama lokasi di form belum ada di pemetaan |
| `manual` | Dipilih admin |

## Menjalankan di komputer

```
cd web
python -m http.server 8765
```

Lalu buka http://localhost:8765. Situs ini statis, jadi bisa dipasang di hosting statis mana pun.

## Memasang ulang ke project Supabase lain

1. Jalankan `supabase/001-skema.sql` sampai `007-…` berurutan di SQL Editor (ID spreadsheet jawaban Form diisi di tabel `pengaturan`, kunci `sheet_id`; jangan ditulis di repo).
2. Tambahkan schema `monitoring_bsu_2026` ke **Settings → API → Exposed schemas**.
3. Deploy `supabase/functions/sinkron-form` (tanpa verifikasi JWT; izin diperiksa di dalam fungsi), isi token di tabel `rahasia`, lalu jalankan `004-jadwal-sinkron.sql`.
4. Buat akun di Authentication dan daftarkan emailnya di tabel `bsu_admin`.
5. Isi `docs/config.js` dengan URL dan kunci `anon` project.
6. Muat data acuan, pemetaan lokasi, dan daftar penerima BSU.

## Catatan data pribadi

Repo ini tidak berisi data peserta. Folder `data/` dan berkas CSV/Excel diabaikan oleh `.gitignore`. Jangan menaruh NIK, nomor rekening, atau kunci rahasia di repo.
