// Mengirim rekap kekurangan pengisian BSU ke WhatsApp koordinator satu wilayah, lewat n8n -> WAHA (VPS).
// Hanya admin BSU yang login. Nomor tujuan SELALU dibaca dari tabel wa_penerima di server; browser hanya mengirim nama wilayah dan teks.
// Rahasia yang dipakai (sudah ada, sama dengan fitur Ingatkan PIC): N8N_WEBHOOK_URL, N8N_TOKEN.
// Mode uji: selama rahasia WA_NOMOR_UJI terisi, semua pesan dialihkan ke nomor itu. Hapus rahasianya saat dipakai sungguhan.
// Isi yang dikirim ke n8n: { pesan: [{ nomor, chatId, nama, teks }] }
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const balas = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const noWa = (t: string) => { const d = String(t ?? '').replace(/\D/g, ''); return !d ? '' : d.startsWith('62') ? d : d.startsWith('0') ? '62' + d.slice(1) : d.startsWith('8') ? '62' + d : d; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return balas({ error: 'Metode tidak didukung' }, 405);
  const url = Deno.env.get('N8N_WEBHOOK_URL'), token = Deno.env.get('N8N_TOKEN');
  if (!url || !token) return balas({ error: 'Sambungan WhatsApp (n8n) belum diatur', belum_diatur: true }, 503);

  let body: any;
  try { body = await req.json(); } catch { return balas({ error: 'Data tidak terbaca' }, 400); }
  const wilayah = String(body?.wilayah ?? '').trim();
  const teks: string[] = Array.isArray(body?.teks) ? body.teks : [];
  if (!wilayah) return balas({ error: 'Wilayah kosong' }, 400);
  if (!teks.length || teks.length > 20 || teks.some((t) => typeof t !== 'string' || !t.trim() || t.length > 4000))
    return balas({ error: 'Teks kosong, terlalu banyak bagian, atau lebih dari 4000 karakter per bagian' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'monitoring_bsu_2026' } });

  // izin: harus admin BSU yang login
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return balas({ error: 'Perlu login admin' }, 401);
  const { data: u, error: eu } = await db.auth.getUser(jwt);
  const email = String(u?.user?.email ?? '').toLowerCase();
  if (eu || !email) return balas({ error: 'Perlu login admin' }, 401);
  const { data: staf } = await db.from('bsu_admin').select('email,peran,aktif');
  const a = (staf ?? []).find((x: any) => String(x.email).toLowerCase() === email);
  if (!a || !a.aktif || a.peran !== 'admin') return balas({ error: 'Akun ini bukan admin' }, 403);

  // penerima dari database
  const { data: p } = await db.from('wa_penerima').select('nama,nomor').eq('wilayah', wilayah).maybeSingle();
  const nomor = noWa(p?.nomor ?? '');
  if (!nomor) return balas({ error: 'Nomor penerima untuk wilayah ' + wilayah + ' belum diisi' }, 422);
  const nama = p?.nama || 'Koordinator ' + wilayah;

  const uji = noWa(Deno.env.get('WA_NOMOR_UJI') ?? '');
  const tujuan = uji || nomor;
  const pesan = teks.map((t, i) => ({
    nomor: tujuan, chatId: tujuan + '@c.us', nama,
    teks: uji ? `[UJI - seharusnya untuk ${nama} (${nomor.slice(0, 4)}…${nomor.slice(-3)}), bagian ${i + 1}/${teks.length}]\n\n${t}` : t,
  }));

  const catat = (status: string, catatan = '') =>
    db.from('wa_kirim_log').insert({ oleh: email, wilayah, nama, nomor_akhir: nomor.slice(-4), jumlah_pesan: pesan.length, status, catatan: (uji ? '[mode uji] ' : '') + catatan }).then(() => {}, () => {});

  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: JSON.stringify({ pesan }) });
    if (!r.ok) { await catat('gagal', 'n8n menolak HTTP ' + r.status); return balas({ error: `n8n menolak (HTTP ${r.status})` }, 502); }
    await catat('terkirim');
    return balas({ ok: true, terkirim: pesan.length, mode_uji: !!uji, penerima: nama });
  } catch (e) {
    await catat('gagal', String(e).slice(0, 160));
    return balas({ error: 'Gagal menghubungi n8n: ' + String(e).slice(0, 160) }, 502);
  }
});
