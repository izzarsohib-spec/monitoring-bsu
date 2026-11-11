-- Kelola anggota manual: data master (nama, lokasi, NIK) dan data Google Form (nama, lokasi, HP, rekening).
-- Semua fungsi hanya untuk admin. Anggota Form manual memakai kunci 'manual:...' supaya sinkron tidak menandainya "hilang".

create or replace function monitoring_bsu_2026.tambah_anggota_master(p_nama text, p_lokasi integer, p_nik text) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare v_nik text := regexp_replace(coalesce(p_nik, ''), '\s', '', 'g'); v_nama text := btrim(coalesce(p_nama, '')); v_id integer; r record;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if v_nama = '' then raise exception 'Nama tidak boleh kosong'; end if;
  if not exists (select 1 from lokasi where id = p_lokasi) then raise exception 'Pilih lokasi'; end if;
  if v_nik !~ '^\d{16}$' then raise exception 'NIK harus 16 angka'; end if;
  select p.nama, l.nama as lok into r from peserta_sensitif s join peserta p on p.id = s.peserta_id join lokasi l on l.id = p.lokasi_id where s.nik = v_nik limit 1;
  if found then raise exception 'NIK ini sudah terdaftar atas nama % (%)', r.nama, r.lok; end if;
  insert into peserta (nama, lokasi_id) values (v_nama, p_lokasi) returning id into v_id;
  insert into peserta_sensitif (peserta_id, nik) values (v_id, v_nik);
  -- jawaban Form / data BSU dengan NIK yang sama yang tadinya belum cocok dicocokkan ulang
  update form_jawaban set cocok = 'baru' where nik_kunci = kunci_nik(v_nik) and peserta_id is null and not dikunci and not dibatalkan;
  update bsu_penerima set cocok = 'baru' where nik_kunci = kunci_nik(v_nik) and peserta_id is null and not dikunci and not dibatalkan;
  perform cocokkan_jawaban(null, 2000);
  perform cocokkan_bsu(null, 2000);
  return v_id;
end $$;

create or replace function monitoring_bsu_2026.hapus_anggota_master(p_peserta integer) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if not exists (select 1 from peserta where id = p_peserta) then raise exception 'Anggota tidak ditemukan'; end if;
  update form_jawaban set peserta_id = null, cocok = 'baru', dikunci = false, beda_lokasi = false where peserta_id = p_peserta;
  update bsu_penerima set peserta_id = null, cocok = 'baru', dikunci = false, beda_lokasi = false where peserta_id = p_peserta;
  delete from peserta where id = p_peserta;
  perform cocokkan_jawaban(null, 5000);
  perform cocokkan_bsu(null, 5000);
end $$;

create or replace function monitoring_bsu_2026.tambah_anggota_form(p_nama text, p_lokasi integer, p_nik text, p_hp text, p_no_rek text, p_nama_rek text) returns jsonb
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare v_nik text := regexp_replace(coalesce(p_nik, ''), '\s', '', 'g'); v_nama text := btrim(coalesce(p_nama, '')); v_lok text; v_id bigint; v_pid integer; v_n integer; v_ada timestamptz; v_cocok text; v_pnama text;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if v_nama = '' then raise exception 'Nama tidak boleh kosong'; end if;
  select coalesce(nullif(btrim(m.nama_form), ''), l.nama) into v_lok from lokasi l left join pemetaan_lokasi m on m.lokasi_id = l.id where l.id = p_lokasi;
  if v_lok is null then raise exception 'Pilih lokasi'; end if;
  if v_nik <> '' and v_nik !~ '^\d{16}$' then raise exception 'NIK harus 16 angka, atau dikosongkan'; end if;
  if v_nik <> '' then
    select max(waktu) into v_ada from form_jawaban where nik_kunci = kunci_nik(v_nik) and not dibatalkan and not hilang;
    if v_ada is not null then raise exception 'NIK ini sudah ada di data Google Form (diisi %)', to_char(v_ada at time zone 'Asia/Jakarta', 'DD-MM-YYYY'); end if;
  end if;
  insert into form_jawaban (kunci, waktu, lokasi_form, nama, nik_kunci, cocok)
    values ('manual:' || gen_random_uuid()::text, now(), v_lok, v_nama, kunci_nik(v_nik), 'baru') returning id into v_id;
  insert into form_sensitif (jawaban_id, nik, no_rek, nama_rek, hp)
    values (v_id, nullif(v_nik, ''), nullif(btrim(coalesce(p_no_rek, '')), ''), nullif(btrim(coalesce(p_nama_rek, '')), ''), nullif(btrim(coalesce(p_hp, '')), ''));
  if v_nik <> '' then
    perform cocokkan_jawaban(v_id, 1);
  else
    -- tanpa NIK: tautkan bila nama persis sama dan hanya satu di lokasi yang dipilih
    select count(*), min(id) into v_n, v_pid from peserta where lokasi_id = p_lokasi and aktif and nama_n = norm_nama(v_nama);
    if v_n = 1 then
      update form_jawaban set peserta_id = v_pid, lokasi_id = p_lokasi, cocok = 'manual', skor = 1, dikunci = true where id = v_id;
    end if;
  end if;
  select f.cocok, p.nama into v_cocok, v_pnama from form_jawaban f left join peserta p on p.id = f.peserta_id where f.id = v_id;
  return jsonb_build_object('id', v_id, 'tertaut', v_pnama is not null, 'cocok', v_cocok, 'peserta', v_pnama);
end $$;

create or replace function monitoring_bsu_2026.hapus_anggota_form(p_jawaban bigint) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  update form_jawaban set dibatalkan = true, dikunci = true, diperbarui = now() where id = p_jawaban;
  if not found then raise exception 'Data tidak ditemukan'; end if;
end $$;

revoke all on function monitoring_bsu_2026.tambah_anggota_master(text, integer, text), monitoring_bsu_2026.hapus_anggota_master(integer),
  monitoring_bsu_2026.tambah_anggota_form(text, integer, text, text, text, text), monitoring_bsu_2026.hapus_anggota_form(bigint) from public, anon;
grant execute on function monitoring_bsu_2026.tambah_anggota_master(text, integer, text), monitoring_bsu_2026.hapus_anggota_master(integer),
  monitoring_bsu_2026.tambah_anggota_form(text, integer, text, text, text, text), monitoring_bsu_2026.hapus_anggota_form(bigint) to authenticated;

-- Sinkron: baris manual tidak ada di spreadsheet, jangan ditandai "hilang".
CREATE OR REPLACE FUNCTION monitoring_bsu_2026.terima_jawaban(p_rows jsonb, p_penuh boolean DEFAULT true, p_sumber text DEFAULT 'sinkron'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'monitoring_bsu_2026', 'extensions', 'public'
AS $function$
declare v_total int := jsonb_array_length(p_rows); v_baru int; v_berubah int; v_hilang int := 0;
begin
  create temp table _in on commit drop as
    select (e->>'kunci') kunci, nullif(e->>'waktu','')::timestamptz waktu, btrim(e->>'lokasi_form') lokasi_form,
           btrim(e->>'nama') nama, e->>'nik' nik, e->>'bank' bank, e->>'no_rek' no_rek, e->>'nama_rek' nama_rek, e->>'hp' hp
    from jsonb_array_elements(p_rows) e;
  select count(*) into v_baru from _in i where not exists (select 1 from form_jawaban f where f.kunci = i.kunci);
  select count(*) into v_berubah from _in i join form_jawaban f on f.kunci = i.kunci
    where not f.dikunci and (f.nama is distinct from i.nama or f.lokasi_form is distinct from i.lokasi_form or f.hilang);
  insert into form_jawaban (kunci, waktu, lokasi_form, nama, nik_kunci)
    select kunci, waktu, lokasi_form, nama, kunci_nik(nik) from _in
  on conflict (kunci) do update set
    waktu = excluded.waktu,
    lokasi_form = case when form_jawaban.dikunci then form_jawaban.lokasi_form else excluded.lokasi_form end,
    nama = case when form_jawaban.dikunci then form_jawaban.nama else excluded.nama end,
    nik_kunci = excluded.nik_kunci,
    hilang = false,
    cocok = case when not form_jawaban.dikunci and (form_jawaban.nama is distinct from excluded.nama or form_jawaban.lokasi_form is distinct from excluded.lokasi_form) then 'baru' else form_jawaban.cocok end,
    diperbarui = now();
  insert into form_sensitif (jawaban_id, nik, bank, no_rek, nama_rek, hp)
    select f.id, i.nik, i.bank, i.no_rek, i.nama_rek, i.hp from _in i join form_jawaban f on f.kunci = i.kunci
  on conflict (jawaban_id) do update set nik = excluded.nik, bank = excluded.bank, no_rek = excluded.no_rek,
    nama_rek = excluded.nama_rek, hp = excluded.hp;
  if p_penuh and v_total > 0 then
    update form_jawaban f set hilang = true, diperbarui = now()
      where not f.hilang and f.kunci not like 'manual:%' and not exists (select 1 from _in i where i.kunci = f.kunci);
    get diagnostics v_hilang = row_count;
  end if;
  insert into sinkron_log (sumber, baris, baru, berubah, hilang) values (p_sumber, v_total, v_baru, v_berubah, v_hilang);
  return jsonb_build_object('baris', v_total, 'baru', v_baru, 'berubah', v_berubah, 'hilang', v_hilang);
end $function$;
