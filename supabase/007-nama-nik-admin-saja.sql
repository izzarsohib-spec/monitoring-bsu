-- Nama dan NIK peserta hanya terbuka untuk ADMIN yang login (operator tidak lagi bisa melihat nama).
-- is_staff() dipakai oleh semua tampilan v_*_staff dan kebijakan baca (peserta, form_jawaban, bsu_penerima, dst.),
-- jadi cukup satu fungsi yang diperketat. NIK sudah khusus admin lewat is_admin() pada tabel *_sensitif.
create or replace function monitoring_bsu_2026.is_staff() returns boolean
language sql stable security definer set search_path = monitoring_bsu_2026, public as $$
  select exists (select 1 from monitoring_bsu_2026.bsu_admin a
                 where a.aktif and a.peran = 'admin' and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')))
$$;

-- Akun admin pertama: ganti <EMAIL-ADMIN> dengan email akun Supabase Auth yang sudah terdaftar (jangan menulis email asli di repo).
insert into monitoring_bsu_2026.bsu_admin (email, nama, peran, aktif)
select '<EMAIL-ADMIN>', 'Admin', 'admin', true
where not exists (select 1 from monitoring_bsu_2026.bsu_admin where lower(email) = '<EMAIL-ADMIN>');
