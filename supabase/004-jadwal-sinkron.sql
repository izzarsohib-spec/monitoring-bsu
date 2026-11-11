-- Jadwal sinkron otomatis: tiap 5 menit memanggil fungsi sinkron-form.
-- Token dibaca dari tabel rahasia (tidak ditulis di sini). Isi token sekali:
--   insert into monitoring_bsu_2026.rahasia(kunci, nilai) values ('sinkron_token', '<token acak panjang>')
--   on conflict (kunci) do update set nilai = excluded.nilai;
-- Ganti <ref> dengan ID project Supabase.
create table if not exists monitoring_bsu_2026.rahasia (kunci text primary key, nilai text);
alter table monitoring_bsu_2026.rahasia enable row level security;
revoke all on monitoring_bsu_2026.rahasia from anon, authenticated;
grant all on monitoring_bsu_2026.rahasia to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'bsu-sinkron-form';
select cron.schedule('bsu-sinkron-form', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/sinkron-form',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sinkron-token', (select nilai from monitoring_bsu_2026.rahasia where kunci = 'sinkron_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$job$);
