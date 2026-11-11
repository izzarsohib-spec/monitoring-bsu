-- Rekap kekurangan pengisian untuk dikirim lewat WhatsApp (WAHA di VPS, lewat n8n yang sudah ada).
-- Semua hanya untuk admin. Nomor tujuan selalu dibaca dari tabel wa_penerima di server, bukan dari browser.

-- Siapa yang belum mengisi, per wilayah dan lokasi (hanya lokasi yang ikut hitungan: status Form "ok").
create or replace function monitoring_bsu_2026.rekap_kekurangan()
returns table (wilayah text, lokasi_id integer, lokasi text, nama text)
language plpgsql stable security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  return query
  with ja as materialized (
    select distinct a.peserta_id from monitoring_bsu_2026.v_jawaban_aktif a
    where a.peserta_id is not null and a.cocok = any (array['persis', 'mirip', 'manual']))
  select coalesce(l.wilayah, 'Lainnya'), l.id, l.nama, p.nama
  from monitoring_bsu_2026.peserta p
  join monitoring_bsu_2026.lokasi l on l.id = p.lokasi_id
  left join monitoring_bsu_2026.pemetaan_lokasi m on m.lokasi_id = l.id
  where p.aktif and l.aktif and coalesce(m.status_form, 'ok') = 'ok'
    and not exists (select 1 from ja where ja.peserta_id = p.id)
  order by 1, 3, 4;
end $$;

-- Penerima rekap per wilayah (koordinator)
create table if not exists monitoring_bsu_2026.wa_penerima (
  wilayah text primary key,
  nama text,
  nomor text,
  diperbarui timestamptz not null default now());
alter table monitoring_bsu_2026.wa_penerima enable row level security;
drop policy if exists admin_semua on monitoring_bsu_2026.wa_penerima;
create policy admin_semua on monitoring_bsu_2026.wa_penerima for all to authenticated using (monitoring_bsu_2026.is_admin()) with check (monitoring_bsu_2026.is_admin());
revoke all on monitoring_bsu_2026.wa_penerima from public, anon;
grant select on monitoring_bsu_2026.wa_penerima to authenticated;
grant all on monitoring_bsu_2026.wa_penerima to service_role;

create or replace function monitoring_bsu_2026.simpan_penerima_wa(p_wilayah text, p_nama text, p_nomor text) returns text
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
declare d text := regexp_replace(coalesce(p_nomor, ''), '\D', '', 'g'); n text;
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if btrim(coalesce(p_wilayah, '')) = '' then raise exception 'Wilayah kosong'; end if;
  n := case when d like '62%' then d when d like '0%' then '62' || substr(d, 2) when d like '8%' then '62' || d else d end;
  if n !~ '^62[0-9]{8,13}$' then raise exception 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxxx)'; end if;
  insert into wa_penerima (wilayah, nama, nomor) values (btrim(p_wilayah), nullif(btrim(coalesce(p_nama, '')), ''), n)
  on conflict (wilayah) do update set nama = excluded.nama, nomor = excluded.nomor, diperbarui = now();
  return n;
end $$;
revoke all on function monitoring_bsu_2026.simpan_penerima_wa(text, text, text) from public, anon;
revoke all on function monitoring_bsu_2026.rekap_kekurangan() from public, anon;
grant execute on function monitoring_bsu_2026.simpan_penerima_wa(text, text, text), monitoring_bsu_2026.rekap_kekurangan() to authenticated;

-- Catatan pengiriman (ditulis oleh Edge Function kirim-rekap-bsu)
create table if not exists monitoring_bsu_2026.wa_kirim_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  oleh text, wilayah text, nama text, nomor_akhir text, jumlah_pesan integer, status text, catatan text);
alter table monitoring_bsu_2026.wa_kirim_log enable row level security;
drop policy if exists admin_baca on monitoring_bsu_2026.wa_kirim_log;
create policy admin_baca on monitoring_bsu_2026.wa_kirim_log for select to authenticated using (monitoring_bsu_2026.is_admin());
revoke all on monitoring_bsu_2026.wa_kirim_log from public, anon;
grant select on monitoring_bsu_2026.wa_kirim_log to authenticated;
grant all on monitoring_bsu_2026.wa_kirim_log to service_role;
