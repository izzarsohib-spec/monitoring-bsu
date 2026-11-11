/* Halaman Monitoring Pengisian BSU: tata letak dan perilaku mengikuti halaman Monitoring pengisian seragam. */
(function () {
  const B = window.BSU;
  const $ = (id) => document.getElementById(id);
  const esc = B.esc;
  const idn = (n) => Number(n || 0).toLocaleString('id-ID');
  const URUT = { kosong: 0, kurang: 1, lengkap: 2 };
  const LABEL = { kosong: 'Belum ada yang isi', kurang: 'Masih kurang', lengkap: 'Lengkap' };
  const NADA = { kosong: 'bad', kurang: 'warn', lengkap: 'ok' };
  const KHUSUS_FORM = { 'tidak ada': 'Tidak ada di pilihan form', 'tidak mengisi': 'Tidak mengisi form', 'ditangani produksi': 'Ditangani produksi' };
  const KHUSUS_BSU = { 'tidak dapat': 'Lokasi ini tidak menerima BSU', 'ditangani produksi': 'BSU lokasi ini ditangani produksi' };

  // tahap pengisian satu lokasi: lengkap, sudah mengisi (50% atau lebih), proses (di bawah 50%), belum mengisi
  const TAHAP = [['lengkap', 'Sudah lengkap', '#2F7F79', 'semua pesertanya sudah mengisi'], ['isi', 'Sudah mengisi', '#8CC5BB', 'terisi 50% atau lebih, belum lengkap'],
                 ['proses', 'Proses', '#E3C27E', 'terisi di bawah 50%'], ['kosong', 'Belum mengisi', '#D9958F', 'belum ada satu pun yang mengisi']];
  const tahapDari = (isi, target) => (isi >= target ? 'lengkap' : isi === 0 ? 'kosong' : (100 * isi) / target >= 50 ? 'isi' : 'proses');

  let semua = [];      // seluruh baris v_progres_lokasi yang punya peserta
  let lokasi = [];     // lokasi yang dipantau (form biasa)
  let khusus = [];     // lokasi yang tidak ikut hitungan (tidak mengisi form, ditangani produksi, dst.)
  let sinkron = null;
  let peserta = [], cek = [];
  let sel = null, status = 'semua', fWil = '', areaTop = '', fPeserta = '', terbukaHP = false;

  const wil = (l) => l.wilayah || 'Lainnya';

  function susun(baris) {
    semua = baris.filter((r) => r.target > 0).map((r) => {
      const isi = Math.min(r.sudah_isi, r.target);
      const k = r.status_form !== 'ok';
      return {
        id: r.lokasi_id, client: r.nama, wilayah: r.wilayah, khusus: k, status_form: r.status_form, status_bsu: r.status_bsu,
        target: r.target, isi, kurang: r.target - isi, ada_bsu: r.ada_bsu, perlu_cek: r.perlu_cek,
        persen: Math.round((1000 * isi) / r.target) / 10,
        status: k ? 'khusus' : isi >= r.target ? 'lengkap' : isi === 0 ? 'kosong' : 'kurang',
        kunci: (r.nama + ' ' + (r.wilayah || '')).toLowerCase(),
      };
    });
    lokasi = semua.filter((l) => !l.khusus);
    khusus = semua.filter((l) => l.khusus);
  }

  async function muatData() {
    const [p, s] = await Promise.all([
      B.sb.from('v_progres_lokasi').select('*').order('nama'),
      B.sb.from('v_sinkron').select('*').maybeSingle(),
    ]);
    if (p.error) throw p.error;
    susun(p.data);
    sinkron = s.data || null;
  }

  async function muatRincian() {
    peserta = []; cek = [];
    if (sel === null || !B.admin()) return;
    const id = sel;
    const [p, c] = await Promise.all([
      B.sb.from('v_peserta_staff').select('id,nama,waktu_isi,nama_di_form,cocok_form,ada_bsu,jawaban_id,aktif').eq('lokasi_id', id).order('nama'),
      B.sb.from('v_jawaban_staff').select('id,nama,lokasi_form,cocok').eq('lokasi_id', id).eq('dibatalkan', false).eq('hilang', false).in('cocok', ['cek', 'tidak_ada']).order('nama'),
    ]);
    if (sel !== id) return;
    peserta = (p.data || []).filter((x) => x.aktif);
    cek = c.data || [];
  }

  // ---- 5 lokasi dengan peserta belum mengisi terbanyak; chip wilayah menyaring ----
  function gambarTop() {
    const ada = [...new Set(lokasi.map(wil))].sort();
    if (areaTop && !ada.includes(areaTop)) areaTop = '';
    const jml = (w) => lokasi.filter((l) => wil(l) === w).reduce((a, l) => a + l.kurang, 0);
    $('areaChips').innerHTML = [['', 'Semua wilayah', lokasi.reduce((a, l) => a + l.kurang, 0)], ...ada.map((w) => [w, w, jml(w)])]
      .map(([id, nm, k]) => `<button class="chip ${areaTop === id ? 'on' : ''}" data-a="${esc(id)}" aria-pressed="${areaTop === id}">${esc(nm)} <small>${idn(k)}</small></button>`).join('');
    const sub = areaTop ? lokasi.filter((l) => wil(l) === areaTop) : lokasi;
    const top = sub.filter((l) => l.kurang > 0).sort((a, b) => b.kurang - a.kurang || a.client.localeCompare(b.client)).slice(0, 5);
    gambarPantau();
    if (!top.length) { $('topKurang').innerHTML = '<div class="kosongnya">Semua peserta di wilayah ini sudah mengisi.</div>'; return; }
    const mx = top[0].kurang;
    $('topKurang').innerHTML = '<div class="topbar-head"><span>Lokasi</span><span>Belum mengisi (orang)</span></div>' + top.map((l, i) =>
      `<button class="toprow" data-k="${l.id}" title="Klik untuk membuka lokasi ini di daftar bawah">
         <span class="tn"><b>${i + 1}. ${esc(l.client)}</b><small>${l.isi} dari ${l.target} sudah mengisi</small></span>
         <span class="tb"><i style="width:${Math.max(4, (100 * l.kurang) / mx).toFixed(1)}%"></i><em>${l.kurang}</em></span>
       </button>`).join('');
  }

  // ---- progres per wilayah; ikut chip wilayah di atas ----
  function gambarPantau() {
    $('picLegenda').innerHTML = TAHAP.map(([, nm, c, d]) => `<span title="${esc(d)}"><i style="background:${c}"></i>${nm}</span>`).join('');
    const g = new Map();
    for (const l of lokasi) {
      if (areaTop && wil(l) !== areaTop) continue;
      const k = wil(l);
      if (!g.has(k)) g.set(k, { nama: k, lok: 0, lengkap: 0, isi: 0, proses: 0, kosong: 0 });
      const x = g.get(k); x.lok++; x[tahapDari(l.isi, l.target)]++;
    }
    const baris = [...g.values()].sort((a, b) => (b.lok - b.lengkap) - (a.lok - a.lengkap) || a.nama.localeCompare(b.nama));
    $('picBar').innerHTML = baris.length ? baris.map((x) => {
      const belum = x.lok - x.lengkap;
      return `<div class="picrow" style="grid-template-columns:minmax(90px,.5fr) minmax(0,2fr)"><div class="pn"><b>${esc(x.nama)}</b><small>${x.lok} lokasi</small></div>
        <div class="pm"><div class="pb" role="img" aria-label="${x.lengkap} dari ${x.lok} lokasi sudah lengkap">${TAHAP.map(([k, , c]) => (x[k] ? `<i style="width:${((100 * x[k]) / x.lok).toFixed(2)}%;background:${c}"></i>` : '')).join('')}</div>
          <div class="pk"><b>${x.lengkap}</b> dari ${x.lok} lokasi sudah lengkap (${((100 * x.lengkap) / x.lok).toFixed(0)}%) · ${belum ? `<span class="kr">${belum} lokasi belum lengkap</span>` : '<span class="lg">semua sudah lengkap</span>'}</div>
          <div class="pl">${TAHAP.map(([k, nm, c]) => `<span><i style="background:${c}"></i>${x[k]} ${nm.toLowerCase()}</span>`).join('')}</div></div></div>`;
    }).join('') : '<div class="kosongnya">Belum ada data.</div>';
  }

  function ringkasan() {
    const T = lokasi.reduce((a, l) => a + l.target, 0), I = lokasi.reduce((a, l) => a + l.isi, 0), p = T ? (100 * I) / T : 0;
    const C = 2 * Math.PI * 44;
    $('ringhero').innerHTML =
      `<svg viewBox="0 0 110 110" width="100%" height="100%" aria-hidden="true">
         <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6FBDB1"/><stop offset="1" stop-color="#2F7F79"/></linearGradient></defs>
         <circle cx="55" cy="55" r="44" fill="none" stroke="var(--track)" stroke-width="11"/>
         <circle cx="55" cy="55" r="44" fill="none" stroke="url(#gr)" stroke-width="11" stroke-linecap="round"
           stroke-dasharray="${((C * p) / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>
       </svg><div class="t"><b>${p.toFixed(1).replace('.', ',')}%</b><span>sudah mengisi</span></div>`;
    const tj = new Map(TAHAP.map((t) => [t[0], 0]));
    lokasi.forEach((l) => { const k = tahapDari(l.isi, l.target); tj.set(k, tj.get(k) + 1); });
    $('kpi').innerHTML = [
      [idn(lokasi.length), 'lokasi', 'Total lokasi', 'yang dipantau pengisian Google Form', '#5B6577'],
      ...TAHAP.map(([k, nm, c, d]) => [idn(tj.get(k)), 'lokasi', nm, d, c]),
    ].map(([a, u, b, d, c]) => `<div><b>${a}<u>${u}</u></b><span><i style="background:${c}"></i>${b}</span><em>${d}</em></div>`).join('');
    const bsu = lokasi.reduce((a, l) => a + l.ada_bsu, 0);
    $('rabTotal').innerHTML = `${idn(I)} <span style="font-size:.55em;font-weight:500;color:var(--muted)">dari ${idn(T)} peserta · ${idn(bsu)} ada di daftar BSU</span>`;
    let t = `${lokasi.length} lokasi dipantau` + (khusus.length ? ` · ${khusus.length} lokasi khusus tidak dihitung` : '');
    const jw = sinkron && sinkron.jawaban_terakhir ? new Date(sinkron.jawaban_terakhir) : null;
    if (jw) {
      t += ` · data Form terakhir masuk ${jw.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    }
    $('info').textContent = t;
    const sk = sinkron && sinkron.sinkron_terakhir ? new Date(sinkron.sinkron_terakhir) : null;
    const menit = sk ? Math.round((Date.now() - sk.getTime()) / 60000) : null;
    $('segar').textContent = sk ? `Sinkron Google Form terakhir ${menit < 1 ? 'baru saja' : menit + ' menit lalu'}` + (menit >= 20 ? ' (sinkron otomatis mungkin berhenti)' : '') : 'Sinkron Google Form belum pernah berjalan';
    gambarTop();
  }

  // ---- daftar lokasi ----
  function renderPilihWilayah() {
    const el = $('fWil'), cnt = new Map();
    for (const l of semua) cnt.set(wil(l), (cnt.get(wil(l)) || 0) + 1);
    const h = `<option value="">Semua wilayah (${semua.length})</option>` + [...cnt].sort().map(([w, n]) => `<option value="${esc(w)}">${esc(w)} (${n})</option>`).join('');
    if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
    if (fWil && !cnt.has(fWil)) fWil = '';
    el.value = fWil;
  }
  const cocokWil = (l) => !fWil || wil(l) === fWil;
  const urutan = (l) => (l.khusus ? 3 : URUT[l.status]);
  function tersaring() {
    const q = $('cari').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return semua.filter((l) => cocokWil(l) && q.every((w) => l.kunci.includes(w)) && (status === 'semua' || (status === 'khusus' ? l.khusus : l.status === status)))
      .sort((a, b) => (q.length ? a.client.localeCompare(b.client) : urutan(a) - urutan(b) || a.persen - b.persen || a.client.localeCompare(b.client)));
  }
  function renderChips() {
    renderPilihWilayah();
    const dasar = semua.filter(cocokWil), jml = (s) => (s === 'semua' ? dasar.length : s === 'khusus' ? dasar.filter((l) => l.khusus).length : dasar.filter((l) => l.status === s).length);
    $('chips').innerHTML = [['semua', 'Semua'], ['kurang', 'Kurang'], ['kosong', 'Kosong'], ['lengkap', 'Lengkap'], ['khusus', 'Khusus']]
      .map(([s, t]) => `<button class="chip ${status === s ? 'on' : ''}" data-s="${s}">${t} ${jml(s)}</button>`).join('');
  }
  function renderDaftar() {
    const f = tersaring();
    if (!f.some((l) => l.id === sel)) { sel = f.length ? f[0].id : null; fPeserta = ''; muatRincian().then(renderDetail); }
    $('daftar').innerHTML = f.map((l) =>
      `<button class="item ${l.id === sel ? 'sel' : ''}" data-k="${l.id}">
         <div class="nm">${esc(l.client)}</div>
         <div class="picn">${esc(wil(l))}${l.khusus ? ' · ' + esc(KHUSUS_FORM[l.status_form] || l.status_form) : ''}</div>
         <div class="bar ${l.khusus ? '' : NADA[l.status]}"><i style="width:${l.persen}%"></i></div>
         <div class="mt"><span>${l.isi}/${l.target} · ${l.persen}%</span><span>${l.khusus ? 'khusus' : l.kurang > 0 ? 'kurang ' + l.kurang : '✓ lengkap'}</span></div>
       </button>`).join('') || '<div class="kosongnya">Lokasi tidak ditemukan di data acuan.</div>';
    renderChips(); renderDetail();
  }

  // ---- rincian satu lokasi ----
  function tabelPeserta(l) {
    if (!B.admin()) return '<p class="muted">Nama peserta disembunyikan. Masuk dengan akun admin (tombol di kanan atas) untuk melihatnya.</p>';
    const ada = (p) => !!p.jawaban_id;
    const data = peserta.filter((p) => (fPeserta === 'sudah' ? ada(p) : fPeserta === 'belum' ? !ada(p) : fPeserta === 'bsu' ? p.ada_bsu : true));
    if (!data.length) return '<p class="muted">Tidak ada peserta pada pilihan ini.</p>';
    return '<div class="wrap"><table><thead><tr><th>Nama (data acuan)</th><th>Google Form</th><th>Diisi pada</th><th>Nama di Form</th><th>Daftar BSU</th></tr></thead><tbody>' +
      data.map((p) => `<tr><td>${esc(p.nama)}</td><td>${ada(p) ? '<span class="badge ok">Sudah mengisi</span>' : '<span class="badge bad">Belum</span>'}</td>` +
        `<td>${ada(p) ? esc(B.waktu(p.waktu_isi)) : ''}</td>` +
        `<td>${ada(p) && (p.nama_di_form || '').toUpperCase().trim() !== p.nama.toUpperCase().trim() ? esc(p.nama_di_form) : ''}</td>` +
        `<td>${p.ada_bsu ? '<span class="badge ok">Ada</span>' : '-'}</td></tr>`).join('') + '</tbody></table></div>';
  }
  function tabelCek() {
    if (!B.admin() || !cek.length) return '';
    return `<div class="tt"><span>Jawaban Form yang belum dikenali (${cek.length})</span></div><div class="wrap"><table><thead><tr><th>Nama di Form</th><th>Lokasi di Form</th><th>Keterangan</th></tr></thead><tbody>` +
      cek.map((c) => `<tr><td>${esc(c.nama)}</td><td>${esc(c.lokasi_form)}</td><td>${c.cocok === 'cek' ? 'Perlu dicek' : 'NIK tidak ada di data acuan'}</td></tr>`).join('') + '</tbody></table></div>';
  }
  function renderDetail() {
    const el = $('detail'), l = semua.find((x) => x.id === sel);
    el.classList.toggle('open', terbukaHP && !!l);
    if (!l) { el.innerHTML = '<div class="kosongnya">Pilih lokasi di daftar untuk melihat rinciannya.</div>'; return; }
    const warna = l.khusus ? 'warn' : NADA[l.status];
    const awal = l.khusus ? `<b>Lokasi khusus</b><div>${esc(KHUSUS_FORM[l.status_form] || l.status_form)}. Tidak dihitung sebagai "belum mengisi" biasa.</div>`
      : l.status === 'lengkap' ? `<b>✓ Semua peserta sudah mengisi</b><div>${l.target} dari ${l.target} orang.</div>`
      : l.status === 'kosong' ? `<b>⚠ Belum ada yang mengisi</b><div>${l.target} peserta belum mengisi sama sekali.</div>`
      : `<b>⚠ Kekurangan ${l.kurang} orang</b><div>${l.isi} dari ${l.target} peserta baru mengisi.</div>`;
    const bsuInfo = l.status_bsu !== 'ok' ? `<div class="notif warn"><b>${esc(KHUSUS_BSU[l.status_bsu] || l.status_bsu)}</b></div>` : '';
    const baris = (nama, n, t, ok) => `<div class="bagian"><span>${nama}</span><div class="bar ${n >= t ? 'ok' : ok}"><i style="width:${t ? Math.min(100, (100 * n) / t) : 0}%"></i></div>` +
      `<span class="${n >= t ? 'penuh' : 'kurang'}">${n >= t ? '✓ ' + n + '/' + t : 'kurang ' + (t - n) + ' · ' + n + '/' + t}</span></div>`;
    el.innerHTML =
      `<div class="dhead">
         <button class="btn back" id="back">‹ Kembali</button>
         <div class="row"><h2>${esc(l.client)}</h2><span class="badge ${warna}">${l.khusus ? 'Khusus' : LABEL[l.status]} · ${l.persen}%</span></div>
         <div class="muted" style="margin-top:6px">Wilayah: <b style="color:var(--text)">${esc(wil(l))}</b></div>
         <div class="bar ${warna}" style="height:9px;margin-top:12px"><i style="width:${l.persen}%"></i></div>
         ${B.admin() ? '' : '<div class="hint">🔒 Nama peserta tampil setelah login sebagai admin.</div>'}
       </div>
       <div class="dbody">
         <div class="notif ${warna}">${awal}</div>
         ${bsuInfo}
         ${baris('Pengisian Google Form', l.isi, l.target, 'warn')}
         ${baris('Ada di daftar penerima BSU', l.ada_bsu, l.target, 'warn')}
         <div class="tt"><span>Daftar peserta</span>
           <select id="fp"><option value="">Semua peserta</option><option value="sudah"${fPeserta === 'sudah' ? ' selected' : ''}>Sudah mengisi</option><option value="belum"${fPeserta === 'belum' ? ' selected' : ''}>Belum mengisi</option><option value="bsu"${fPeserta === 'bsu' ? ' selected' : ''}>Ada di daftar BSU</option></select></div>
         ${tabelPeserta(l)}
         ${tabelCek()}
       </div>`;
  }

  async function pilih(id) {
    sel = id; fPeserta = ''; terbukaHP = true;
    await muatRincian();
    renderDaftar();
  }

  // ---- login ----
  function labelLogin() {
    $('labelKode').textContent = B.admin() ? 'Nama peserta: terbuka' : 'Nama peserta';
    $('btnKode').textContent = B.admin() ? 'Keluar' : 'Buka (login)';
    $('pesan').textContent = B.user && !B.admin() ? 'Akun ini bukan admin.' : '';
  }
  $('btnKode').onclick = async () => {
    if (B.user) { await B.keluar(); labelLogin(); await muatRincian(); renderDetail(); return; }
    $('galat-masuk').hidden = true; $('in-sandi').value = ''; $('dlg-masuk').showModal(); $('in-email').focus();
  };
  $('batal-masuk').onclick = () => $('dlg-masuk').close();
  $('form-masuk').onsubmit = async (e) => {
    e.preventDefault();
    const tombol = $('ok-masuk'); tombol.disabled = true;
    const { error } = await B.masuk($('in-email').value.trim(), $('in-sandi').value);
    tombol.disabled = false;
    if (error) { const g = $('galat-masuk'); g.textContent = B.galat(error); g.hidden = false; return; }
    $('dlg-masuk').close();
    await B.muatSesi(); labelLogin(); await muatRincian(); renderDetail();
    B.toast('Berhasil masuk.');
  };

  // ---- interaksi ----
  $('cari').oninput = () => { terbukaHP = false; renderDaftar(); };
  $('fWil').onchange = (e) => { fWil = e.target.value; terbukaHP = false; renderDaftar(); };
  $('chips').onclick = (e) => { const s = e.target.dataset && e.target.dataset.s; if (s) { status = s; terbukaHP = false; renderDaftar(); } };
  $('daftar').onclick = (e) => { const b = e.target.closest('.item'); if (b) pilih(Number(b.dataset.k)); };
  $('detail').onclick = (e) => { if (e.target.id === 'back') { terbukaHP = false; renderDetail(); } };
  $('detail').onchange = (e) => { if (e.target.id === 'fp') { fPeserta = e.target.value; renderDetail(); } };
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-href]'); if (go) { location.href = go.dataset.href; return; }
    const c = e.target.closest('#areaChips .chip'); if (c) { areaTop = c.dataset.a; gambarTop(); return; }
    const r = e.target.closest('#topKurang .toprow');
    if (r) { status = 'semua'; $('cari').value = ''; fWil = ''; pilih(Number(r.dataset.k)).then(() => $('bawah').scrollIntoView({ behavior: 'smooth' })); return; }
    const h = e.target.closest('.lipat-h');
    if (h && !e.target.closest('button,a,input,select')) { const el = h.parentElement; const tutup = !el.classList.contains('tutup'); el.classList.toggle('tutup', tutup); h.setAttribute('aria-expanded', String(!tutup)); }
  });
  document.addEventListener('keydown', (e) => { const h = e.target.closest && e.target.closest('.lipat-h'); if (h && (e.key === 'Enter' || e.key === ' ') && e.target === h) { e.preventDefault(); h.click(); } });

  async function segarkan(paksa) {
    const f = document.activeElement;
    if (!paksa && f && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) return;
    try { await muatData(); await muatRincian(); ringkasan(); renderDaftar(); }
    catch (e) { $('info').textContent = 'Data gagal dimuat: ' + B.galat(e) + '. Mencoba lagi…'; }
  }

  (async function mulai() {
    const dariUrl = Number(location.hash.replace(/^#/, ''));
    if (dariUrl) sel = dariUrl;
    await B.muatSesi(); labelLogin();
    try { await muatData(); }
    catch (e) { $('info').textContent = 'Data gagal dimuat: ' + B.galat(e); return; }
    if (sel === null || !semua.some((l) => l.id === sel)) sel = null;
    await muatRincian(); ringkasan(); renderDaftar();
    setInterval(() => segarkan(false), 30000);
  })();
})();
