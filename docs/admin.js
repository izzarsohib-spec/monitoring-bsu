/* Halaman Administrator: mengedit data master (peserta acuan, lokasi, jawaban Form, penerima BSU)
   dan menyelesaikan nama/lokasi yang belum cocok. Hanya untuk akun berperan "admin". */
(function () {
  const B = window.BSU;
  const { esc, $, sb } = B;
  const HAL = 50;
  const A = { tab: null, def: null, cari: '', chip: '', page: 0, rows: [], total: 0, pilih: null, timer: null, cache: {} };

  const JENIS = {
    jawaban: { view: 'v_jawaban_staff', tabel: 'form_jawaban', sens: 'form_sensitif', sensKey: 'jawaban_id', rpcPilih: 'pilih_jawaban', rpcSatu: 'jawaban', lok: 'lokasi_form', labelLok: 'Lokasi di form', labelNama: 'Nama di form' },
    bsu: { view: 'v_bsu_staff', tabel: 'bsu_penerima', sens: 'bsu_sensitif', sensKey: 'penerima_id', rpcPilih: 'pilih_bsu', rpcSatu: 'bsu', lok: 'folder', labelLok: 'Folder BSU', labelNama: 'Nama di daftar BSU' },
  };

  // ---------- alat bantu ----------
  const mask = (s, awal, akhir) => {
    s = String(s || '');
    return s.length <= awal + akhir ? s : s.slice(0, awal) + '•'.repeat(Math.min(8, s.length - awal - akhir)) + s.slice(s.length - akhir);
  };
  const opsi = (arr, sel) => arr.map((o) => '<option value="' + esc(o[0]) + '"' + (String(sel) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
  async function daftarLokasi() {
    if (!A.cache.lokasi) A.cache.lokasi = await B.semua(() => sb.from('lokasi').select('id,nama').order('nama'));
    return A.cache.lokasi;
  }
  async function nilaiUnik(tabel, kolom) {
    const k = tabel + '.' + kolom;
    if (!A.cache[k]) {
      const r = await B.semua(() => sb.from(tabel).select(kolom).order(kolom));
      A.cache[k] = [...new Set(r.map((x) => x[kolom]).filter(Boolean))].sort();
    }
    return A.cache[k];
  }
  async function segarkanCocok() {
    const tutup = ['cek', 'tidak_ada', 'lokasi_belum'];
    for (const t of ['form_jawaban', 'bsu_penerima']) {
      const { error } = await sb.from(t).update({ cocok: 'baru' }).in('cocok', tutup).eq('dikunci', false);
      if (error) throw error;
    }
    for (let i = 0; i < 80; i++) {
      const { data, error } = await sb.rpc('cocokkan_lanjut_staf', { p_batas: 100 });
      if (error) throw error;
      if (!data) break;
    }
  }
  const lakukan = async (fn, ok) => {
    try { const r = await fn(); if (ok) B.toast(ok); return r; }
    catch (e) { B.toast(B.galat(e), true); return null; }
  };

  // ---------- mesin daftar + rincian ----------
  async function muat() {
    const q = { cari: B.aman(A.cari), chip: A.chip, dari: A.page * HAL, sampai: A.page * HAL + HAL - 1 };
    try { const r = await A.def.ambil(q); A.rows = r.rows; A.total = r.total; }
    catch (e) { $('#a-daftar').innerHTML = '<div class="galat" style="margin:16px">' + esc(B.galat(e)) + '</div>'; return; }
    gambarDaftar();
  }
  function gambarDaftar() {
    const d = A.def;
    const chips = (d.chips || []).map((c) => '<button class="chip' + (A.chip === c.k ? ' aktif' : '') + '" data-chip="' + c.k + '">' + esc(c.t) + '</button>').join('');
    const item = A.rows.map((r) => '<button class="dl' + (A.pilih && A.pilih.id === r.id ? ' pilih' : '') + '" data-id="' + r.id + '">' + d.item(r) + '</button>').join('');
    const dari = A.total ? A.page * HAL + 1 : 0, sampai = Math.min(A.total, A.page * HAL + HAL);
    $('#a-daftar').innerHTML =
      '<div class="alat"><input class="cari" id="a-cari" type="search" placeholder="' + esc(d.placeholder || 'Cari…') + '" value="' + esc(A.cari) + '" autocomplete="off">' +
      (chips ? '<div class="chips">' + chips + '</div>' : '') + (d.tambah ? '<button class="btn kecil" data-aksi="tambah">+ ' + esc(d.tambah) + '</button>' : '') + '</div>' +
      '<div class="baris-daftar" id="a-baris">' + (item || '<div class="kosong"><b>Tidak ada data</b>Tidak ada yang cocok dengan pencarian ini.</div>') + '</div>' +
      '<div class="pager"><button class="btn kecil" data-aksi="sebelum"' + (A.page ? '' : ' disabled') + '>‹ Sebelumnya</button><span class="kecil redup">' + dari + '–' + sampai + ' dari ' + B.angka(A.total) + '</span><button class="btn kecil" data-aksi="berikut"' + (sampai >= A.total ? ' disabled' : '') + '>Berikutnya ›</button></div>';
  }
  async function bukaRinci(r) {
    A.pilih = r;
    gambarDaftar();
    const wadah = $('#a-rinci');
    wadah.innerHTML = '<div class="kosong"><b>Memuat…</b></div>';
    let html;
    try { html = await A.def.detail(r); } catch (e) { wadah.innerHTML = '<div class="galat" style="margin:20px">' + esc(B.galat(e)) + '</div>'; return; }
    if (A.pilih !== r) return; // pengguna sudah pindah ke baris lain
    // akar baru tiap pembukaan, supaya pendengar peristiwa tidak menumpuk
    wadah.innerHTML = '<div class="akar" id="rk">' + html + '</div>';
    if (A.def.hook) A.def.hook(r, $('#rk'));
  }
  function selesaiBaris(r) {
    const i = A.rows.findIndex((x) => x.id === r.id);
    A.rows.splice(i, 1);
    A.total = Math.max(0, A.total - 1);
    const lanjut = A.rows[Math.min(i, A.rows.length - 1)];
    if (lanjut) bukaRinci(lanjut);
    else { A.pilih = null; $('#a-rinci').innerHTML = '<div class="pilih-dulu"><b>Selesai</b>Tidak ada lagi di daftar ini.</div>'; gambarDaftar(); muat(); }
  }
  function pasangDaftar(root) {
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.id) { const r = A.rows.find((x) => String(x.id) === t.dataset.id); if (r) bukaRinci(r); }
      else if (t.dataset.chip !== undefined) { A.chip = t.dataset.chip; A.page = 0; A.pilih = null; $('#a-rinci').innerHTML = '<div class="pilih-dulu"><b>Pilih satu baris</b>Rincian tampil di sini.</div>'; await muat(); }
      else if (t.dataset.aksi === 'sebelum') { A.page--; await muat(); }
      else if (t.dataset.aksi === 'berikut') { A.page++; await muat(); }
      else if (t.dataset.aksi === 'tambah' && A.def.baru) {
        A.pilih = { id: 'baru' }; gambarDaftar();
        $('#a-rinci').innerHTML = '<div class="akar" id="rk">' + (await A.def.baru()) + '</div>';
        if (A.def.hookBaru) A.def.hookBaru($('#rk'));
      }
    });
    root.addEventListener('input', (e) => {
      if (e.target.id !== 'a-cari') return;
      A.cari = e.target.value; A.page = 0;
      clearTimeout(A.timer);
      A.timer = setTimeout(async () => { const p = e.target.selectionStart; await muat(); const n = $('#a-cari'); if (n) { n.focus(); n.setSelectionRange(p, p); } }, 300);
    });
  }

  // ---------- pilih peserta acuan (dipakai di tab cek dan rincian jawaban/BSU) ----------
  async function htmlSaran(j, r) {
    const nama = r.nama || '';
    const lokIds = r.lokasi_id ? [r.lokasi_id] : null;
    const { data, error } = await sb.rpc('saran_peserta', { p_nama: nama, p_lokasi: lokIds, p_batas: 6 });
    if (error) throw error;
    const baris = (data || []).map((s) =>
      '<div class="kotak saran"><div><b>' + esc(s.nama) + '</b><div class="sb">' + esc(s.lokasi) + ' · kemiripan ' + Math.round(s.skor * 100) + '%</div></div>' +
      '<button class="btn kecil utama" data-pilih="' + s.peserta_id + '">Pilih</button></div>').join('');
    return '<div class="judul-bagian">Saran dari data acuan' + (lokIds ? ' (lokasi ' + esc(r.lokasi_acuan || '') + ')' : ' (semua lokasi)') + '</div>' +
      (baris || '<div class="redup">Tidak ada saran.</div>') +
      '<div class="judul-bagian" style="margin-top:18px">Cari peserta lain</div>' +
      '<input class="cari" id="cari-peserta" placeholder="Ketik nama peserta…" autocomplete="off"><div id="hasil-peserta" style="margin-top:10px"></div>';
  }
  function pasangSaran(j, r, el, setelah) {
    const pilih = async (pid) => {
      const ok = await lakukan(async () => {
        const { error } = await sb.rpc(JENIS[j].rpcPilih, { p_id: r.id, p_peserta: pid });
        if (error) throw error;
        return true;
      }, pid ? 'Dipasangkan ke peserta acuan.' : 'Ditandai: tidak ada di acuan.');
      if (ok) setelah(pid);
    };
    el.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.pilih) pilih(Number(t.dataset.pilih));
      else if (t.dataset.aksi === 'tidak-ada') pilih(null);
    });
    let tm;
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'cari-peserta') return;
      clearTimeout(tm);
      tm = setTimeout(async () => {
        const c = B.aman(e.target.value);
        const box = $('#hasil-peserta', el);
        if (c.length < 2) { box.innerHTML = ''; return; }
        const { data } = await sb.from('v_peserta_staff').select('id,nama,lokasi').ilike('nama', '%' + c + '%').order('nama').limit(8);
        box.innerHTML = (data || []).map((s) => '<div class="kotak saran"><div><b>' + esc(s.nama) + '</b><div class="sb">' + esc(s.lokasi) + '</div></div><button class="btn kecil" data-pilih="' + s.id + '">Pilih</button></div>').join('') || '<div class="redup">Tidak ditemukan.</div>';
      }, 250);
    });
  }

  // ---------- definisi tab: Perlu dicek ----------
  function defCek(j) {
    const J = JENIS[j];
    return {
      placeholder: 'Cari nama atau ' + J.labelLok.toLowerCase() + '…',
      chips: [{ k: 'cek', t: 'Perlu dicek' }, { k: 'tidak_ada', t: 'Tidak ada di acuan' }, { k: 'lokasi_belum', t: 'Lokasi belum dipetakan' }],
      async ambil(q) {
        let s = sb.from(J.view).select('id,nama,' + J.lok + ',cocok,skor,lokasi_id,lokasi_acuan', { count: 'exact' }).eq('dibatalkan', false).eq('cocok', q.chip || 'cek');
        if (j === 'jawaban') s = s.eq('hilang', false);
        if (q.cari) s = s.or('nama.ilike.%' + q.cari + '%,' + J.lok + '.ilike.%' + q.cari + '%');
        const { data, error, count } = await s.order(J.lok).order('nama').range(q.dari, q.sampai);
        if (error) throw error;
        return { rows: data, total: count || 0 };
      },
      item: (r) => '<div class="nm"><span>' + esc(r.nama) + '</span></div><div class="sb"><span>' + esc(r[J.lok]) + '</span><span>' + (r.skor != null ? Math.round(r.skor * 100) + '%' : '') + '</span></div>',
      async detail(r) {
        return '<div class="rkop"><div><h2>' + esc(r.nama) + '</h2><div class="sub">' + esc(J.labelLok) + ': ' + esc(r[J.lok]) + (r.lokasi_acuan ? ' · acuan: ' + esc(r.lokasi_acuan) : '') + '</div></div>' + B.lencanaCocok(r.cocok) + '</div>' +
          '<div class="badan" id="rinci-badan">' + await htmlSaran(j, r) + '</div>' +
          '<div class="kaki"><button class="btn bahaya" data-aksi="tidak-ada">Bukan peserta acuan</button><button class="btn" data-aksi="batal">Batalkan data ini</button></div>';
      },
      hook(r, el) {
        pasangSaran(j, r, el, () => selesaiBaris(r));
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('button');
          if (!t || t.dataset.aksi !== 'batal') return;
          if (!confirm('Batalkan data ini? Data tetap tersimpan tetapi tidak dihitung.')) return;
          const ok = await lakukan(async () => { const { error } = await sb.from(J.tabel).update({ dibatalkan: true }).eq('id', r.id); if (error) throw error; return true; }, 'Dibatalkan.');
          if (ok) selesaiBaris(r);
        });
      },
    };
  }

  // ---------- definisi tab: Jawaban Form / Penerima BSU (semua data) ----------
  function defData(j) {
    const J = JENIS[j];
    const chips = [{ k: 'semua', t: 'Semua' }, { k: 'cek', t: 'Perlu dicek' }, { k: 'cocok', t: 'Cocok' }, { k: 'dibatalkan', t: 'Dibatalkan' }, { k: 'dikunci', t: 'Dikunci admin' }];
    if (j === 'jawaban') chips.push({ k: 'hilang', t: 'Hilang di sheet' });
    return {
      placeholder: 'Cari nama atau ' + J.labelLok.toLowerCase() + '…',
      chips,
      async ambil(q) {
        let s = sb.from(J.view).select('id,nama,' + J.lok + ',cocok,skor,dikunci,dibatalkan,lokasi_id,lokasi_acuan,peserta_id,nama_acuan' + (j === 'jawaban' ? ',hilang,waktu' : ''), { count: 'exact' });
        const c = q.chip || 'semua';
        if (c === 'cek') s = s.in('cocok', ['cek', 'tidak_ada', 'lokasi_belum']).eq('dibatalkan', false);
        else if (c === 'cocok') s = s.in('cocok', ['persis', 'mirip', 'manual']);
        else if (c === 'dibatalkan') s = s.eq('dibatalkan', true);
        else if (c === 'dikunci') s = s.eq('dikunci', true);
        else if (c === 'hilang') s = s.eq('hilang', true);
        if (q.cari) s = s.or('nama.ilike.%' + q.cari + '%,' + J.lok + '.ilike.%' + q.cari + '%');
        const { data, error, count } = await s.order('id', { ascending: false }).range(q.dari, q.sampai);
        if (error) throw error;
        return { rows: data, total: count || 0 };
      },
      item: (r) => '<div class="nm"><span>' + esc(r.nama) + '</span>' + B.lencanaCocok(r.cocok) + '</div><div class="sb"><span>' + esc(r[J.lok]) + '</span><span>' + (r.dibatalkan ? 'dibatalkan' : r.hilang ? 'hilang di sheet' : r.dikunci ? 'dikunci' : '') + '</span></div>',
      async detail(r) {
        const { data: sens } = await sb.from(J.sens).select('*').eq(J.sensKey, r.id).maybeSingle();
        const nik = sens && sens.nik ? sens.nik : '';
        const baris = (k, v) => '<div><span class="redup kecil">' + k + '</span><div><b>' + esc(v || '-') + '</b></div></div>';
        const dataSens = j === 'jawaban'
          ? baris('NIK', mask(nik, 4, 3)) + baris('Bank', sens && sens.bank) + baris('No. rekening', mask(sens && sens.no_rek, 0, 4)) + baris('Nama rekening', sens && sens.nama_rek) + baris('HP', mask(sens && sens.hp, 3, 3))
          : baris('NIK', mask(nik, 4, 3)) + baris('KPJ', mask(sens && sens.kpj, 3, 3));
        return '<div class="rkop"><div><h2>' + esc(r.nama) + '</h2><div class="sub">' + esc(J.labelLok) + ': ' + esc(r[J.lok]) + (j === 'jawaban' ? ' · diisi ' + B.waktu(r.waktu) : '') + '</div></div>' + B.lencanaCocok(r.cocok) + '</div>' +
          '<div class="badan" id="rinci-badan">' +
          '<div class="kv kvw" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' + baris('Cocok dengan peserta acuan', r.nama_acuan) + baris('Lokasi acuan', r.lokasi_acuan) + baris('Kemiripan', r.skor != null ? Math.round(r.skor * 100) + '%' : '-') + '</div>' +
          (r.dikunci ? '<div class="peringatan">Data ini dikunci admin: sinkron berikutnya tidak menimpa perubahan Anda.</div>' : '') +
          (r.dibatalkan ? '<div class="galat">Data ini dibatalkan dan tidak dihitung.</div>' : '') +
          '<form class="form" id="f-edit"><label>' + J.labelNama + '<input name="nama" value="' + esc(r.nama) + '" required></label>' +
          '<label>' + J.labelLok + '<input name="lok" value="' + esc(r[J.lok]) + '"' + (j === 'bsu' ? ' list="dl-folder"' : ' list="dl-lokform"') + '></label>' +
          '<div class="lebar"><button class="btn utama" type="submit">Simpan perubahan</button> <span class="hint">Menyimpan akan mengunci data ini dan mencocokkan ulang.</span></div></form>' +
          '<div><div class="judul-bagian">Data pribadi (disamarkan)</div><div class="kv kvw" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' + dataSens + '</div></div>' +
          '<div><div class="judul-bagian">Pasangkan manual ke peserta acuan</div>' + await htmlSaran(j, { nama: r.nama, lokasi_id: r.lokasi_id, lokasi_acuan: r.lokasi_acuan }) + '</div></div>' +
          '<div class="kaki">' + (r.dibatalkan ? '<button class="btn" data-aksi="pulihkan">Pulihkan</button>' : '<button class="btn bahaya" data-aksi="batal">Batalkan data ini</button>') +
          (r.dikunci ? '<button class="btn" data-aksi="lepas">Lepas kunci dan cocokkan ulang</button>' : '') + '<button class="btn" data-aksi="tidak-ada">Tandai: tidak ada di acuan</button></div>';
      },
      async hook(r, el) {
        const mutasi = async (fn, pesan) => { const ok = await lakukan(fn, pesan); if (ok) { await muat(); const baru = A.rows.find((x) => x.id === r.id); if (baru) bukaRinci(baru); } };
        pasangSaran(j, r, el, () => mutasi(async () => true, null));
        el.addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          await mutasi(async () => {
            const nilai = { nama: f.get('nama').trim(), dikunci: true }; nilai[J.lok] = f.get('lok').trim();
            const u = await sb.from(J.tabel).update(nilai).eq('id', r.id); if (u.error) throw u.error;
            const c = await sb.rpc('cocokkan_satu', { p_tabel: J.rpcSatu, p_id: r.id }); if (c.error) throw c.error;
            return true;
          }, 'Tersimpan dan dicocokkan ulang.');
        });
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('button');
          if (!t) return;
          const a = t.dataset.aksi;
          if (a === 'batal') { if (confirm('Batalkan data ini?')) await mutasi(async () => { const x = await sb.from(J.tabel).update({ dibatalkan: true }).eq('id', r.id); if (x.error) throw x.error; return true; }, 'Dibatalkan.'); }
          else if (a === 'pulihkan') await mutasi(async () => { const x = await sb.from(J.tabel).update({ dibatalkan: false }).eq('id', r.id); if (x.error) throw x.error; return true; }, 'Dipulihkan.');
          else if (a === 'lepas') await mutasi(async () => { const x = await sb.rpc('lepas_kunci', { p_tabel: J.rpcSatu, p_id: r.id }); if (x.error) throw x.error; return true; }, 'Kunci dilepas.');
        });
        // daftar isian bantu
        if (j === 'jawaban' && !$('#dl-lokform')) { const dl = document.createElement('datalist'); dl.id = 'dl-lokform'; document.body.appendChild(dl); nilaiUnik('form_jawaban', 'lokasi_form').then((v) => { dl.innerHTML = v.map((x) => '<option value="' + esc(x) + '">').join(''); }); }
        if (j === 'bsu' && !$('#dl-folder')) { const dl = document.createElement('datalist'); dl.id = 'dl-folder'; document.body.appendChild(dl); nilaiUnik('bsu_penerima', 'folder').then((v) => { dl.innerHTML = v.map((x) => '<option value="' + esc(x) + '">').join(''); }); }
      },
    };
  }

  // ---------- definisi tab: Peserta acuan ----------
  const defPeserta = {
    placeholder: 'Cari nama atau lokasi…', tambah: 'Tambah peserta',
    chips: [{ k: 'semua', t: 'Semua' }, { k: 'belum', t: 'Belum mengisi' }, { k: 'sudah', t: 'Sudah mengisi' }, { k: 'nonaktif', t: 'Nonaktif' }],
    async ambil(q) {
      let s = sb.from('v_peserta_staff').select('id,nama,lokasi_id,lokasi,aktif,catatan,jawaban_id,ada_bsu', { count: 'exact' });
      const c = q.chip || 'semua';
      if (c === 'belum') s = s.is('jawaban_id', null).eq('aktif', true);
      else if (c === 'sudah') s = s.not('jawaban_id', 'is', null);
      else if (c === 'nonaktif') s = s.eq('aktif', false);
      if (q.cari) s = s.or('nama.ilike.%' + q.cari + '%,lokasi.ilike.%' + q.cari + '%');
      const { data, error, count } = await s.order('lokasi').order('nama').range(q.dari, q.sampai);
      if (error) throw error;
      return { rows: data, total: count || 0 };
    },
    item: (r) => '<div class="nm"><span>' + esc(r.nama) + '</span><span class="lencana-s ' + (!r.aktif ? 's-abu' : r.jawaban_id ? 's-ok' : 's-bad') + '">' + (!r.aktif ? 'Nonaktif' : r.jawaban_id ? 'Sudah' : 'Belum') + '</span></div><div class="sb"><span>' + esc(r.lokasi) + '</span><span>' + (r.ada_bsu ? 'ada di BSU' : '') + '</span></div>',
    async formHtml(r) {
      const lok = await daftarLokasi();
      return '<form class="form" id="f-peserta"><label class="lebar">Nama (sesuai KTP)<input name="nama" value="' + esc(r.nama || '') + '" required></label>' +
        '<label class="lebar">Lokasi<select name="lokasi_id" required>' + opsi([['', '— pilih lokasi —'], ...lok.map((l) => [l.id, l.nama])], r.lokasi_id || '') + '</select></label>' +
        '<label><span>Status</span><select name="aktif">' + opsi([['true', 'Aktif'], ['false', 'Nonaktif (keluar / tidak dihitung)']], String(r.aktif !== false)) + '</select></label>' +
        '<label class="lebar">Catatan<input name="catatan" value="' + esc(r.catatan || '') + '"></label>' +
        '<div class="lebar"><button class="btn utama" type="submit">' + (r.id ? 'Simpan' : 'Tambahkan') + '</button> <span class="hint">Setelah disimpan, jawaban yang belum cocok dicocokkan ulang otomatis.</span></div></form>';
    },
    async detail(r) {
      return '<div class="rkop"><div><h2>' + esc(r.nama) + '</h2><div class="sub">' + esc(r.lokasi) + '</div></div></div><div class="badan">' + await this.formHtml(r) + '</div>';
    },
    async baru() { return '<div class="rkop"><div><h2>Peserta baru</h2><div class="sub">Tambah ke data acuan</div></div></div><div class="badan">' + await this.formHtml({}) + '</div>'; },
    simpan(r, el) {
      el.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const nilai = { nama: f.get('nama').trim().toUpperCase().replace(/\s+/g, ' '), lokasi_id: Number(f.get('lokasi_id')), aktif: f.get('aktif') === 'true', catatan: f.get('catatan').trim() || null };
        const ok = await lakukan(async () => {
          const x = r.id ? await sb.from('peserta').update(nilai).eq('id', r.id) : await sb.from('peserta').insert(nilai);
          if (x.error) throw x.error;
          await segarkanCocok();
          return true;
        }, 'Tersimpan.');
        if (ok) { A.pilih = null; $('#a-rinci').innerHTML = '<div class="pilih-dulu"><b>Tersimpan</b>Pilih peserta lain.</div>'; await muat(); }
      });
    },
    hook(r, el) { this.simpan(r, el); },
    hookBaru(el) { this.simpan({}, el); },
  };

  // ---------- definisi tab: Lokasi dan pemetaan ----------
  const defLokasi = {
    placeholder: 'Cari lokasi…', tambah: 'Tambah lokasi',
    chips: [{ k: 'semua', t: 'Semua' }, { k: 'aktif', t: 'Aktif' }, { k: 'nonaktif', t: 'Nonaktif' }],
    async ambil(q) {
      let s = sb.from('lokasi').select('id,nama,wilayah,aktif,catatan,pemetaan_lokasi(nama_form,folder_bsu,status_form,status_bsu,catatan)', { count: 'exact' });
      if (q.chip === 'aktif') s = s.eq('aktif', true); else if (q.chip === 'nonaktif') s = s.eq('aktif', false);
      if (q.cari) s = s.or('nama.ilike.%' + q.cari + '%,wilayah.ilike.%' + q.cari + '%');
      const { data, error, count } = await s.order('nama').range(q.dari, q.sampai);
      if (error) throw error;
      return { rows: data.map((r) => ({ ...r, pm: Array.isArray(r.pemetaan_lokasi) ? r.pemetaan_lokasi[0] || {} : r.pemetaan_lokasi || {} })), total: count || 0 };
    },
    item: (r) => '<div class="nm"><span>' + esc(r.nama) + '</span>' + (r.aktif ? '' : '<span class="lencana-s s-abu">Nonaktif</span>') + '</div><div class="sb"><span>Form: ' + esc(r.pm.nama_form || '—') + '</span><span>' + esc(r.wilayah || '') + '</span></div>',
    async formHtml(r) {
      const pm = r.pm || {};
      const SF = [['ok', 'Normal'], ['tidak ada', 'Tidak ada di pilihan form'], ['tidak mengisi', 'Tidak mengisi form'], ['ditangani produksi', 'Ditangani produksi']];
      const SB = [['ok', 'Normal'], ['tidak dapat', 'Tidak menerima BSU'], ['ditangani produksi', 'Ditangani produksi']];
      const [lf, fb] = await Promise.all([nilaiUnik('form_jawaban', 'lokasi_form'), nilaiUnik('bsu_penerima', 'folder')]);
      return '<form class="form" id="f-lokasi"><label class="lebar">Nama lokasi (data acuan)<input name="nama" value="' + esc(r.nama || '') + '" required></label>' +
        '<label>Wilayah<input name="wilayah" value="' + esc(r.wilayah || '') + '"></label>' +
        '<label>Status<select name="aktif">' + opsi([['true', 'Aktif'], ['false', 'Nonaktif']], String(r.aktif !== false)) + '</select></label>' +
        '<label class="lebar">Nama lokasi di Google Form<input name="nama_form" list="dl-lf" value="' + esc(pm.nama_form || '') + '"><span class="hint">Harus persis sama dengan pilihan di form. Kosongkan bila lokasi tidak ada di form.</span></label>' +
        '<label class="lebar">Nama folder penerima BSU<input name="folder_bsu" list="dl-fb" value="' + esc(pm.folder_bsu || '') + '"></label>' +
        '<label>Status di Form<select name="status_form">' + opsi(SF, pm.status_form || 'ok') + '</select></label>' +
        '<label>Status BSU<select name="status_bsu">' + opsi(SB, pm.status_bsu || 'ok') + '</select></label>' +
        '<label class="lebar">Catatan<input name="catatan" value="' + esc(pm.catatan || r.catatan || '') + '"></label>' +
        '<datalist id="dl-lf">' + lf.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist><datalist id="dl-fb">' + fb.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
        '<div class="lebar"><button class="btn utama" type="submit">' + (r.id ? 'Simpan' : 'Tambahkan') + '</button> <span class="hint">Perubahan pemetaan memicu pencocokan ulang otomatis.</span></div></form>';
    },
    async detail(r) { return '<div class="rkop"><div><h2>' + esc(r.nama) + '</h2><div class="sub">Lokasi dan pemetaan nama</div></div></div><div class="badan">' + await this.formHtml(r) + '</div>'; },
    async baru() { return '<div class="rkop"><div><h2>Lokasi baru</h2><div class="sub">Tambah ke data acuan</div></div></div><div class="badan">' + await this.formHtml({}) + '</div>'; },
    simpan(r, el) {
      el.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const lokasi = { nama: f.get('nama').trim(), wilayah: f.get('wilayah').trim() || null, aktif: f.get('aktif') === 'true' };
        const ok = await lakukan(async () => {
          let id = r.id;
          if (id) { const x = await sb.from('lokasi').update(lokasi).eq('id', id); if (x.error) throw x.error; }
          else { const x = await sb.from('lokasi').insert({ ...lokasi, nama_sheet: lokasi.nama }).select('id').single(); if (x.error) throw x.error; id = x.data.id; }
          const pm = { lokasi_id: id, nama_form: f.get('nama_form').trim() || null, folder_bsu: f.get('folder_bsu').trim() || null, status_form: f.get('status_form'), status_bsu: f.get('status_bsu'), catatan: f.get('catatan').trim() || null };
          const y = await sb.from('pemetaan_lokasi').upsert(pm, { onConflict: 'lokasi_id' }); if (y.error) throw y.error;
          await segarkanCocok();
          return true;
        }, 'Tersimpan.');
        if (ok) { A.cache = {}; A.pilih = null; $('#a-rinci').innerHTML = '<div class="pilih-dulu"><b>Tersimpan</b>Pilih lokasi lain.</div>'; await muat(); }
      });
    },
    hook(r, el) { this.simpan(r, el); },
    hookBaru(el) { this.simpan({}, el); },
  };

  // ---------- tab: Sinkron dan pengguna (halaman sendiri) ----------
  async function tampilSinkron() {
    const isi = $('#isi');
    isi.innerHTML = '<div class="akar" id="adm"><div class="dua-kolom" style="overflow-y:auto"><div class="blok" id="s-kiri"></div><div class="blok" id="s-kanan"></div></div></div>';
    const [sk, lg, st, us] = await Promise.all([
      sb.from('v_sinkron').select('*').maybeSingle(),
      sb.from('sinkron_log').select('*').order('id', { ascending: false }).limit(12),
      sb.from('pengaturan').select('*'),
      sb.from('bsu_admin').select('*').order('email'),
    ]);
    const cfg = Object.fromEntries((st.data || []).map((r) => [r.kunci, r.nilai]));
    const s = sk.data || {};
    $('#s-kiri').innerHTML =
      '<h2>Sinkron Google Form</h2><div class="gulir">' +
      '<p>Jawaban terakhir masuk: <b>' + B.waktu(s.jawaban_terakhir) + '</b><br>Sinkron otomatis terakhir: <b>' + B.waktu(s.sinkron_terakhir) + '</b> (tiap 5 menit)<br>Jumlah jawaban: <b>' + B.angka(s.jumlah_jawaban) + '</b></p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px"><button class="btn utama" id="b-sinkron">Sinkron sekarang</button><button class="btn" id="b-ulang">Cocokkan ulang semua</button></div><div id="s-hasil"></div>' +
      '<div class="judul-bagian">Sumber spreadsheet</div><form class="form" id="f-cfg"><label class="lebar">ID spreadsheet<input name="sheet_id" value="' + esc(cfg.sheet_id || '') + '"><span class="hint">Bagian di antara /d/ dan /edit pada alamat spreadsheet. Spreadsheet harus dibagikan "siapa saja yang memiliki link".</span></label>' +
      '<label class="lebar">Nama tab jawaban<input name="sheet_nama" value="' + esc(cfg.sheet_nama || '') + '"></label><div class="lebar"><button class="btn" type="submit">Simpan sumber</button></div></form>' +
      '<div class="judul-bagian" style="margin-top:22px">Riwayat sinkron</div><div class="tabel-gulir"><table><thead><tr><th>Waktu</th><th>Sumber</th><th class="r">Baris</th><th class="r">Baru</th><th>Hasil</th></tr></thead><tbody>' +
      (lg.data || []).map((l) => '<tr><td class="kecil">' + B.waktu(l.waktu) + '</td><td class="kecil">' + esc(l.sumber) + '</td><td class="r">' + (l.baris ?? '') + '</td><td class="r">' + (l.baru ?? '') + '</td><td class="kecil">' + (l.galat ? '<span class="lencana-s s-bad">Gagal</span> ' + esc(l.galat) : '<span class="lencana-s s-ok">OK</span>') + '</td></tr>').join('') +
      '</tbody></table></div></div>';
    $('#s-kanan').innerHTML =
      '<h2>Pengguna</h2><div class="gulir"><p class="kecil redup">Admin boleh mengedit. Operator hanya melihat nama peserta dan hasil. Akun login dibuat di Supabase (Authentication); daftarkan emailnya di sini.</p>' +
      '<div class="tabel-gulir"><table><thead><tr><th>Email</th><th>Peran</th><th>Aktif</th><th></th></tr></thead><tbody>' +
      (us.data || []).map((u) => '<tr><td>' + esc(u.email) + '<div class="kecil redup">' + esc(u.nama || '') + '</div></td><td>' + esc(u.peran) + '</td><td>' + (u.aktif ? 'Ya' : 'Tidak') + '</td><td><button class="btn kecil" data-peran="' + esc(u.email) + '">' + (u.peran === 'admin' ? 'Jadikan operator' : 'Jadikan admin') + '</button> <button class="btn kecil" data-aktif="' + esc(u.email) + '" data-nilai="' + u.aktif + '">' + (u.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>').join('') +
      '</tbody></table></div><div class="judul-bagian" style="margin-top:22px">Tambah pengguna</div>' +
      '<form class="form" id="f-user"><label>Email<input name="email" type="email" required></label><label>Nama<input name="nama"></label><label>Peran<select name="peran">' + opsi([['operator', 'Operator (melihat)'], ['admin', 'Admin (mengedit)']], 'operator') + '</select></label><div class="lebar"><button class="btn utama" type="submit">Tambahkan</button></div></form></div>';

    const hasil = (h) => { $('#s-hasil').innerHTML = h; };
    $('#b-sinkron').onclick = async (e) => {
      e.target.disabled = true; hasil('<div class="peringatan">Menyinkron… mohon tunggu.</div>');
      try { const r = await B.sinkron(); hasil('<div class="peringatan" style="background:var(--ok-bg);color:var(--ok)">Selesai: ' + r.baris + ' baris, ' + r.baru + ' baru, ' + r.berubah + ' berubah, ' + r.perlu_cek + ' perlu dicek.</div>'); B.toast('Sinkron selesai.'); tampilSinkron(); }
      catch (er) { hasil('<div class="galat">' + esc(B.galat(er)) + '</div>'); e.target.disabled = false; }
    };
    $('#b-ulang').onclick = async (e) => {
      if (!confirm('Cocokkan ulang semua data yang tidak dikunci? Pilihan manual Anda tetap aman.')) return;
      e.target.disabled = true; hasil('<div class="peringatan">Mencocokkan ulang… ini bisa 1–2 menit.</div>');
      try {
        const x = await sb.rpc('cocokkan_ulang'); if (x.error) throw x.error;
        for (let i = 0; i < 120; i++) { const y = await sb.rpc('cocokkan_lanjut_staf', { p_batas: 100 }); if (y.error) throw y.error; if (!y.data) break; }
        hasil('<div class="peringatan" style="background:var(--ok-bg);color:var(--ok)">Pencocokan ulang selesai.</div>'); B.toast('Selesai.');
      } catch (er) { hasil('<div class="galat">' + esc(B.galat(er)) + '</div>'); }
      e.target.disabled = false;
    };
    $('#f-cfg').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const ok = await lakukan(async () => { const x = await sb.from('pengaturan').upsert([{ kunci: 'sheet_id', nilai: f.get('sheet_id').trim() }, { kunci: 'sheet_nama', nilai: f.get('sheet_nama').trim() }], { onConflict: 'kunci' }); if (x.error) throw x.error; return true; }, 'Sumber disimpan. Klik "Sinkron sekarang" untuk mencoba.');
      if (ok) tampilSinkron();
    };
    $('#f-user').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const ok = await lakukan(async () => { const x = await sb.from('bsu_admin').insert({ email: f.get('email').trim().toLowerCase(), nama: f.get('nama').trim() || null, peran: f.get('peran') }); if (x.error) throw x.error; return true; }, 'Pengguna ditambahkan.');
      if (ok) tampilSinkron();
    };
    $('#s-kanan').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      let ok = null;
      if (t.dataset.peran) { const u = (us.data || []).find((x) => x.email === t.dataset.peran); ok = await lakukan(async () => { const x = await sb.from('bsu_admin').update({ peran: u.peran === 'admin' ? 'operator' : 'admin' }).eq('email', u.email); if (x.error) throw x.error; return true; }, 'Peran diubah.'); }
      if (t.dataset.aktif) { ok = await lakukan(async () => { const x = await sb.from('bsu_admin').update({ aktif: t.dataset.nilai !== 'true' }).eq('email', t.dataset.aktif); if (x.error) throw x.error; return true; }, 'Diubah.'); }
      if (ok) tampilSinkron();
    };
  }

  // ---------- pintu masuk ----------
  const TABS = [
    ['cek-form', 'Perlu dicek (Form)', () => defCek('jawaban')],
    ['cek-bsu', 'Perlu dicek (BSU)', () => defCek('bsu')],
    ['peserta', 'Peserta', () => defPeserta],
    ['lokasi', 'Lokasi', () => defLokasi],
    ['jawaban', 'Jawaban Form', () => defData('jawaban')],
    ['bsu', 'Penerima BSU', () => defData('bsu')],
    ['sinkron', 'Sinkron & pengguna', null],
  ];

  B.administrator = {
    tabs: TABS.map((t) => [t[0], t[1]]),
    async tampil(tab) {
      const t = TABS.find((x) => x[0] === tab) || TABS[0];
      A.tab = t[0];
      if (!t[2]) { await tampilSinkron(); return; }
      A.def = t[2](); A.cari = ''; A.chip = A.def.chips ? A.def.chips[0].k : ''; A.page = 0; A.pilih = null; A.rows = [];
      $('#isi').innerHTML = '<div class="akar" id="adm"><div class="md"><div class="daftar" id="a-daftar"><div class="kosong"><b>Memuat…</b></div></div><div class="rinci" id="a-rinci"><div class="pilih-dulu"><b>Pilih satu baris</b>Rincian dan tindakan tampil di sini.</div></div></div></div>';
      pasangDaftar($('#adm'));
      await muat();
    },
  };
})();
