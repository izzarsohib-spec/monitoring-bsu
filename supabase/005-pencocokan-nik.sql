alter table monitoring_bsu_2026.form_jawaban add column if not exists beda_lokasi boolean not null default false;
alter table monitoring_bsu_2026.bsu_penerima add column if not exists beda_lokasi boolean not null default false;
create or replace function monitoring_bsu_2026.cocokkan_jawaban(p_id bigint default null, p_batas integer default 400) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nik_kunci, nama_n, nama_u, lokasi_form lok from form_jawaban
             where (p_id is null and not dikunci and cocok = 'baru') or id = p_id
             order by id limit case when p_id is null then p_batas else 1 end),
  lm as (select j.id jid, m.lokasi_id from j join pemetaan_lokasi m on m.nama_form is not null and upper(btrim(m.nama_form)) = upper(btrim(j.lok))),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  nkm as (select j.id jid, p.id pid, p.lokasi_id lid from j
          join peserta_sensitif ps on kunci_nik(ps.nik) = j.nik_kunci
          join peserta p on p.id = ps.peserta_id and p.aktif
          where j.nik_kunci is not null),
  c2 as (select nkm.*, exists (select 1 from lm where lm.jid = nkm.jid and lm.lokasi_id = nkm.lid) in_map,
                count(*) over (partition by jid) cnt from nkm),
  c3 as (select *, count(*) filter (where in_map) over (partition by jid) cin from c2),
  pick as (select jid, pid, lid, in_map from c3 where cnt = 1 or (in_map and cin = 1)),
  amb as (select distinct jid from c3 where jid not in (select jid from pick)),
  cn as (select lm.jid, p.id pid, sim_n(j.nama_n, j.nama_u, p.nama_n, p.nama_u) sk
         from lm join j on j.id = lm.jid join peserta p on p.lokasi_id = lm.lokasi_id and p.aktif
         where j.nik_kunci is null),
  r as (select jid, pid, sk, row_number() over (partition by jid order by sk desc, pid) rn from cn),
  h as (select j.id,
          case when j.nik_kunci is not null then
                 case when pick.jid is not null then 'persis' when amb.jid is not null then 'cek' else 'tidak_ada' end
               when lc.jid is null then 'lokasi_belum'
               when r.pid is null then 'tidak_ada'
               else 'cek' end as cocok,
          pick.pid, pick.lid, pick.in_map, r.sk, lc.n ln, lc.l ll, lc.jid is not null as ada_pemetaan
        from j left join lc on lc.jid = j.id left join pick on pick.jid = j.id
             left join amb on amb.jid = j.id left join r on r.jid = j.id and r.rn = 1)
  update form_jawaban f set
    cocok = h.cocok,
    peserta_id = case when h.cocok = 'persis' then h.pid end,
    lokasi_id = case when h.cocok = 'persis' then h.lid when h.ln = 1 then h.ll end,
    skor = case when h.cocok = 'persis' then 1 else h.sk end,
    beda_lokasi = (h.cocok = 'persis' and h.ada_pemetaan and not h.in_map),
    diperbarui = now()
  from h where f.id = h.id;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function monitoring_bsu_2026.cocokkan_bsu(p_id bigint default null, p_batas integer default 400) returns integer
language plpgsql security definer set search_path = monitoring_bsu_2026, extensions, public as $$
declare n int;
begin
  with j as (select id, nik_kunci, nama_n, nama_u, folder lok from bsu_penerima
             where (p_id is null and not dikunci and cocok = 'baru') or id = p_id
             order by id limit case when p_id is null then p_batas else 1 end),
  lm as (select j.id jid, m.lokasi_id from j join pemetaan_lokasi m on m.folder_bsu is not null and m.folder_bsu = j.lok),
  lc as (select jid, count(*) n, min(lokasi_id) l from lm group by jid),
  nkm as (select j.id jid, p.id pid, p.lokasi_id lid from j
          join peserta_sensitif ps on kunci_nik(ps.nik) = j.nik_kunci
          join peserta p on p.id = ps.peserta_id and p.aktif
          where j.nik_kunci is not null),
  c2 as (select nkm.*, exists (select 1 from lm where lm.jid = nkm.jid and lm.lokasi_id = nkm.lid) in_map,
                count(*) over (partition by jid) cnt from nkm),
  c3 as (select *, count(*) filter (where in_map) over (partition by jid) cin from c2),
  pick as (select jid, pid, lid, in_map from c3 where cnt = 1 or (in_map and cin = 1)),
  amb as (select distinct jid from c3 where jid not in (select jid from pick)),
  cn as (select lm.jid, p.id pid, sim_n(j.nama_n, j.nama_u, p.nama_n, p.nama_u) sk
         from lm join j on j.id = lm.jid join peserta p on p.lokasi_id = lm.lokasi_id and p.aktif
         where j.nik_kunci is null),
  r as (select jid, pid, sk, row_number() over (partition by jid order by sk desc, pid) rn from cn),
  h as (select j.id,
          case when j.nik_kunci is not null then
                 case when pick.jid is not null then 'persis' when amb.jid is not null then 'cek' else 'tidak_ada' end
               when lc.jid is null then 'lokasi_belum'
               when r.pid is null then 'tidak_ada'
               else 'cek' end as cocok,
          pick.pid, pick.lid, pick.in_map, r.sk, lc.n ln, lc.l ll, lc.jid is not null as ada_pemetaan
        from j left join lc on lc.jid = j.id left join pick on pick.jid = j.id
             left join amb on amb.jid = j.id left join r on r.jid = j.id and r.rn = 1)
  update bsu_penerima f set
    cocok = h.cocok,
    peserta_id = case when h.cocok = 'persis' then h.pid end,
    lokasi_id = case when h.cocok = 'persis' then h.lid when h.ln = 1 then h.ll end,
    skor = case when h.cocok = 'persis' then 1 else h.sk end,
    beda_lokasi = (h.cocok = 'persis' and h.ada_pemetaan and not h.in_map),
    diperbarui = now()
  from h where f.id = h.id;
  get diagnostics n = row_count;
  return n;
end $$;
