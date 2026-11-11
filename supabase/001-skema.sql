-- Monitoring BSU 2026: skema lengkap (jalankan sekali; aman diulang).
-- Semua objek ada di schema monitoring_bsu_2026, terpisah dari tabel pengadaan di public.
create extension if not exists fuzzystrmatch with schema extensions;

-- ===== tabel master =====
alter table monitoring_bsu_2026.lokasi
  add column if not exists wilayah text,
  add column if not exists aktif boolean not null default true,
  add column if not exists catatan text;
alter table monitoring_bsu_2026.peserta
  add column if not exists aktif boolean not null default true,
  add column if not exists catatan text,
  add column if not exists dibuat timestamptz not null default now();
create sequence if not exists monitoring_bsu_2026.lokasi_id_seq start 1000;
create sequence if not exists monitoring_bsu_2026.peserta_id_seq start 100000;
alter table monitoring_bsu_2026.lokasi alter column id set default nextval('monitoring_bsu_2026.lokasi_id_seq');
alter table monitoring_bsu_2026.peserta alter column id set default nextval('monitoring_bsu_2026.peserta_id_seq');

create table if not exists monitoring_bsu_2026.pemetaan_lokasi (
  lokasi_id int primary key references monitoring_bsu_2026.lokasi(id) on delete cascade,
  nama_form text,
  folder_bsu text,
  status_form text not null default 'ok' check (status_form in ('ok','tidak ada','tidak mengisi','ditangani produksi')),
  status_bsu text not null default 'ok' check (status_bsu in ('ok','tidak dapat','ditangani produksi')),
  catatan text
);
create index if not exists pemetaan_form_idx on monitoring_bsu_2026.pemetaan_lokasi (upper(btrim(nama_form)));
create index if not exists pemetaan_folder_idx on monitoring_bsu_2026.pemetaan_lokasi (folder_bsu);

-- jawaban Google Form (nama dan lokasi di sini; NIK, rekening, HP di tabel terpisah form_sensitif)
create table if not exists monitoring_bsu_2026.form_jawaban (
  id bigint generated always as identity primary key,
  kunci text not null unique,
  waktu timestamptz,
  lokasi_form text,
  nama text,
  nik_kunci text,
  lokasi_id int references monitoring_bsu_2026.lokasi(id) on delete set null,
  peserta_id int references monitoring_bsu_2026.peserta(id) on delete set null,
  cocok text not null default 'baru' check (cocok in ('baru','persis','mirip','cek','manual','tidak_ada','lokasi_belum')),
  skor real,
  dikunci boolean not null default false,
  dibatalkan boolean not null default false,
  hilang boolean not null default false,
  diperbarui timestamptz not null default now()
);
create index if not exists fj_peserta_idx on monitoring_bsu_2026.form_jawaban (peserta_id);
create index if not exists fj_lokasi_idx on monitoring_bsu_2026.form_jawaban (lokasi_id);
create index if not exists fj_nik_idx on monitoring_bsu_2026.form_jawaban (nik_kunci);
create table if not exists monitoring_bsu_2026.form_sensitif (
  jawaban_id bigint primary key references monitoring_bsu_2026.form_jawaban(id) on delete cascade,
  nik text, bank text, no_rek text, nama_rek text, hp text
);

-- penerima BSU dari D:\BSU 2026
create table if not exists monitoring_bsu_2026.bsu_penerima (
  id bigint generated always as identity primary key,
  kunci text not null unique,
  folder text,
  wilayah text,
  nama text,
  nik_kunci text,
  lokasi_id int references monitoring_bsu_2026.lokasi(id) on delete set null,
  peserta_id int references monitoring_bsu_2026.peserta(id) on delete set null,
  cocok text not null default 'baru' check (cocok in ('baru','persis','mirip','cek','manual','tidak_ada','lokasi_belum')),
  skor real,
  dikunci boolean not null default false,
  dibatalkan boolean not null default false,
  diperbarui timestamptz not null default now()
);
create index if not exists bp_peserta_idx on monitoring_bsu_2026.bsu_penerima (peserta_id);
create index if not exists bp_lokasi_idx on monitoring_bsu_2026.bsu_penerima (lokasi_id);
create index if not exists bp_nik_idx on monitoring_bsu_2026.bsu_penerima (nik_kunci);
create table if not exists monitoring_bsu_2026.bsu_sensitif (
  penerima_id bigint primary key references monitoring_bsu_2026.bsu_penerima(id) on delete cascade,
  nik text, kpj text
);

create table if not exists monitoring_bsu_2026.bsu_admin (
  email text primary key,
  nama text,
  peran text not null default 'operator' check (peran in ('admin','operator')),
  aktif boolean not null default true
);
create table if not exists monitoring_bsu_2026.pengaturan (
  kunci text primary key,
  nilai text
);
insert into monitoring_bsu_2026.pengaturan(kunci,nilai) values
  ('sheet_id','<ISI-DI-SUPABASE: ID spreadsheet jawaban Form>'),
  ('sheet_nama','Form Responses 1')
on conflict (kunci) do nothing;
create table if not exists monitoring_bsu_2026.sinkron_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  sumber text, baris int, baru int, berubah int, hilang int, cek int, galat text
);

-- ===== fungsi bantu =====
create or replace function monitoring_bsu_2026.is_staff() returns boolean
language sql stable security definer set search_path = monitoring_bsu_2026, public as $$
  select exists (select 1 from monitoring_bsu_2026.bsu_admin a
                 where a.aktif and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')))
$$;
create or replace function monitoring_bsu_2026.is_admin() returns boolean
language sql stable security definer set search_path = monitoring_bsu_2026, public as $$
  select exists (select 1 from monitoring_bsu_2026.bsu_admin a
                 where a.aktif and a.peran = 'admin' and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')))
$$;

create or replace function monitoring_bsu_2026.norm_nama(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(t,'')),'[^A-Z]+',' ','g'),
    '\m(S|SH|SE|SPD|SKOM|AMD|ST|DRS|DR|H|HJ|SKM|SSOS|SSI|MM|MH|MPD)\M',' ','g'),'\s+',' ','g'))
$$;
create or replace function monitoring_bsu_2026.urut_kata(t text) returns text
language sql immutable as $$
  select coalesce(string_agg(w,' ' order by w),'') from unnest(string_to_array(t,' ')) w
$$;
create or replace function monitoring_bsu_2026.sim(a text, b text) returns real
language sql immutable set search_path = monitoring_bsu_2026, extensions, public as $$
  select case when coalesce(a,'')='' or coalesce(b,'')='' then 0::real else greatest(
    1 - levenshtein(left(a,200),left(b,200))::real / greatest(length(left(a,200)),length(left(b,200))),
    1 - levenshtein(left(urut_kata(a),200),left(urut_kata(b),200))::real / greatest(length(left(a,200)),length(left(b,200)))
  )::real end
$$;
create or replace function monitoring_bsu_2026.kunci_nik(n text) returns text
language sql immutable as $$
  select case when regexp_replace(coalesce(n,''),'\D','','g') ~ '^\d{16}$'
              then md5('bsu2026|' || regexp_replace(n,'\D','','g')) end
$$;

-- ===== pencocokan nama (dalam lokasi yang sama) =====
create or replace function monitoring_bsu_2026.cocokkan_jawaban(p_id bigint default null) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nama, lokasi_form from form_jawaban
             where (p_id is null and not dikunci) or id = p_id),
  lm as (select j.id jid, m.lokasi_id from j
         join pemetaan_lokasi m on m.nama_form is not null and upper(btrim(m.nama_form)) = upper(btrim(j.lokasi_form))),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  c as (select lm.jid, p.id pid, p.lokasi_id lid, sim(norm_nama(j.nama), norm_nama(p.nama)) sk
        from lm join j on j.id = lm.jid join peserta p on p.lokasi_id = lm.lokasi_id and p.aktif),
  r as (select jid, pid, lid, sk,
               row_number() over w rn, lead(sk) over w sk2
        from c window w as (partition by jid order by sk desc, pid)),
  h as (select j.id,
          case when lc.jid is null then 'lokasi_belum'
               when r.pid is null then 'tidak_ada'
               when r.sk >= 0.999 and coalesce(r.sk2,0) < 0.999 then 'persis'
               when r.sk >= 0.88 and r.sk < 0.999 and r.sk - coalesce(r.sk2,0) >= 0.05 then 'mirip'
               else 'cek' end as cocok,
          r.pid, r.lid, r.sk, lc.n ln, lc.l ll
        from j left join lc on lc.jid = j.id left join r on r.jid = j.id and r.rn = 1)
  update form_jawaban f set
    cocok = h.cocok,
    peserta_id = case when h.cocok in ('persis','mirip') then h.pid end,
    lokasi_id = case when h.cocok in ('persis','mirip') then h.lid when h.ln = 1 then h.ll end,
    skor = h.sk, diperbarui = now()
  from h where f.id = h.id
    and (f.cocok is distinct from h.cocok or f.peserta_id is distinct from case when h.cocok in ('persis','mirip') then h.pid end
         or f.skor is distinct from h.sk or f.cocok = 'baru');
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function monitoring_bsu_2026.cocokkan_bsu(p_id bigint default null) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nama, folder from bsu_penerima where (p_id is null and not dikunci) or id = p_id),
  lm as (select j.id jid, m.lokasi_id from j join pemetaan_lokasi m on m.folder_bsu is not null and m.folder_bsu = j.folder),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  c as (select lm.jid, p.id pid, p.lokasi_id lid, sim(norm_nama(j.nama), norm_nama(p.nama)) sk
        from lm join j on j.id = lm.jid join peserta p on p.lokasi_id = lm.lokasi_id and p.aktif),
  r as (select jid, pid, lid, sk, row_number() over w rn, lead(sk) over w sk2
        from c window w as (partition by jid order by sk desc, pid)),
  h as (select j.id,
          case when lc.jid is null then 'lokasi_belum'
               when r.pid is null then 'tidak_ada'
               when r.sk >= 0.999 and coalesce(r.sk2,0) < 0.999 then 'persis'
               when r.sk >= 0.88 and r.sk < 0.999 and r.sk - coalesce(r.sk2,0) >= 0.05 then 'mirip'
               else 'cek' end as cocok,
          r.pid, r.lid, r.sk, lc.n ln, lc.l ll
        from j left join lc on lc.jid = j.id left join r on r.jid = j.id and r.rn = 1)
  update bsu_penerima f set
    cocok = h.cocok,
    peserta_id = case when h.cocok in ('persis','mirip') then h.pid end,
    lokasi_id = case when h.cocok in ('persis','mirip') then h.lid when h.ln = 1 then h.ll end,
    skor = h.sk, diperbarui = now()
  from h where f.id = h.id
    and (f.cocok is distinct from h.cocok or f.peserta_id is distinct from case when h.cocok in ('persis','mirip') then h.pid end
         or f.skor is distinct from h.sk or f.cocok = 'baru');
  get diagnostics n = row_count;
  return n;
end $$;

-- penerimaan data dari fungsi sinkron (hanya service_role)
create or replace function monitoring_bsu_2026.terima_jawaban(p_rows jsonb, p_penuh boolean default true, p_sumber text default 'sinkron')
returns jsonb language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare v_total int := jsonb_array_length(p_rows); v_baru int; v_berubah int; v_hilang int := 0; v_cek int;
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
      where not f.hilang and not exists (select 1 from _in i where i.kunci = f.kunci);
    get diagnostics v_hilang = row_count;
  end if;
  perform cocokkan_jawaban(null);
  select count(*) into v_cek from form_jawaban where not dibatalkan and not hilang and cocok in ('cek','tidak_ada','lokasi_belum');
  insert into sinkron_log (sumber, baris, baru, berubah, hilang, cek) values (p_sumber, v_total, v_baru, v_berubah, v_hilang, v_cek);
  return jsonb_build_object('baris', v_total, 'baru', v_baru, 'berubah', v_berubah, 'hilang', v_hilang, 'perlu_cek', v_cek);
end $$;

-- ===== tampilan untuk web =====
create or replace view monitoring_bsu_2026.v_jawaban_aktif as
  select distinct on (coalesce(j.nik_kunci, 'n:' || monitoring_bsu_2026.norm_nama(j.nama) || '|' || coalesce(j.lokasi_form,'')))
         j.*
  from monitoring_bsu_2026.form_jawaban j
  where not j.dibatalkan and not j.hilang
  order by coalesce(j.nik_kunci, 'n:' || monitoring_bsu_2026.norm_nama(j.nama) || '|' || coalesce(j.lokasi_form,'')),
           j.waktu desc nulls last, j.id desc;

-- ringkasan per lokasi: boleh dilihat tanpa login (tanpa nama orang)
create or replace view monitoring_bsu_2026.v_progres_lokasi as
  select l.id as lokasi_id, l.nama, l.wilayah, coalesce(m.status_form,'ok') status_form, coalesce(m.status_bsu,'ok') status_bsu,
    (select count(*) from monitoring_bsu_2026.peserta p where p.lokasi_id = l.id and p.aktif)::int as target,
    (select count(distinct a.peserta_id) from monitoring_bsu_2026.v_jawaban_aktif a
       join monitoring_bsu_2026.peserta p on p.id = a.peserta_id
       where p.lokasi_id = l.id and p.aktif and a.cocok in ('persis','mirip','manual'))::int as sudah_isi,
    (select count(*) from monitoring_bsu_2026.v_jawaban_aktif a
       where a.lokasi_id = l.id and a.cocok in ('cek','tidak_ada'))::int as perlu_cek,
    (select count(distinct b.peserta_id) from monitoring_bsu_2026.bsu_penerima b
       join monitoring_bsu_2026.peserta p on p.id = b.peserta_id
       where p.lokasi_id = l.id and p.aktif and not b.dibatalkan and b.cocok in ('persis','mirip','manual'))::int as ada_bsu
  from monitoring_bsu_2026.lokasi l
  left join monitoring_bsu_2026.pemetaan_lokasi m on m.lokasi_id = l.id
  where l.aktif;

create or replace view monitoring_bsu_2026.v_sinkron as
  select (select max(waktu) from monitoring_bsu_2026.form_jawaban where not hilang) as jawaban_terakhir,
         (select max(waktu) from monitoring_bsu_2026.sinkron_log where galat is null) as sinkron_terakhir,
         (select count(*) from monitoring_bsu_2026.form_jawaban where not hilang and not dibatalkan)::int as jumlah_jawaban;

-- daftar peserta (dengan nama) hanya untuk staf yang login
create or replace view monitoring_bsu_2026.v_peserta_staff as
  select p.id, p.nama, p.lokasi_id, l.nama as lokasi, p.aktif, p.catatan,
         a.id as jawaban_id, a.waktu as waktu_isi, a.nama as nama_di_form, a.cocok as cocok_form,
         exists (select 1 from monitoring_bsu_2026.bsu_penerima b
                 where b.peserta_id = p.id and not b.dibatalkan and b.cocok in ('persis','mirip','manual')) as ada_bsu
  from monitoring_bsu_2026.peserta p
  join monitoring_bsu_2026.lokasi l on l.id = p.lokasi_id
  left join lateral (select a.* from monitoring_bsu_2026.v_jawaban_aktif a
                     where a.peserta_id = p.id and a.cocok in ('persis','mirip','manual')
                     order by a.waktu desc nulls last limit 1) a on true
  where monitoring_bsu_2026.is_staff();

create or replace view monitoring_bsu_2026.v_jawaban_staff as
  select j.id, j.waktu, j.lokasi_form, j.nama, j.cocok, j.skor, j.dikunci, j.dibatalkan, j.hilang,
         j.lokasi_id, l.nama as lokasi_acuan, j.peserta_id, p.nama as nama_acuan
  from monitoring_bsu_2026.form_jawaban j
  left join monitoring_bsu_2026.lokasi l on l.id = j.lokasi_id
  left join monitoring_bsu_2026.peserta p on p.id = j.peserta_id
  where monitoring_bsu_2026.is_staff();

create or replace view monitoring_bsu_2026.v_bsu_staff as
  select b.id, b.folder, b.wilayah, b.nama, b.cocok, b.skor, b.dikunci, b.dibatalkan,
         b.lokasi_id, l.nama as lokasi_acuan, b.peserta_id, p.nama as nama_acuan
  from monitoring_bsu_2026.bsu_penerima b
  left join monitoring_bsu_2026.lokasi l on l.id = b.lokasi_id
  left join monitoring_bsu_2026.peserta p on p.id = b.peserta_id
  where monitoring_bsu_2026.is_staff();

-- ===== fungsi untuk administrator =====
create or replace function monitoring_bsu_2026.saran_peserta(p_nama text, p_lokasi int[] default null, p_batas int default 6)
returns table (peserta_id int, nama text, lokasi_id int, lokasi text, skor real)
language sql stable security definer set search_path = monitoring_bsu_2026, extensions, public as $$
  select p.id, p.nama, p.lokasi_id, l.nama, sim(norm_nama(p_nama), norm_nama(p.nama))
  from peserta p join lokasi l on l.id = p.lokasi_id
  where p.aktif and monitoring_bsu_2026.is_admin() and (p_lokasi is null or p.lokasi_id = any(p_lokasi))
  order by 5 desc, p.id limit least(coalesce(p_batas,6), 20)
$$;
create or replace function monitoring_bsu_2026.pilih_jawaban(p_id bigint, p_peserta int) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if p_peserta is null then
    update form_jawaban set peserta_id = null, cocok = 'tidak_ada', dikunci = true, diperbarui = now() where id = p_id;
  else
    update form_jawaban set peserta_id = p_peserta, lokasi_id = (select lokasi_id from peserta where id = p_peserta),
      cocok = 'manual', skor = 1, dikunci = true, diperbarui = now() where id = p_id;
  end if;
end $$;
create or replace function monitoring_bsu_2026.pilih_bsu(p_id bigint, p_peserta int) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if p_peserta is null then
    update bsu_penerima set peserta_id = null, cocok = 'tidak_ada', dikunci = true, diperbarui = now() where id = p_id;
  else
    update bsu_penerima set peserta_id = p_peserta, lokasi_id = (select lokasi_id from peserta where id = p_peserta),
      cocok = 'manual', skor = 1, dikunci = true, diperbarui = now() where id = p_id;
  end if;
end $$;
create or replace function monitoring_bsu_2026.lepas_kunci(p_tabel text, p_id bigint) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if p_tabel = 'jawaban' then
    update form_jawaban set dikunci = false, cocok = 'baru', peserta_id = null where id = p_id;
    perform cocokkan_jawaban(p_id);
  elsif p_tabel = 'bsu' then
    update bsu_penerima set dikunci = false, cocok = 'baru', peserta_id = null where id = p_id;
    perform cocokkan_bsu(p_id);
  end if;
end $$;
create or replace function monitoring_bsu_2026.cocokkan_ulang() returns jsonb
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare a int; b int;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  update form_jawaban set cocok = 'baru' where not dikunci;
  update bsu_penerima set cocok = 'baru' where not dikunci;
  a := cocokkan_jawaban(null); b := cocokkan_bsu(null);
  return jsonb_build_object('jawaban', a, 'bsu', b);
end $$;

-- ===== hak akses =====
grant usage on schema monitoring_bsu_2026 to anon, authenticated, service_role;
grant all on all tables in schema monitoring_bsu_2026 to service_role;
grant all on all sequences in schema monitoring_bsu_2026 to service_role;
grant execute on all functions in schema monitoring_bsu_2026 to service_role;
revoke all on all tables in schema monitoring_bsu_2026 from anon, authenticated;
revoke execute on all functions in schema monitoring_bsu_2026 from public, anon, authenticated;
grant select on monitoring_bsu_2026.v_progres_lokasi, monitoring_bsu_2026.v_sinkron to anon, authenticated;
grant select on monitoring_bsu_2026.v_peserta_staff, monitoring_bsu_2026.v_jawaban_staff, monitoring_bsu_2026.v_bsu_staff to authenticated;
grant select, insert, update, delete on monitoring_bsu_2026.lokasi, monitoring_bsu_2026.peserta,
  monitoring_bsu_2026.pemetaan_lokasi, monitoring_bsu_2026.form_jawaban, monitoring_bsu_2026.bsu_penerima,
  monitoring_bsu_2026.form_sensitif, monitoring_bsu_2026.bsu_sensitif, monitoring_bsu_2026.bsu_admin,
  monitoring_bsu_2026.pengaturan to authenticated;
grant select on monitoring_bsu_2026.sinkron_log to authenticated;
grant usage on all sequences in schema monitoring_bsu_2026 to authenticated;
grant execute on function monitoring_bsu_2026.saran_peserta(text,int[],int), monitoring_bsu_2026.pilih_jawaban(bigint,int),
  monitoring_bsu_2026.pilih_bsu(bigint,int), monitoring_bsu_2026.lepas_kunci(text,bigint),
  monitoring_bsu_2026.cocokkan_ulang(), monitoring_bsu_2026.is_staff(), monitoring_bsu_2026.is_admin() to authenticated;

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['lokasi','peserta','pemetaan_lokasi','form_jawaban','bsu_penerima','form_sensitif','bsu_sensitif','bsu_admin','pengaturan','sinkron_log'] loop
    execute format('alter table monitoring_bsu_2026.%I enable row level security', t);
    execute format('drop policy if exists staf_baca on monitoring_bsu_2026.%I', t);
    execute format('drop policy if exists admin_tulis on monitoring_bsu_2026.%I', t);
  end loop;
  foreach t in array array['lokasi','peserta','pemetaan_lokasi','form_jawaban','bsu_penerima','pengaturan','sinkron_log'] loop
    execute format('create policy staf_baca on monitoring_bsu_2026.%I for select to authenticated using (monitoring_bsu_2026.is_staff())', t);
  end loop;
  foreach t in array array['form_sensitif','bsu_sensitif','bsu_admin'] loop
    execute format('create policy staf_baca on monitoring_bsu_2026.%I for select to authenticated using (monitoring_bsu_2026.is_admin())', t);
  end loop;
  foreach t in array array['lokasi','peserta','pemetaan_lokasi','form_jawaban','bsu_penerima','form_sensitif','bsu_sensitif','bsu_admin','pengaturan'] loop
    execute format('create policy admin_tulis on monitoring_bsu_2026.%I for all to authenticated using (monitoring_bsu_2026.is_admin()) with check (monitoring_bsu_2026.is_admin())', t);
  end loop;
end $$;
