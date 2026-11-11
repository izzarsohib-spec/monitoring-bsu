-- Optimasi pencocokan: nama ternormalisasi disimpan sekali (kolom turunan) dan pencocokan dikerjakan bertahap.
alter table monitoring_bsu_2026.peserta
  add column if not exists nama_n text generated always as (monitoring_bsu_2026.norm_nama(nama)) stored,
  add column if not exists nama_u text generated always as (monitoring_bsu_2026.urut_kata(monitoring_bsu_2026.norm_nama(nama))) stored;
alter table monitoring_bsu_2026.form_jawaban
  add column if not exists nama_n text generated always as (monitoring_bsu_2026.norm_nama(nama)) stored,
  add column if not exists nama_u text generated always as (monitoring_bsu_2026.urut_kata(monitoring_bsu_2026.norm_nama(nama))) stored;
alter table monitoring_bsu_2026.bsu_penerima
  add column if not exists nama_n text generated always as (monitoring_bsu_2026.norm_nama(nama)) stored,
  add column if not exists nama_u text generated always as (monitoring_bsu_2026.urut_kata(monitoring_bsu_2026.norm_nama(nama))) stored;

create or replace function monitoring_bsu_2026.sim_n(an text, au text, bn text, bu text) returns real
language sql immutable set search_path = monitoring_bsu_2026, extensions, public as $$
  select case when coalesce(an,'')='' or coalesce(bn,'')='' then 0::real else greatest(
    1 - levenshtein(left(an,120),left(bn,120))::real / greatest(length(left(an,120)),length(left(bn,120))),
    1 - levenshtein(left(au,120),left(bu,120))::real / greatest(length(left(an,120)),length(left(bn,120)))
  )::real end
$$;

create or replace function monitoring_bsu_2026.cocokkan_jawaban(p_id bigint default null, p_batas int default 400) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nama_n, nama_u, lokasi_form from form_jawaban
             where (p_id is null and not dikunci and cocok = 'baru') or id = p_id
             order by id limit case when p_id is null then p_batas else 1 end),
  lm as (select j.id jid, m.lokasi_id from j
         join pemetaan_lokasi m on m.nama_form is not null and upper(btrim(m.nama_form)) = upper(btrim(j.lokasi_form))),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  c as (select lm.jid, p.id pid, p.lokasi_id lid, sim_n(j.nama_n, j.nama_u, p.nama_n, p.nama_u) sk
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
  update form_jawaban f set
    cocok = h.cocok,
    peserta_id = case when h.cocok in ('persis','mirip') then h.pid end,
    lokasi_id = case when h.cocok in ('persis','mirip') then h.lid when h.ln = 1 then h.ll end,
    skor = h.sk, diperbarui = now()
  from h where f.id = h.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function monitoring_bsu_2026.cocokkan_bsu(p_id bigint default null, p_batas int default 400) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nama_n, nama_u, folder from bsu_penerima
             where (p_id is null and not dikunci and cocok = 'baru') or id = p_id
             order by id limit case when p_id is null then p_batas else 1 end),
  lm as (select j.id jid, m.lokasi_id from j join pemetaan_lokasi m on m.folder_bsu is not null and m.folder_bsu = j.folder),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  c as (select lm.jid, p.id pid, p.lokasi_id lid, sim_n(j.nama_n, j.nama_u, p.nama_n, p.nama_u) sk
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
  from h where f.id = h.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- terima_jawaban hanya menyimpan data; pencocokan dilanjutkan bertahap oleh pemanggil
create or replace function monitoring_bsu_2026.terima_jawaban(p_rows jsonb, p_penuh boolean default true, p_sumber text default 'sinkron')
returns jsonb language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
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
      where not f.hilang and not exists (select 1 from _in i where i.kunci = f.kunci);
    get diagnostics v_hilang = row_count;
  end if;
  insert into sinkron_log (sumber, baris, baru, berubah, hilang) values (p_sumber, v_total, v_baru, v_berubah, v_hilang);
  return jsonb_build_object('baris', v_total, 'baru', v_baru, 'berubah', v_berubah, 'hilang', v_hilang);
end $$;

-- sisa yang belum dicocokkan (untuk perulangan)
create or replace function monitoring_bsu_2026.sisa_cocok() returns integer
language sql stable security definer set search_path = monitoring_bsu_2026, public as $$
  select (select count(*) from form_jawaban where cocok = 'baru' and not dikunci)
       + (select count(*) from bsu_penerima where cocok = 'baru' and not dikunci)
$$;
create or replace function monitoring_bsu_2026.cocokkan_lanjut(p_batas int default 300) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  perform cocokkan_jawaban(null, p_batas);
  perform cocokkan_bsu(null, p_batas);
  return sisa_cocok();
end $$;

drop function if exists monitoring_bsu_2026.cocokkan_ulang();
create or replace function monitoring_bsu_2026.cocokkan_ulang() returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  update form_jawaban set cocok = 'baru' where not dikunci;
  update bsu_penerima set cocok = 'baru' where not dikunci;
  return sisa_cocok();
end $$;

create or replace function monitoring_bsu_2026.cocokkan_lanjut_staf(p_batas int default 300) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  return cocokkan_lanjut(p_batas);
end $$;

create or replace function monitoring_bsu_2026.saran_peserta(p_nama text, p_lokasi int[] default null, p_batas int default 6)
returns table (peserta_id int, nama text, lokasi_id int, lokasi text, skor real)
language sql stable security definer set search_path = monitoring_bsu_2026, extensions, public as $$
  select p.id, p.nama, p.lokasi_id, l.nama,
         sim_n(norm_nama(p_nama), urut_kata(norm_nama(p_nama)), p.nama_n, p.nama_u)
  from peserta p join lokasi l on l.id = p.lokasi_id
  where p.aktif and monitoring_bsu_2026.is_admin() and (p_lokasi is null or p.lokasi_id = any(p_lokasi))
  order by 5 desc, p.id limit least(coalesce(p_batas,6), 20)
$$;

revoke execute on all functions in schema monitoring_bsu_2026 from public, anon, authenticated;
grant execute on all functions in schema monitoring_bsu_2026 to service_role;
grant execute on function monitoring_bsu_2026.saran_peserta(text,int[],int), monitoring_bsu_2026.pilih_jawaban(bigint,int),
  monitoring_bsu_2026.pilih_bsu(bigint,int), monitoring_bsu_2026.lepas_kunci(text,bigint),
  monitoring_bsu_2026.cocokkan_ulang(), monitoring_bsu_2026.cocokkan_lanjut_staf(int),
  monitoring_bsu_2026.is_staff(), monitoring_bsu_2026.is_admin() to authenticated;
-- lepas_kunci memakai cocokkan_*(p_id) yang kini punya 2 argumen; fungsi lama dibuang agar tidak ambigu
drop function if exists monitoring_bsu_2026.cocokkan_jawaban(bigint);
drop function if exists monitoring_bsu_2026.cocokkan_bsu(bigint);
