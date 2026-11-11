// Sinkron jawaban Google Form (spreadsheet) ke Supabase, schema monitoring_bsu_2026.
// Dipanggil tiap 5 menit oleh pg_cron (header x-sinkron-token) dan oleh tombol "Sinkron sekarang" (login staf).
import { createClient } from "npm:@supabase/supabase-js@2";

const SKEMA = "monitoring_bsu_2026";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sinkron-token",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function parseCsv(teks: string): string[][] {
  const baris: string[][] = [];
  let sel = "", row: string[] = [], dalamKutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (dalamKutip) {
      if (c === '"') {
        if (teks[i + 1] === '"') { sel += '"'; i++; } else dalamKutip = false;
      } else sel += c;
    } else if (c === '"') dalamKutip = true;
    else if (c === ",") { row.push(sel); sel = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && teks[i + 1] === "\n") i++;
      row.push(sel); sel = "";
      if (row.some((x) => x !== "")) baris.push(row);
      row = [];
    } else sel += c;
  }
  row.push(sel);
  if (row.some((x) => x !== "")) baris.push(row);
  return baris;
}

// "11/7/2026 9:46:27" (bulan/tanggal/tahun, waktu Jakarta) -> ISO
function waktuIso(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const p = (x: string | undefined, n = 2) => String(x ?? "0").padStart(n, "0");
  return `${m[3]}-${p(m[1])}-${p(m[2])}T${p(m[4])}:${p(m[5])}:${p(m[6])}+07:00`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const db = sb.schema(SKEMA);

  // izin: token cron, atau staf yang login
  let sumber = "cron";
  const { data: rhs } = await db.from("rahasia").select("nilai").eq("kunci", "sinkron_token").maybeSingle();
  const tokenCron = rhs?.nilai;
  if (!tokenCron || req.headers.get("x-sinkron-token") !== tokenCron) {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    const email = u?.user?.email?.toLowerCase();
    if (!email) return json({ ok: false, pesan: "Perlu login" }, 401);
    const { data: a } = await db.from("bsu_admin").select("email").eq("aktif", true).ilike("email", email).maybeSingle();
    if (!a) return json({ ok: false, pesan: "Akun ini tidak punya akses" }, 403);
    sumber = "manual:" + email;
  }

  const catatGalat = async (g: string) => {
    await db.from("sinkron_log").insert({ sumber, galat: g.slice(0, 500) });
  };
  try {
    const { data: set } = await db.from("pengaturan").select("kunci,nilai").in("kunci", ["sheet_id", "sheet_nama"]);
    const cfg = Object.fromEntries((set ?? []).map((r) => [r.kunci, r.nilai]));
    if (!cfg.sheet_id) throw new Error("sheet_id belum diatur");
    const u = `https://docs.google.com/spreadsheets/d/${cfg.sheet_id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheet_nama || "Form Responses 1")}`;
    const res = await fetch(u, { redirect: "follow" });
    const teks = await res.text();
    if (!res.ok || !/^"?Timestamp"?,/i.test(teks)) throw new Error("Spreadsheet tidak terbaca (cek pembagian akses 'siapa saja dengan link'). HTTP " + res.status);
    const tabel = parseCsv(teks);
    const kepala = tabel[0].map((h) => h.trim().toLowerCase());
    const idx = (awalan: string[]) => kepala.findIndex((h) => awalan.some((a) => h.startsWith(a)));
    const ci = {
      waktu: idx(["timestamp"]), lokasi: idx(["lokasi penempatan"]), nama: idx(["nama lengkap"]), nik: idx(["nik"]),
      bank: idx(["nama bank"]), rek: idx(["nomer rekening", "nomor rekening"]), namarek: idx(["nama pemilik rekening"]),
      hp: idx(["nomor hp", "nomer hp"]),
    };
    if (ci.waktu < 0 || ci.lokasi < 0 || ci.nama < 0) throw new Error("Kolom Timestamp/Lokasi/Nama tidak ditemukan");
    const pakai = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const sudah = new Map<string, number>();
    const rows: Record<string, string | null>[] = [];
    for (const r of tabel.slice(1)) {
      const nama = pakai(r, ci.nama);
      if (!nama) continue;
      const waktu = waktuIso(pakai(r, ci.waktu));
      const nikAsli = pakai(r, ci.nik);
      const nikAngka = nikAsli.replace(/\D/g, "");
      let kunci = `${waktu ?? pakai(r, ci.waktu)}|${/^\d{16}$/.test(nikAngka) ? nikAngka : nikAsli.slice(0, 20) || "-"}|${nama.toUpperCase().replace(/[^A-Z]/g, "")}`;
      const n = (sudah.get(kunci) ?? 0) + 1;
      sudah.set(kunci, n);
      if (n > 1) kunci += "#" + n;
      rows.push({
        kunci, waktu, lokasi_form: pakai(r, ci.lokasi), nama, nik: nikAsli,
        bank: pakai(r, ci.bank), no_rek: pakai(r, ci.rek), nama_rek: pakai(r, ci.namarek), hp: pakai(r, ci.hp),
      });
    }
    // pengaman: jangan tandai "hilang di sheet" bila hasil unduhan tampak tidak utuh
    const { count } = await db.from("form_jawaban").select("id", { count: "exact", head: true }).eq("hilang", false);
    const penuh = rows.length > 0 && !(rows.length < 100 && (count ?? 0) > 1000);
    const { data, error } = await db.rpc("terima_jawaban", { p_rows: rows, p_penuh: penuh, p_sumber: sumber });
    if (error) throw new Error(error.message);
    // pencocokan nama dikerjakan bertahap supaya tidak melewati batas waktu satu permintaan
    let sisa = 1, putaran = 0;
    while (sisa > 0 && putaran < 120) {
      const { data: s, error: e2 } = await db.rpc("cocokkan_lanjut", { p_batas: 100 });
      if (e2) throw new Error(e2.message);
      sisa = Number(s ?? 0);
      putaran++;
    }
    const { count: cek } = await db.from("form_jawaban").select("id", { count: "exact", head: true })
      .eq("hilang", false).eq("dibatalkan", false).in("cocok", ["cek", "tidak_ada", "lokasi_belum"]);
    return json({ ok: true, ...data, perlu_cek: cek ?? 0, sisa_dicocokkan: sisa });
  } catch (e) {
    const g = e instanceof Error ? e.message : String(e);
    await catatGalat(g);
    return json({ ok: false, pesan: g }, 500);
  }
});
