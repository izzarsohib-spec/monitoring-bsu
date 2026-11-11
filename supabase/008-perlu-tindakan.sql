-- Halaman admin "Perlu tindakan": daftar ketidakcocokan Form / BSU terhadap data acuan, digabung per orang (kunci = NIK),
-- dan fungsi tindakannya. Semua hanya untuk admin (is_admin()).

-- ---------- daftar ----------
create or replace view monitoring_bsu_2026.v_perlu_tindakan as
with f as (
  select 'form'::text sumber, a.id, a.nik_kunci, a.nama, a.lokasi_form as teks, a.waktu, a.cocok, a.lokasi_id
  from monitoring_bsu_2026.v_jawaban_aktif a
  where not a.dikunci and a.cocok in ('cek','tidak_ada','lokasi_belum')),
b as (
  select 'bsu'::text, p.id, p.nik_kunci, p.nama, p.folder, null::timestamptz, p.cocok, p.lokasi_id
  from monitoring_bsu_2026.bsu_penerima p
  where not p.dibatalkan and not p.dikunci and p.cocok in ('cek','tidak_ada','lokasi_belum')),
u as (select * from f union all select * from b),
g as (
  select coalesce(nik_kunci, sumber || ':' || id) as kunci,
         (array_agg(nama order by (sumber = 'form') desc, id))[1] as nama,
         max(id) filter (where sumber = 'form') as jawaban_id,
         max(id) filter (where sumber = 'bsu') as bsu_id,
         max(teks) filter (where sumber = 'form') as lokasi_form,
         max(teks) filter (where sumber = 'bsu') as folder_bsu,
         max(waktu) as waktu_form,
         bool_or(sumber = 'form') as ada_form, bool_or(sumber = 'bsu') as ada_bsu,
         min(lokasi_id) as lokasi_id,
         case when min(nik_kunci) is null and bool_or(cocok = 'lokasi_belum') then 'lokasi_belum'
              when min(nik_kunci) is null then 'tanpa_nik'
              when bool_or(cocok = 'cek') then 'nik_ganda'
              else 'nik_tidak_ada' end as masalah
  from u group by 1),
-- NIK cocok tetapi lokasi di Form/BSU berbeda dari lokasi di data acuan
bl as (
  select 'form'::text sumber, j.id, j.peserta_id, a.waktu, j.lokasi_form as teks
  from monitoring_bsu_2026.v_jawaban_aktif a join monitoring_bsu_2026.form_jawaban j on j.id = a.id
  where j.beda_lokasi and not j.dikunci and j.peserta_id is not null
  union all
  select 'bsu', p.id, p.peserta_id, null::timestamptz, p.folder
  from monitoring_bsu_2026.bsu_penerima p
  where p.beda_lokasi and not p.dibatalkan and not p.dikunci and p.peserta_id is not null),
gb as (
  select 'pl:' || peserta_id as kunci, peserta_id,
         max(id) filter (where sumber = 'form') as jawaban_id, max(id) filter (where sumber = 'bsu') as bsu_id,
         max(teks) filter (where sumber = 'form') as lokasi_form, max(teks) filter (where sumber = 'bsu') as folder_bsu,
         max(waktu) as waktu_form, bool_or(sumber = 'form') as ada_form, bool_or(sumber = 'bsu') as ada_bsu
  from bl group by peserta_id)
select g.kunci, g.masalah, g.nama, g.jawaban_id, g.bsu_id, g.lokasi_form, g.folder_bsu, g.waktu_form, g.ada_form, g.ada_bsu,
       g.lokasi_id, l.nama as lokasi_nama, null::integer as peserta_id, null::text as peserta_nama,
       null::integer as lokasi_form_id
from g left join monitoring_bsu_2026.lokasi l on l.id = g.lokasi_id
union all
select gb.kunci, 'beda_lokasi', p.nama, gb.jawaban_id, gb.bsu_id, gb.lokasi_form, gb.folder_bsu, gb.waktu_form, gb.ada_form, gb.ada_bsu,
       p.lokasi_id, la.nama, gb.peserta_id, p.nama,
       (select min(m.lokasi_id) from monitoring_bsu_2026.pemetaan_lokasi m
         where (gb.lokasi_form is not null and upper(btrim(m.nama_form)) = upper(btrim(gb.lokasi_form))) or (gb.folder_bsu is not null and m.folder_bsu = gb.folder_bsu))
from gb join monitoring_bsu_2026.peserta p on p.id = gb.peserta_id left join monitoring_bsu_2026.lokasi la on la.id = p.lokasi_id;

-- tampilan di atas dibungkus pemeriksaan admin (tampilan berjalan sebagai pemilik, jadi RLS tidak berlaku)
create or replace view monitoring_bsu_2026.v_perlu_tindakan_admin as
select t.*, lf.nama as lokasi_form_nama
from monitoring_bsu_2026.v_perlu_tindakan t
left join monitoring_bsu_2026.lokasi lf on lf.id = t.lokasi_form_id
where monitoring_bsu_2026.is_admin();
revoke all on monitoring_bsu_2026.v_perlu_tindakan from anon, authenticated, public;
revoke all on monitoring_bsu_2026.v_perlu_tindakan_admin from anon, public;
grant select on monitoring_bsu_2026.v_perlu_tindakan_admin to authenticated;

-- ---------- tindakan ----------
-- semua baris milik satu "orang": dicari lewat NIK (hash) bila ada, selain itu hanya baris yang disebut
create or replace function monitoring_bsu_2026._baris_orang(p_jawaban bigint, p_bsu bigint, out jid bigint[], out bid bigint[])
language plpgsql stable security definer set search_path = monitoring_bsu_2026, public as $$
declare k text;
begin
  select nik_kunci into k from form_jawaban where id = p_jawaban;
  if k is null then select nik_kunci into k from bsu_penerima where id = p_bsu; end if;
  if k is not null then
    jid := array(select id from form_jawaban where nik_kunci = k and not dibatalkan and not hilang);
    bid := array(select id from bsu_penerima where nik_kunci = k and not dibatalkan);
  else
    jid := case when p_jawaban is null then '{}'::bigint[] else array[p_jawaban] end;
    bid := case when p_bsu is null then '{}'::bigint[] else array[p_bsu] end;
  end if;
end $$;

-- 1) orang ini sudah ada di acuan: pasangkan
create or replace function monitoring_bsu_2026.pasangkan_orang(p_jawaban bigint, p_bsu bigint, p_peserta integer) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare r record; lid integer;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  select lokasi_id into lid from peserta where id = p_peserta;
  if lid is null then raise exception 'Peserta acuan tidak ditemukan'; end if;
  select * into r from _baris_orang(p_jawaban, p_bsu);
  update form_jawaban set peserta_id = p_peserta, lokasi_id = lid, cocok = 'manual', skor = 1, dikunci = true, beda_lokasi = false, diperbarui = now() where id = any (r.jid);
  update bsu_penerima set peserta_id = p_peserta, lokasi_id = lid, cocok = 'manual', skor = 1, dikunci = true, beda_lokasi = false, diperbarui = now() where id = any (r.bid);
end $$;

-- 2) orang baru: tambahkan ke acuan (NIK diambil di server dari data Form/BSU) lalu pasangkan
create or replace function monitoring_bsu_2026.tambah_ke_acuan(p_jawaban bigint, p_bsu bigint, p_nama text, p_lokasi integer) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare v_nik text; v_id integer; r record; v_nama text := btrim(coalesce(p_nama, ''));
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if v_nama = '' then raise exception 'Nama tidak boleh kosong'; end if;
  if not exists (select 1 from lokasi where id = p_lokasi) then raise exception 'Pilih lokasi acuan'; end if;
  select regexp_replace(coalesce(
           (select nik from form_sensitif where jawaban_id = p_jawaban),
           (select nik from bsu_sensitif where penerima_id = p_bsu), ''), '\D', '', 'g') into v_nik;
  if v_nik !~ '^\d{16}$' then raise exception 'NIK harus 16 angka, tidak bisa ditambahkan'; end if;
  if exists (select 1 from peserta_sensitif where nik = v_nik) then raise exception 'NIK ini sudah ada di data acuan; gunakan "Orang ini sudah ada di acuan"'; end if;
  insert into peserta (nama, lokasi_id) values (v_nama, p_lokasi) returning id into v_id;
  insert into peserta_sensitif (peserta_id, nik) values (v_id, v_nik);
  select * into r from _baris_orang(p_jawaban, p_bsu);
  update form_jawaban set peserta_id = v_id, lokasi_id = p_lokasi, cocok = 'manual', skor = 1, dikunci = true, beda_lokasi = false, diperbarui = now() where id = any (r.jid);
  update bsu_penerima set peserta_id = v_id, lokasi_id = p_lokasi, cocok = 'manual', skor = 1, dikunci = true, beda_lokasi = false, diperbarui = now() where id = any (r.bid);
  return v_id;
end $$;

-- 3) bukan peserta: abaikan (tidak muncul lagi di daftar)
create or replace function monitoring_bsu_2026.abaikan_orang(p_jawaban bigint, p_bsu bigint) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare r record;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  select * into r from _baris_orang(p_jawaban, p_bsu);
  update form_jawaban set peserta_id = null, cocok = 'tidak_ada', dikunci = true, diperbarui = now() where id = any (r.jid);
  update bsu_penerima set peserta_id = null, cocok = 'tidak_ada', dikunci = true, diperbarui = now() where id = any (r.bid);
end $$;

-- 4) lokasi di Form belum dipetakan: petakan ke lokasi acuan, lalu cocokkan ulang
create or replace function monitoring_bsu_2026.petakan_lokasi_form(p_nama_form text, p_lokasi integer) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare v text := btrim(coalesce(p_nama_form, '')); lama text; n integer;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if v = '' then raise exception 'Nama lokasi di Form kosong'; end if;
  if not exists (select 1 from lokasi where id = p_lokasi) then raise exception 'Pilih lokasi acuan'; end if;
  select nama_form into lama from pemetaan_lokasi where lokasi_id = p_lokasi;
  if not found then insert into pemetaan_lokasi (lokasi_id, nama_form) values (p_lokasi, v);
  elsif lama is null or btrim(lama) = '' then update pemetaan_lokasi set nama_form = v, status_form = 'ok' where lokasi_id = p_lokasi;
  elsif upper(btrim(lama)) <> upper(v) then raise exception 'Lokasi acuan ini sudah punya nama Form lain (%). Ubah di data lokasi.', lama;
  end if;
  update form_jawaban set cocok = 'baru', peserta_id = null, dikunci = false
   where upper(btrim(lokasi_form)) = upper(v) and not dikunci and cocok in ('lokasi_belum', 'cek', 'tidak_ada');
  get diagnostics n = row_count;
  perform cocokkan_jawaban(null, 2000);
  return n;
end $$;

-- 5) NIK cocok tetapi lokasi berbeda: lokasi acuan sudah benar / pindahkan peserta ke lokasi Form
create or replace function monitoring_bsu_2026.tandai_lokasi_benar(p_jawaban bigint, p_bsu bigint) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare r record;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  select * into r from _baris_orang(p_jawaban, p_bsu);
  update form_jawaban set beda_lokasi = false, dikunci = true, diperbarui = now() where id = any (r.jid) and beda_lokasi;
  update bsu_penerima set beda_lokasi = false, dikunci = true, diperbarui = now() where id = any (r.bid) and beda_lokasi;
end $$;

create or replace function monitoring_bsu_2026.pindah_lokasi_peserta(p_peserta integer, p_lokasi integer) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if not exists (select 1 from lokasi where id = p_lokasi) then raise exception 'Lokasi tidak ditemukan'; end if;
  update peserta set lokasi_id = p_lokasi where id = p_peserta;
  update form_jawaban set lokasi_id = p_lokasi, beda_lokasi = false, dikunci = true, diperbarui = now() where peserta_id = p_peserta and beda_lokasi;
  update bsu_penerima set lokasi_id = p_lokasi, beda_lokasi = false, dikunci = true, diperbarui = now() where peserta_id = p_peserta and beda_lokasi;
end $$;

revoke all on function monitoring_bsu_2026._baris_orang(bigint, bigint) from public, anon, authenticated;
revoke all on function monitoring_bsu_2026.pasangkan_orang(bigint, bigint, integer) from public, anon;
revoke all on function monitoring_bsu_2026.tambah_ke_acuan(bigint, bigint, text, integer) from public, anon;
revoke all on function monitoring_bsu_2026.abaikan_orang(bigint, bigint) from public, anon;
revoke all on function monitoring_bsu_2026.petakan_lokasi_form(text, integer) from public, anon;
revoke all on function monitoring_bsu_2026.tandai_lokasi_benar(bigint, bigint) from public, anon;
revoke all on function monitoring_bsu_2026.pindah_lokasi_peserta(integer, integer) from public, anon;
grant execute on function monitoring_bsu_2026.pasangkan_orang(bigint, bigint, integer), monitoring_bsu_2026.tambah_ke_acuan(bigint, bigint, text, integer),
  monitoring_bsu_2026.abaikan_orang(bigint, bigint), monitoring_bsu_2026.petakan_lokasi_form(text, integer),
  monitoring_bsu_2026.tandai_lokasi_benar(bigint, bigint), monitoring_bsu_2026.pindah_lokasi_peserta(integer, integer) to authenticated;
