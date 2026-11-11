-- v_progres_lokasi dihitung dengan agregasi sekali jalan (sebelumnya subkueri per lokasi, ~3 detik = batas akun anon).
-- Hasil identik dengan versi lama; sekarang ~20 ms.
create or replace view monitoring_bsu_2026.v_progres_lokasi as
with ja as materialized (select peserta_id, lokasi_id, cocok from monitoring_bsu_2026.v_jawaban_aktif),
 t as (select lokasi_id, count(*)::integer n from monitoring_bsu_2026.peserta where aktif group by 1),
 s as (select p.lokasi_id, count(distinct ja.peserta_id)::integer n from ja join monitoring_bsu_2026.peserta p on p.id = ja.peserta_id
       where p.aktif and ja.cocok = any (array['persis','mirip','manual']) group by 1),
 c as (select lokasi_id, count(*)::integer n from ja where cocok = any (array['cek','tidak_ada']) group by 1),
 b as (select p.lokasi_id, count(distinct bp.peserta_id)::integer n from monitoring_bsu_2026.bsu_penerima bp join monitoring_bsu_2026.peserta p on p.id = bp.peserta_id
       where p.aktif and not bp.dibatalkan and bp.cocok = any (array['persis','mirip','manual']) group by 1)
select l.id as lokasi_id, l.nama, l.wilayah, coalesce(m.status_form,'ok') as status_form, coalesce(m.status_bsu,'ok') as status_bsu,
       coalesce(t.n,0) as target, coalesce(s.n,0) as sudah_isi, coalesce(c.n,0) as perlu_cek, coalesce(b.n,0) as ada_bsu
from monitoring_bsu_2026.lokasi l
left join monitoring_bsu_2026.pemetaan_lokasi m on m.lokasi_id = l.id
left join t on t.lokasi_id = l.id left join s on s.lokasi_id = l.id left join c on c.lokasi_id = l.id left join b on b.lokasi_id = l.id
where l.aktif;
