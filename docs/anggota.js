/* Halaman "Kelola anggota": tambah / hapus anggota secara manual di (1) data Google Form dan (2) data master.
   Semua perubahan lewat fungsi server yang hanya boleh dijalankan admin. */
(function () {
  const B = window.BSU;
  const $ = (id) => document.getElementById(id);
  const esc = B.esc;
  const sb = B.sb;
  const idn = (n) => Number(n || 0).toLocaleString('id-ID');
  const HAL = 25;
  const S = { lokasi: [], namaForm: new Map(), tab: 'form', lf: { cari: '', lok: '', hal: 0, total: 0, dimuat: false }, lm: { cari: '', lok: '', hal: 0, total: 0, dimuat: false }, peserta: new Map(), nikOtomatis: false };

  const digits = (s) => String(s || '').replace(/\D/g, '');
  const mask = (n) => (n && n.length >= 8 ? n.slice(0, 4) + '••••••••' + n.slice(-3) : n || '');
  const opsiLokasi = () => '<option value="">— pilih lokasi —</option>' + S.lokasi.map((l) => `<option value="${l.id}">${esc(l.nama)}</option>`).join('');
  const kutip = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  // baris Form milik satu lokasi: sudah terhubung ke lokasi itu, atau nama lokasi di Form sama dengan nama Form lokasi tsb
  const kondisiLokasi = (id) => { const nf = S.namaForm.get(Number(id)); return 'lokasi_id.eq.' + id + (nf ? ',lokasi_form.ilike.' + kutip(nf) : ''); };
  const opsiFilter = () => '<option value="">Semua lokasi</option>' + S.lokasi.map((l) => `<option value="${l.id}">${esc(l.nama)}</option>`).join('');
  const nilaiLokasi = (q) => S.lokasi.filter((l) => l.nama.toLowerCase().includes(q.toLowerCase())).map((l) => l.id);

  // ---------- umum ----------
  async function lakukan(fn, pesan) {
    try { const r = await fn(); if (r && r.error) throw r.error; if (pesan) B.toast(pesan); return r || {}; }
    catch (e) { B.toast(B.galat(e), true); return null; }
  }
  function pager(el, st, muat) {
    const dari = st.total ? st.hal * HAL + 1 : 0, sampai = Math.min(st.total, st.hal * HAL + HAL);
    el.innerHTML = `<span>${dari}–${sampai} dari ${idn(st.total)}</span><span><button class="btn" data-p="-1" ${st.hal ? '' : 'disabled'}>‹ Sebelumnya</button> <button class="btn" data-p="1" ${sampai >= st.total ? 'disabled' : ''}>Berikutnya ›</button></span>`;
    el.onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { st.hal += Number(b.dataset.p); muat(); } };
  }
  const tunda = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------- DATA GOOGLE FORM ----------
  async function muatFormList() {
    const st = S.lf; const q = B.aman(st.cari);
    let s = sb.from('form_jawaban').select('id,kunci,waktu,lokasi_form,nama,peserta_id', { count: 'exact' }).eq('dibatalkan', false).eq('hilang', false);
    const cariF = 'or(nama.ilike.%' + q + '%,lokasi_form.ilike.%' + q + '%)';
    if (st.lok && q) s = s.or('and(or(' + kondisiLokasi(st.lok) + '),' + cariF + ')');
    else if (st.lok) s = s.or(kondisiLokasi(st.lok));
    else if (q) s = s.or('nama.ilike.%' + q + '%,lokasi_form.ilike.%' + q + '%');
    const { data, count, error } = await s.order('waktu', { ascending: false, nullsFirst: false }).range(st.hal * HAL, st.hal * HAL + HAL - 1);
    if (error) { $('lf-isi').innerHTML = `<tr><td colspan="6" class="kosong-t">Gagal dimuat: ${esc(B.galat(error))}</td></tr>`; return; }
    st.total = count || 0; st.dimuat = true;
    $('lf-isi').innerHTML = (data || []).map((r) =>
      `<tr><td><b>${esc(r.nama)}</b></td><td>${esc(r.lokasi_form || '')}</td><td>${esc(B.waktu(r.waktu))}</td>
        <td>${String(r.kunci).startsWith('manual:') ? '<span class="tag-a manual">Manual</span>' : '<span class="tag-a">Google Form</span>'}</td>
        <td>${r.peserta_id ? '<span class="tag-a ok">Ya</span>' : '<span class="tag-a bad">Belum</span>'}</td>
        <td><button class="btn bahaya" data-hapus-form="${r.id}" data-nama="${esc(r.nama)}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="6" class="kosong-t">Tidak ada anggota.</td></tr>';
    pager($('lf-pager'), st, muatFormList);
    tampilInfo();
  }

  async function muatNamaMaster() {
    const lok = Number($('ff-lokasi').value);
    S.peserta = new Map(); $('dl-nama').innerHTML = '';
    if (!lok) return;
    const { data } = await sb.from('peserta').select('id,nama').eq('lokasi_id', lok).eq('aktif', true).order('nama');
    (data || []).forEach((p) => S.peserta.set(p.nama.trim().toUpperCase(), p.id));
    $('dl-nama').innerHTML = (data || []).map((p) => `<option value="${esc(p.nama)}">`).join('');
  }
  async function cekNama() {
    const id = S.peserta.get($('ff-nama').value.trim().toUpperCase());
    const nik = $('ff-nik'), cat = $('ff-catatan');
    if (id) {
      const { data } = await sb.from('peserta_sensitif').select('nik').eq('peserta_id', id).maybeSingle();
      if (data && data.nik) { nik.value = data.nik; nik.classList.add('ok'); S.nikOtomatis = true; cat.classList.add('ok'); cat.textContent = 'Ditemukan di data master: NIK terisi otomatis dan anggota akan langsung terhitung "sudah mengisi".'; return; }
    }
    if (S.nikOtomatis) { nik.value = ''; S.nikOtomatis = false; }
    nik.classList.remove('ok'); cat.classList.remove('ok');
    cat.textContent = 'NIK terisi otomatis bila nama dipilih dari data master. Tanpa NIK, anggota baru terhitung "sudah mengisi" bila namanya persis sama dengan data master.';
  }
  async function kirimForm(e) {
    e.preventDefault();
    const lok = Number($('ff-lokasi').value), nama = $('ff-nama').value.trim(), nik = digits($('ff-nik').value);
    if (!lok) return B.toast('Pilih lokasi.', true);
    if (!nama) return B.toast('Nama tidak boleh kosong.', true);
    if (nik && nik.length !== 16) return B.toast('NIK harus 16 angka, atau dikosongkan.', true);
    const t = $('ff-simpan'); t.disabled = true;
    const r = await lakukan(() => sb.rpc('tambah_anggota_form', { p_nama: nama, p_lokasi: lok, p_nik: nik, p_hp: $('ff-hp').value, p_no_rek: $('ff-rek').value, p_nama_rek: $('ff-namarek').value }));
    t.disabled = false;
    if (!r) return;
    const d = r.data || {};
    B.toast(d.tertaut ? nama + ' ditambahkan dan terhubung ke data master (' + d.peserta + ').' : nama + ' ditambahkan, tetapi belum terhubung ke data master, jadi belum terhitung "sudah mengisi".', !d.tertaut);
    ['ff-nama', 'ff-hp', 'ff-rek', 'ff-namarek', 'ff-nik'].forEach((i) => { $(i).value = ''; });
    $('ff-nik').classList.remove('ok'); S.nikOtomatis = false;
    S.lf.hal = 0; muatFormList();
  }

  // ---------- DATA MASTER ----------
  async function muatMasterList() {
    const st = S.lm; const q = B.aman(st.cari);
    let s = sb.from('peserta').select('id,nama,lokasi_id', { count: 'exact' }).eq('aktif', true);
    if (st.lok) s = s.eq('lokasi_id', Number(st.lok));
    if (digits(q).length === 16 && digits(q) === q) {
      const a = await sb.from('peserta_sensitif').select('peserta_id').eq('nik', q);
      const ids = (a.data || []).map((x) => x.peserta_id);
      s = s.in('id', ids.length ? ids : [0]);
    } else if (q) {
      const li = nilaiLokasi(q);
      s = s.or('nama.ilike.%' + q + '%' + (li.length ? ',lokasi_id.in.(' + li.join(',') + ')' : ''));
    }
    const { data, count, error } = await s.order('nama').range(st.hal * HAL, st.hal * HAL + HAL - 1);
    if (error) { $('lm-isi').innerHTML = `<tr><td colspan="5" class="kosong-t">Gagal dimuat: ${esc(B.galat(error))}</td></tr>`; return; }
    st.total = count || 0; st.dimuat = true;
    const ids = (data || []).map((r) => r.id);
    const [n, f] = ids.length ? await Promise.all([
      sb.from('peserta_sensitif').select('peserta_id,nik').in('peserta_id', ids),
      sb.from('form_jawaban').select('peserta_id').in('peserta_id', ids).eq('dibatalkan', false).eq('hilang', false),
    ]) : [{ data: [] }, { data: [] }];
    const nik = new Map((n.data || []).map((x) => [x.peserta_id, x.nik])), isi = new Set((f.data || []).map((x) => x.peserta_id));
    const lok = new Map(S.lokasi.map((l) => [l.id, l.nama]));
    $('lm-isi').innerHTML = (data || []).map((r) =>
      `<tr><td><b>${esc(r.nama)}</b></td><td>${esc(lok.get(r.lokasi_id) || '')}</td><td><span class="mono">${esc(mask(nik.get(r.id)))}</span></td>
        <td>${isi.has(r.id) ? '<span class="tag-a ok">Sudah</span>' : '<span class="tag-a">Belum</span>'}</td>
        <td><button class="btn bahaya" data-hapus-master="${r.id}" data-nama="${esc(r.nama)}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="kosong-t">Tidak ada anggota.</td></tr>';
    pager($('lm-pager'), st, muatMasterList);
    tampilInfo();
  }
  async function kirimMaster(e) {
    e.preventDefault();
    const lok = Number($('fm-lokasi').value), nama = $('fm-nama').value.trim(), nik = digits($('fm-nik').value);
    if (!lok) return B.toast('Pilih lokasi.', true);
    if (!nama) return B.toast('Nama tidak boleh kosong.', true);
    if (nik.length !== 16) return B.toast('NIK harus 16 angka.', true);
    const t = $('fm-simpan'); t.disabled = true;
    const r = await lakukan(() => sb.rpc('tambah_anggota_master', { p_nama: nama, p_lokasi: lok, p_nik: nik }), nama + ' ditambahkan ke data master.');
    t.disabled = false;
    if (!r) return;
    $('fm-nama').value = ''; $('fm-nik').value = ''; hitungNik();
    S.lm.hal = 0; muatMasterList();
  }
  function hitungNik() {
    const v = digits($('fm-nik').value); $('fm-nik').value = v;
    $('fm-hitung').textContent = v.length + '/16';
    $('fm-nik').classList.toggle('ok', v.length === 16); $('fm-nik').classList.toggle('salah', v.length > 0 && v.length < 16 && document.activeElement !== $('fm-nik'));
  }

  // ---------- tab, info, masuk ----------
  function tampilInfo() {
    const st = S.tab === 'form' ? S.lf : S.lm;
    const lok = st.lok ? (S.lokasi.find((l) => String(l.id) === String(st.lok)) || {}).nama : '';
    $('info').textContent = (S.tab === 'form' ? 'Data Google Form: ' : 'Data master: ') + idn(st.total) + ' anggota' + (lok ? ' di ' + lok : '');
  }
  function pilihTab(t) {
    S.tab = t;
    document.querySelectorAll('#subtabs .chip').forEach((c) => c.classList.toggle('on', c.dataset.tab === t));
    $('tab-form').hidden = t !== 'form'; $('tab-master').hidden = t !== 'master';
    const st = t === 'form' ? S.lf : S.lm;
    if (!st.dimuat) (t === 'form' ? muatFormList : muatMasterList)(); else tampilInfo();
  }
  function gambarAkun() {
    $('akun').innerHTML = B.user
      ? '<div class="kode card" style="border-radius:99px"><span>' + esc(B.user.email) + '</span><button class="btn" id="b-keluar">Keluar</button></div>'
      : '<div class="kode card" style="border-radius:99px"><span>Belum masuk</span><button class="btn" id="b-masuk">Masuk</button></div>';
  }
  function gerbang() {
    $('isi').hidden = true; $('subtabs').hidden = true; $('gerbang').hidden = false;
    const adaAkun = B.user && !B.admin();
    $('gerbang').innerHTML = '<div class="card gerbang"><b>' + (adaAkun ? 'Akun ini bukan admin' : 'Perlu masuk') + '</b><p>' +
      (adaAkun ? 'Halaman ini hanya untuk akun admin. Minta pengelola sistem mendaftarkan email Anda sebagai admin.' : 'Halaman ini hanya untuk admin yang sudah login.') + '</p>' +
      (adaAkun ? '' : '<button class="btn utama" id="b-masuk2">Masuk</button>') + '</div>';
    $('info').textContent = adaAkun ? 'Tidak ada akses' : 'Silakan masuk';
  }
  function bukaMasuk() { $('galat-masuk').hidden = true; $('in-sandi').value = ''; $('dlg-masuk').showModal(); $('in-email').focus(); }

  async function mulai() {
    await B.muatSesi(); gambarAkun();
    if (!B.admin()) return gerbang();
    $('gerbang').hidden = true; $('isi').hidden = false; $('subtabs').hidden = false;
    S.lf = { cari: '', lok: '', hal: 0, total: 0, dimuat: false }; S.lm = { cari: '', lok: '', hal: 0, total: 0, dimuat: false };
    try { S.lokasi = await B.semua(() => sb.from('lokasi').select('id,nama').order('nama')); }
    catch (e) { $('info').textContent = 'Data gagal dimuat: ' + B.galat(e); return; }
    try { const pm = await B.semua(() => sb.from('pemetaan_lokasi').select('lokasi_id,nama_form')); S.namaForm = new Map(pm.filter((x) => x.nama_form).map((x) => [x.lokasi_id, x.nama_form])); } catch (e) { S.namaForm = new Map(); }
    $('ff-lokasi').innerHTML = opsiLokasi(); $('fm-lokasi').innerHTML = opsiLokasi();
    $('lf-lok').innerHTML = opsiFilter(); $('lm-lok').innerHTML = opsiFilter();
    pilihTab(S.tab);
  }

  document.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-href]'); if (go) { location.href = go.dataset.href; return; }
    if (e.target.closest('#b-masuk, #b-masuk2')) return bukaMasuk();
    if (e.target.closest('#b-keluar')) { await B.keluar(); return mulai(); }
    const tab = e.target.closest('#subtabs [data-tab]'); if (tab) return pilihTab(tab.dataset.tab);
    const hf = e.target.closest('[data-hapus-form]');
    if (hf) {
      if (!confirm('Hapus "' + hf.dataset.nama + '" dari data Google Form?\n\nDatanya tidak lagi dihitung. Spreadsheet Google Form tidak ikut berubah.')) return;
      if (await lakukan(() => sb.rpc('hapus_anggota_form', { p_jawaban: Number(hf.dataset.hapusForm) }), '"' + hf.dataset.nama + '" dihapus dari data Google Form.')) muatFormList();
    }
    const hm = e.target.closest('[data-hapus-master]');
    if (hm) {
      if (!confirm('Hapus "' + hm.dataset.nama + '" dari data master?\n\nJawaban Form dan data BSU atas nama ini tidak ikut terhapus, tetapi tidak lagi terhubung ke data master.')) return;
      if (await lakukan(() => sb.rpc('hapus_anggota_master', { p_peserta: Number(hm.dataset.hapusMaster) }), '"' + hm.dataset.nama + '" dihapus dari data master.')) muatMasterList();
    }
  });
  $('f-form').onsubmit = kirimForm; $('f-master').onsubmit = kirimMaster;
  $('ff-lokasi').onchange = async () => { S.nikOtomatis = false; $('ff-nik').value = ''; $('ff-nik').classList.remove('ok'); await muatNamaMaster(); };
  $('ff-nama').addEventListener('input', tunda(cekNama, 250)); $('ff-nama').addEventListener('change', cekNama);
  $('ff-nik').addEventListener('input', (e) => { e.target.value = digits(e.target.value); if (S.nikOtomatis) { S.nikOtomatis = false; e.target.classList.remove('ok'); } });
  $('fm-nik').addEventListener('input', hitungNik); $('fm-nik').addEventListener('blur', hitungNik);
  $('lf-cari').oninput = tunda((e) => { S.lf.cari = e.target.value; S.lf.hal = 0; muatFormList(); });
  $('lm-cari').oninput = tunda((e) => { S.lm.cari = e.target.value; S.lm.hal = 0; muatMasterList(); });
  $('lf-lok').onchange = (e) => { S.lf.lok = e.target.value; S.lf.hal = 0; muatFormList(); };
  $('lm-lok').onchange = (e) => { S.lm.lok = e.target.value; S.lm.hal = 0; muatMasterList(); };
  $('batal-masuk').onclick = () => $('dlg-masuk').close();
  $('form-masuk').onsubmit = async (e) => {
    e.preventDefault();
    const t = $('ok-masuk'); t.disabled = true;
    const { error } = await B.masuk($('in-email').value.trim(), $('in-sandi').value);
    t.disabled = false;
    if (error) { const g = $('galat-masuk'); g.textContent = B.galat(error); g.hidden = false; return; }
    $('dlg-masuk').close(); B.toast('Berhasil masuk.'); mulai();
  };
  mulai();
})();
