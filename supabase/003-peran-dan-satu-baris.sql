-- Peran pengguna yang sedang login (admin/operator) dan pencocokan ulang satu baris.
create or replace function monitoring_bsu_2026.peran_saya() returns text
language sql stable security definer set search_path = monitoring_bsu_2026, public as $$
  select a.peran from monitoring_bsu_2026.bsu_admin a
  where a.aktif and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email',''))
$$;

create or replace function monitoring_bsu_2026.cocokkan_satu(p_tabel text, p_id bigint) returns void
language plpgsql security definer set search_path = monitoring_bsu_2026, public as $$
begin
  if not is_admin() then raise exception 'Hanya administrator'; end if;
  if p_tabel = 'jawaban' then perform cocokkan_jawaban(p_id, 1);
  elsif p_tabel = 'bsu' then perform cocokkan_bsu(p_id, 1);
  end if;
end $$;

revoke execute on function monitoring_bsu_2026.peran_saya(), monitoring_bsu_2026.cocokkan_satu(text,bigint) from public, anon;
grant execute on function monitoring_bsu_2026.peran_saya(), monitoring_bsu_2026.cocokkan_satu(text,bigint) to authenticated, service_role;

-- tampilan memakai norm_nama; pengecekan hak fungsi memakai pemanggil, bukan pemilik tampilan
grant execute on function monitoring_bsu_2026.norm_nama(text), monitoring_bsu_2026.urut_kata(text) to anon, authenticated;
