/* Halaman "Perlu tindakan": ketidakcocokan jawaban Google Form dan data penerima BSU terhadap data acuan,
   digabung per orang. Setiap orang diselesaikan dengan satu tindakan; semua tindakan dijalankan di server (fungsi admin). */
(function () {
  const B = window.BSU;
  const $ = (id) => document.getElementById(id);
  const esc = B.esc;
  const sb = B.sb;
  const idn = (n) => Number(n || 0).toLocaleString('id-ID');

  const MASALAH = {
    nik_tidak_ada: { judul: 'NIK belum ada di acuan', pendek: 'NIK tidak ada di acuan' },
    nik_ganda: { judul: 'NIK ganda di acuan', pendek: 'NIK ganda di acuan' },
    tanpa_nik: { judul: 'NIK kosong atau salah', pendek: 'NIK kosong / salah' },
    lokasi_belum: { judul: 'Lokasi Form belum dipetakan', pendek: 'Lokasi belum dipetakan' },
    beda_lokasi: { judul: 'Lokasi berbeda dari acuan', pendek: 'Lokasi berbeda' },
  };
  const URUT = { nik_tidak_ada: 0, nik_ganda: 1, tanpa_nik: 2, lokasi_belum: 3, beda_lokasi: 4 };

  let items = [], lokasiAcuan = [], sel = null, fMasalah = '', fSumber = '', cari = '', opsi = null, det = null, token = 0;

  const digits = (s) => String(s || '').replace(/\D/g, '');
  const nikValid = (s) => /^\d{16}$/.test(digits(s)) && digits(s) === String(s || '').trim();
  const nikDiff = (a, b) => {
    const x = digits(a), y = digits(b);
    return [...x].map((c, i) => (c === y[i] ? c : '<span class="x">' + c + '</span>')).join('') + (y.length > x.length ? '<span class="x">' + '_'.repeat(y.length - x.length) + '</span>' : '');
  };
  const jumlahBeda = (a, b) => { const x = digits(a), y = digits(b); let n = Math.abs(x.length - y.length); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++; return n; };
  const lokasiTeks = (r) => r.lokasi_nama || r.lokasi_form || r.folder_bsu || '(lokasi belum diketahui)';

  // ---------- data ----------
  async function muat() {
    const rows = await B.semua(() => sb.from('v_perlu_tindakan_admin').select('*'));
    items = rows.sort((a, b) => URUT[a.masalah] - URUT[b.masalah] || lokasiTeks(a).localeCompare(lokasiTeks(b)) || a.nama.localeCompare(b.nama));
    $('info').textContent = items.length
      ? idn(items.length) + ' orang perlu diputuskan · diperbarui ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : 'Semua data sudah cocok. Tidak ada yang perlu ditindaklanjuti.';
  }
  async function muatLokasi() {
    if (!lokasiAcuan.length) lokasiAcuan = await B.semua(() => sb.from('lokasi').select('id,nama').order('nama'));
  }

  function tersaring() {
    const q = cari.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((r) => {
      if (fMasalah && r.masalah !== fMasalah) return false;
      if (fSumber === 'form' && !(r.ada_form && !r.ada_bsu)) return false;
      if (fSumber === 'bsu' && !(r.ada_bsu && !r.ada_form)) return false;
      if (fSumber === 'dua' && !(r.ada_form && r.ada_bsu)) return false;
      const teks = (r.nama + ' ' + lokasiTeks(r) + ' ' + (r.lokasi_form || '') + ' ' + (r.folder_bsu || '')).toLowerCase();
      return q.every((k) => teks.includes(k));
    });
  }

  // ---------- ringkasan ----------
  function gambarRingkasan() {
    $('rtTotal').textContent = idn(items.length);
    const n = (m) => items.filter((r) => r.masalah === m).length;
    $('rtBagi').innerHTML = Object.keys(MASALAH).filter((m) => n(m) > 0).map((m) =>
      `<button data-m="${m}" class="${fMasalah === m ? 'on' : ''}"><b>${idn(n(m))}</b><span>${MASALAH[m].judul}</span></button>`).join('');
    $('chips').hidden = true;
  }

  // ---------- daftar ----------
  function gambarDaftar() {
    const f = tersaring();
    if (!f.some((r) => r.kunci === sel)) { sel = f.length ? f[0].kunci : null; opsi = null; det = null; if (sel) muatDetail(); }
    $('daftar').innerHTML = f.map((r) =>
      `<button class="item ${r.kunci === sel ? 'sel' : ''}" data-k="${esc(r.kunci)}">
         <div class="nm">${esc(r.nama)}</div>
         <div class="picn">${esc(lokasiTeks(r))}</div>
         <div class="sumber">${r.ada_form ? '<span class="tag-s form">Form</span>' : ''}${r.ada_bsu ? '<span class="tag-s bsu">BSU</span>' : ''}</div>
         <div class="mt"><span class="masalah-s">${MASALAH[r.masalah].pendek}</span><span></span></div>
       </button>`).join('') || '<div class="kosongnya">' + (items.length ? 'Tidak ada yang cocok dengan pencarian ini.' : 'Tidak ada yang perlu ditindaklanjuti. 🎉') + '</div>';
    gambarRingkasan();
    gambarDetail();
  }

  // ---------- rincian ----------
  const itemSel = () => items.find((r) => r.kunci === sel);

  async function muatDetail() {
    const it = itemSel(); if (!it) return;
    const t = ++token;
    const [f, b, fn, bn] = await Promise.all([
      it.jawaban_id ? sb.from('form_jawaban').select('nama,lokasi_form,waktu').eq('id', it.jawaban_id).maybeSingle() : null,
      it.bsu_id ? sb.from('bsu_penerima').select('nama,folder').eq('id', it.bsu_id).maybeSingle() : null,
      it.jawaban_id ? sb.from('form_sensitif').select('nik').eq('jawaban_id', it.jawaban_id).maybeSingle() : null,
      it.bsu_id ? sb.from('bsu_sensitif').select('nik').eq('penerima_id', it.bsu_id).maybeSingle() : null,
    ]);
    if (t !== token || sel !== it.kunci) return;
    det = { form: f && f.data ? { ...f.data, nik: fn && fn.data ? fn.data.nik : '' } : null, bsu: b && b.data ? { ...b.data, nik: bn && bn.data ? bn.data.nik : '' } : null };
    gambarDetail();
  }
  const nikRekam = () => (det && ((det.form && nikValid(det.form.nik) && det.form.nik) || (det.bsu && nikValid(det.bsu.nik) && det.bsu.nik))) || '';
  const nikTampil = () => (det && ((det.form && det.form.nik) || (det.bsu && det.bsu.nik))) || '';

  function kalimat(it) {
    const nik = nikTampil() ? '<b class="mono">' + esc(nikTampil()) + '</b>' : 'NIK';
    switch (it.masalah) {
      case 'nik_tidak_ada': return `<b>NIK belum ada di data acuan.</b><div>NIK ${nik} tidak ditemukan di data acuan. Kemungkinan NIK salah ketik, atau orang ini memang belum tercatat di acuan.</div>`;
      case 'nik_ganda': return `<b>NIK ini terdaftar pada lebih dari satu orang di acuan.</b><div>Sistem tidak bisa memilih otomatis. Pilih orang yang benar.</div>`;
      case 'tanpa_nik': return `<b>NIK kosong atau bukan 16 angka.</b><div>Tanpa NIK yang benar, sistem tidak bisa mencocokkan otomatis. Pilih orangnya dari acuan, atau abaikan.</div>`;
      case 'lokasi_belum': return `<b>Lokasi ini belum ada di pemetaan.</b><div>Lokasi &ldquo;${esc(it.lokasi_form || '')}&rdquo; yang dipilih di Form belum dihubungkan ke lokasi di data acuan.</div>`;
      default: return `<b>NIK cocok, tetapi lokasinya berbeda.</b><div>${esc(it.peserta_nama)} di acuan berada di <b>${esc(it.lokasi_nama || '-')}</b>, sedangkan di data masuk tertulis <b>${esc(it.lokasi_form || it.folder_bsu || '-')}</b>.</div>`;
    }
  }

  function kotakData() {
    const it = itemSel();
    const lb = (t, v) => `<dt>${t}</dt><dd>${v}</dd>`;
    const f = det && det.form, b = det && det.bsu;
    const form = it.ada_form ? (det ? `<dl>${lb('Nama', esc(f ? f.nama : it.nama))}${lb('Lokasi', esc(f ? f.lokasi_form : it.lokasi_form))}${lb('NIK', f && f.nik ? '<span class="mono">' + esc(f.nik) + '</span>' : '<i>kosong</i>')}${lb('Diisi', f && f.waktu ? esc(B.waktu(f.waktu)) : '-')}</dl>` : '<div class="kosong-s">Memuat…</div>')
      : '<div class="kosong-s">Orang ini tidak ada di Google Form.</div>';
    const bsu = it.ada_bsu ? (det ? `<dl>${lb('Nama', esc(b ? b.nama : it.nama))}${lb('Lokasi', esc(b ? b.folder : it.folder_bsu))}${lb('NIK', b && b.nik ? '<span class="mono">' + esc(b.nik) + '</span>' : '<i>kosong</i>')}</dl>` : '<div class="kosong-s">Memuat…</div>')
      : '<div class="kosong-s">Orang ini tidak ada di data penerima BSU.</div>';
    return `<div class="dua-data"><div><h4>Dari Google Form</h4>${form}</div><div><h4>Dari data penerima BSU</h4>${bsu}</div></div>`;
  }

  function opsiHtml(it) {
    const o = (k, no, j, s, mati) => `<button class="opsi ${opsi === k ? 'on' : ''}" data-o="${k}" ${mati ? 'disabled' : ''}><span class="no">${no}</span><span><b>${j}</b><small>${s}</small></span></button>`;
    if (it.masalah === 'lokasi_belum') return o('petakan', 1, 'Hubungkan ke lokasi di data acuan', 'Pilih lokasi acuan untuk nama lokasi di Form ini.');
    if (it.masalah === 'beda_lokasi') return o('benar', 1, 'Lokasi di data acuan sudah benar', 'Tidak ada yang diubah. Perbedaan lokasi ini dianggap sudah dicek.') +
      o('pindah', 2, 'Pindahkan orang ini ke lokasi baru di data acuan', it.lokasi_form_nama ? 'Lokasi di acuan diubah menjadi ' + esc(it.lokasi_form_nama) + '.' : 'Lokasi baru belum bisa ditentukan dari pemetaan.', !it.lokasi_form_id);
    const bisaBaru = !!nikRekam();
    return o('ada', 1, 'Orang ini sudah ada di data acuan', 'NIK atau nama salah ketik. Pilih orangnya dari saran.') +
      o('baru', 2, 'Orang baru, tambahkan ke data acuan', bisaBaru ? 'Dibuat sebagai peserta baru dengan NIK dari data ini.' : (det ? 'Tidak bisa: NIK harus 16 angka.' : 'Memuat…'), !bisaBaru) +
      o('abaikan', 3, 'Bukan peserta, abaikan', 'Tidak dihitung dan tidak muncul lagi di daftar ini.');
  }

  function panelHtml(it) {
    if (!opsi) return '';
    if (opsi === 'ada') return `<div class="panel-opsi"><div class="judul-t">Saran dari data acuan${it.lokasi_nama ? ' (lokasi ' + esc(it.lokasi_nama) + ')' : ''}</div><div id="saran"><div class="kosongnya-s">Mencari…</div></div>
      <div class="cari-lain"><label>Cari orang lain di data acuan (nama atau NIK)<input id="cariLain" placeholder="Ketik minimal 3 huruf, atau 16 angka NIK" autocomplete="off"></label><div id="hasilLain"></div></div></div>`;
    if (opsi === 'baru') return `<div class="panel-opsi"><div class="peringatan-t">Orang ini akan ikut dihitung sebagai target pengisian di lokasi yang dipilih.</div>
      <label>Nama<input id="bNama" value="${esc(it.nama)}"></label>
      <label>Lokasi di data acuan<select id="bLokasi"><option value="">— pilih lokasi —</option>${lokasiAcuan.map((l) => `<option value="${l.id}" ${l.id === it.lokasi_id ? 'selected' : ''}>${esc(l.nama)}</option>`).join('')}</select></label>
      <label>NIK<input readonly class="mono" value="${esc(nikRekam())}"></label>
      <div class="aksi-bawah"><button class="btn utama" id="goBaru">Tambahkan ke data acuan</button></div></div>`;
    if (opsi === 'abaikan') return `<div class="panel-opsi"><p style="margin:0 0 4px">Orang ini <b>tidak dihitung</b> sebagai peserta dan tidak akan muncul lagi di daftar ini. Data aslinya tidak dihapus.</p><div class="aksi-bawah"><button class="btn bahaya" id="goAbaikan">Abaikan orang ini</button></div></div>`;
    if (opsi === 'petakan') return `<div class="panel-opsi"><label>Lokasi &ldquo;${esc(it.lokasi_form || '')}&rdquo; sama dengan lokasi acuan:
      <select id="pLokasi"><option value="">— pilih lokasi —</option>${lokasiAcuan.map((l) => `<option value="${l.id}">${esc(l.nama)}</option>`).join('')}</select></label>
      <div class="aksi-bawah"><button class="btn utama" id="goPetakan">Hubungkan lokasi</button></div></div>`;
    if (opsi === 'benar') return `<div class="panel-opsi"><p style="margin:0">Lokasi di acuan (<b>${esc(it.lokasi_nama || '-')}</b>) dianggap benar dan perbedaan ini tidak ditampilkan lagi.</p><div class="aksi-bawah"><button class="btn utama" id="goBenar">Ya, sudah benar</button></div></div>`;
    if (opsi === 'pindah') return `<div class="panel-opsi"><p style="margin:0"><b>${esc(it.peserta_nama)}</b> akan dipindah dari <b>${esc(it.lokasi_nama || '-')}</b> ke <b>${esc(it.lokasi_form_nama || '-')}</b> di data acuan.</p><div class="aksi-bawah"><button class="btn utama" id="goPindah">Pindahkan</button></div></div>`;
    return '';
  }

  function gambarDetail() {
    const el = $('detail'), it = itemSel();
    if (!it) { el.innerHTML = '<div class="kosongnya">Pilih seseorang di daftar untuk melihat rinciannya.</div>'; return; }
    el.innerHTML = `<div class="dhead"><div class="row"><h2>${esc(it.nama)}</h2><span class="badge warn">${MASALAH[it.masalah].pendek}</span></div>
        <div class="muted" style="margin-top:6px">${esc(lokasiTeks(it))}</div></div>
      <div class="dbody"><div class="notif warn">${kalimat(it)}</div>${kotakData()}
        <div class="judul-t">Apa yang mau dilakukan?</div><div class="opsi-baris">${opsiHtml(it)}</div><div id="panel">${panelHtml(it)}</div></div>`;
    if (opsi === 'ada') muatSaran();
  }

  // ---------- saran pasangan ----------
  async function barisSaran(list) {
    if (!list.length) return '<div class="kosongnya-s">Tidak ada yang cocok.</div>';
    const ids = list.map((s) => s.id);
    const { data } = await sb.from('peserta_sensitif').select('peserta_id,nik').in('peserta_id', ids);
    const nik = new Map((data || []).map((x) => [x.peserta_id, x.nik]));
    const rek = nikTampil();
    return list.map((s) => {
      const n = nik.get(s.id) || '', d = rek && n ? jumlahBeda(rek, n) : null;
      return `<div class="saran"><div><div class="nm-s">${esc(s.nama)}</div><div class="sb-s">${esc(s.lokasi || '')}${s.skor != null ? ' · nama mirip ' + Math.round(s.skor * 100) + '%' : ''}</div>
        <div class="nik-s">NIK acuan: <span class="mono">${rek && n ? nikDiff(n, rek) : esc(n)}</span>${d !== null ? (d === 0 ? ' <span class="cocok-s">sama persis</span>' : ' <span class="sb-s">(' + d + ' angka berbeda dari data ini)</span>') : ''}</div></div>
        <button class="btn utama" data-pasang="${s.id}" data-nama="${esc(s.nama)}">Pasangkan</button></div>`;
    }).join('');
  }
  async function muatSaran() {
    const it = itemSel(); const t = token;
    const r = await sb.rpc('saran_peserta', { p_nama: it.nama, p_lokasi: it.lokasi_id ? [it.lokasi_id] : null, p_batas: 6 });
    const box = $('saran'); if (!box || sel !== it.kunci || opsi !== 'ada') return;
    if (r.error) { box.innerHTML = '<div class="kosongnya-s">Saran gagal dimuat: ' + esc(B.galat(r.error)) + '</div>'; return; }
    box.innerHTML = await barisSaran((r.data || []).map((s) => ({ id: s.peserta_id, nama: s.nama, lokasi: s.lokasi, skor: s.skor })));
  }
  let tmLain;
  async function cariLain(q) {
    const box = $('hasilLain'); if (!box) return;
    q = q.trim();
    if (digits(q).length === 16 && digits(q) === q) {
      const a = await sb.from('peserta_sensitif').select('peserta_id').eq('nik', q);
      const ids = (a.data || []).map((x) => x.peserta_id);
      if (!ids.length) { box.innerHTML = '<div class="kosongnya-s">NIK itu tidak ada di data acuan.</div>'; return; }
      const p = await sb.from('v_peserta_staff').select('id,nama,lokasi').in('id', ids);
      box.innerHTML = await barisSaran((p.data || []).map((x) => ({ id: x.id, nama: x.nama, lokasi: x.lokasi })));
    } else if (q.length >= 3) {
      const p = await sb.from('v_peserta_staff').select('id,nama,lokasi').ilike('nama', '%' + B.aman(q) + '%').order('nama').limit(8);
      box.innerHTML = await barisSaran((p.data || []).map((x) => ({ id: x.id, nama: x.nama, lokasi: x.lokasi })));
    } else box.innerHTML = '';
  }

  // ---------- tindakan ----------
  async function jalankan(fn, pesan) {
    const idx = tersaring().findIndex((r) => r.kunci === sel);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      B.toast(pesan);
    } catch (e) { B.toast(B.galat(e), true); return; }
    await muat();
    opsi = null; det = null;
    const f = tersaring();
    sel = f.length ? f[Math.min(idx, f.length - 1)].kunci : null;
    if (sel) muatDetail();
    gambarDaftar();
  }
  const ids = () => { const it = itemSel(); return { p_jawaban: it.jawaban_id || null, p_bsu: it.bsu_id || null }; };

  async function aksi(e) {
    const it = itemSel(); if (!it) return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.o) { opsi = opsi === t.dataset.o ? null : t.dataset.o; if (opsi === 'baru' || opsi === 'petakan') await muatLokasi(); gambarDetail(); return; }
    if (t.dataset.pasang) {
      if (!confirm('Pasangkan "' + it.nama + '" ke "' + t.dataset.nama + '" di data acuan?')) return;
      return jalankan(() => sb.rpc('pasangkan_orang', { ...ids(), p_peserta: Number(t.dataset.pasang) }), 'Dipasangkan ke ' + t.dataset.nama + '.');
    }
    if (t.id === 'goBaru') {
      const nama = $('bNama').value.trim(), lok = Number($('bLokasi').value);
      if (!nama) return B.toast('Nama tidak boleh kosong.', true);
      if (!lok) return B.toast('Pilih lokasi di data acuan.', true);
      return jalankan(() => sb.rpc('tambah_ke_acuan', { ...ids(), p_nama: nama, p_lokasi: lok }), nama + ' ditambahkan ke data acuan.');
    }
    if (t.id === 'goAbaikan') {
      if (!confirm('Abaikan "' + it.nama + '"? Orang ini tidak akan dihitung sebagai peserta.')) return;
      return jalankan(() => sb.rpc('abaikan_orang', ids()), 'Diabaikan.');
    }
    if (t.id === 'goPetakan') {
      const lok = Number($('pLokasi').value);
      if (!lok) return B.toast('Pilih lokasi di data acuan.', true);
      return jalankan(() => sb.rpc('petakan_lokasi_form', { p_nama_form: it.lokasi_form, p_lokasi: lok }), 'Lokasi dihubungkan dan data dicocokkan ulang.');
    }
    if (t.id === 'goBenar') return jalankan(() => sb.rpc('tandai_lokasi_benar', ids()), 'Ditandai sudah benar.');
    if (t.id === 'goPindah') {
      if (!confirm('Pindahkan "' + it.peserta_nama + '" ke "' + it.lokasi_form_nama + '" di data acuan?')) return;
      return jalankan(() => sb.rpc('pindah_lokasi_peserta', { p_peserta: it.peserta_id, p_lokasi: it.lokasi_form_id }), 'Dipindahkan.');
    }
  }

  // ---------- masuk ----------
  function gambarAkun() {
    $('akun').innerHTML = B.user
      ? '<div class="kode card" style="border-radius:99px"><span>' + esc(B.user.email) + '</span><button class="btn" id="b-muat">Muat ulang</button><button class="btn" id="b-keluar">Keluar</button></div>'
      : '<div class="kode card" style="border-radius:99px"><span>Belum masuk</span><button class="btn" id="b-masuk">Masuk</button></div>';
  }
  function gerbang() {
    $('isi').hidden = true; $('gerbang').hidden = false;
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
    $('gerbang').hidden = true; $('isi').hidden = false;
    try { await Promise.all([muat(), muatLokasi()]); }
    catch (e) { $('info').textContent = 'Data gagal dimuat: ' + B.galat(e); return; }
    gambarDaftar();
  }

  document.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-href]'); if (go) { location.href = go.dataset.href; return; }
    if (e.target.closest('#b-masuk, #b-masuk2')) return bukaMasuk();
    if (e.target.closest('#b-keluar')) { await B.keluar(); sel = null; items = []; return mulai(); }
    if (e.target.closest('#b-muat')) { await muat(); gambarDaftar(); return B.toast('Daftar dimuat ulang.'); }
    const m = e.target.closest('#rtBagi button'); if (m) { fMasalah = fMasalah === m.dataset.m ? '' : m.dataset.m; opsi = null; return gambarDaftar(); }
    const k = e.target.closest('#daftar .item'); if (k) { sel = k.dataset.k; opsi = null; det = null; gambarDaftar(); muatDetail(); return; }
    if (e.target.closest('#detail')) return aksi(e);
  });
  $('cari').oninput = (e) => { cari = e.target.value; gambarDaftar(); };
  $('fSumber').onchange = (e) => { fSumber = e.target.value; gambarDaftar(); };
  $('detail').addEventListener('input', (e) => { if (e.target.id === 'cariLain') { clearTimeout(tmLain); const v = e.target.value; tmLain = setTimeout(() => cariLain(v), 300); } });
  $('batal-masuk').onclick = () => $('dlg-masuk').close();
  $('form-masuk').onsubmit = async (e) => {
    e.preventDefault();
    const tombol = $('ok-masuk'); tombol.disabled = true;
    const { error } = await B.masuk($('in-email').value.trim(), $('in-sandi').value);
    tombol.disabled = false;
    if (error) { const g = $('galat-masuk'); g.textContent = B.galat(error); g.hidden = false; return; }
    $('dlg-masuk').close(); B.toast('Berhasil masuk.'); mulai();
  };
  mulai();
})();
