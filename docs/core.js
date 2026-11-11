/* Inti: koneksi Supabase, sesi login, dan alat bantu kecil. */
(function () {
  const C = window.BSU_CONFIG;
  const sb = window.supabase.createClient(C.url, C.anonKey, {
    db: { schema: C.schema },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const B = (window.BSU = { sb, C, user: null, peran: null });

  B.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  B.$ = (s, r = document) => r.querySelector(s);
  B.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  B.angka = (n) => new Intl.NumberFormat('id-ID').format(n ?? 0);
  B.persen = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  B.waktu = (iso) =>
    iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
  B.staf = () => !!B.peran;
  B.admin = () => B.peran === 'admin';

  B.toast = (teks, buruk) => {
    const k = document.createElement('div');
    k.className = 'toast' + (buruk ? ' bad' : '');
    k.textContent = teks;
    B.$('#toasts').appendChild(k);
    setTimeout(() => k.remove(), buruk ? 7000 : 3500);
  };

  // Terjemahan pesan galat yang sering muncul
  B.galat = (e) => {
    const m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
    if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk email Anda.';
    if (/row-level security|permission denied|Hanya administrator/i.test(m)) return 'Akun ini tidak punya izin untuk tindakan itu.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Jaringan bermasalah. Coba lagi.';
    return m;
  };

  B.muatSesi = async () => {
    const { data } = await sb.auth.getSession();
    B.user = data.session ? data.session.user : null;
    B.peran = null;
    if (B.user) {
      const r = await sb.rpc('peran_saya');
      B.peran = r.error ? null : r.data || null;
    }
  };
  B.masuk = (email, sandi) => sb.auth.signInWithPassword({ email, password: sandi });
  B.keluar = async () => {
    await sb.auth.signOut();
    B.user = null;
    B.peran = null;
  };

  // Ambil semua baris (PostgREST membatasi 1000 per permintaan)
  B.semua = async (buat) => {
    const hasil = [];
    for (let dari = 0; ; dari += 1000) {
      const { data, error } = await buat().range(dari, dari + 999);
      if (error) throw error;
      hasil.push(...data);
      if (data.length < 1000) break;
    }
    return hasil;
  };

  // Hindari pola karakter khusus pada filter ilike/or
  B.aman = (s) => String(s || '').replace(/[%,()*\\]/g, ' ').trim();

  // Fungsi sinkron memakai login pengguna (bukan token cron)
  B.sinkron = async () => {
    const { data } = await sb.auth.getSession();
    const r = await fetch(C.fungsiSinkron, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (data.session ? data.session.access_token : ''), apikey: C.anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.pesan || 'Sinkron gagal (HTTP ' + r.status + ')');
    return j;
  };

  B.COCOK = {
    persis: ['Cocok persis', 's-ok'],
    mirip: ['Cocok (mirip)', 's-info'],
    manual: ['Dipilih manual', 's-ok'],
    cek: ['Perlu dicek', 's-warn'],
    tidak_ada: ['Tidak ada di acuan', 's-bad'],
    lokasi_belum: ['Lokasi belum dipetakan', 's-bad'],
    baru: ['Belum dicocokkan', 's-abu'],
  };
  B.lencanaCocok = (c) => {
    const x = B.COCOK[c] || [c, 's-abu'];
    return '<span class="lencana-s ' + x[1] + '">' + B.esc(x[0]) + '</span>';
  };
})();
