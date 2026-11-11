/* Halaman Administrator: kepala halaman, tab, dan dialog masuk / ganti kata sandi. */
(function () {
  const B = window.BSU;
  const { esc, $ } = B;

  function kepala(ket) {
    $('#kepala').innerHTML = '<div><h1>Administrator</h1><div class="sub">' + esc(ket) + '</div></div><div id="akun"></div>';
    gambarAkun();
  }

  function gambarAkun() {
    const el = $('#akun'); if (!el) return;
    el.innerHTML = B.user
      ? '<div class="kode card" style="border-radius:99px"><span>' + esc(B.user.email) + ' · ' + (B.peran ? (B.admin() ? 'Administrator' : 'Operator') : 'belum terdaftar sebagai staf') + '</span>' +
        '<button class="btn" id="b-sandi">Ganti sandi</button><button class="btn" id="b-keluar">Keluar</button></div>'
      : '<div class="kode card" style="border-radius:99px"><span>Belum masuk</span><button class="btn" id="b-masuk">Masuk</button></div>';
    const m = $('#b-masuk'); if (m) m.onclick = masuk;
    const k = $('#b-keluar'); if (k) k.onclick = async () => { await B.keluar(); await mulaiUlang(); };
    const g = $('#b-sandi'); if (g) g.onclick = () => { $('#galat-sandi').hidden = true; $('#in-sandi-baru').value = ''; $('#in-sandi-ulang').value = ''; $('#dlg-sandi').showModal(); $('#in-sandi-baru').focus(); };
  }

  function masuk() {
    const d = $('#dlg-masuk');
    $('#galat-masuk').hidden = true;
    $('#in-sandi').value = '';
    d.showModal();
    $('#in-email').focus();
  }

  function tab(aktif) {
    $('#subtabs').innerHTML = B.administrator.tabs.map((t) => '<button class="chip ' + (t[0] === aktif ? 'on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>').join('');
  }

  function pesanGerbang(judul, teks, tombol) {
    kepala('Akses terbatas');
    $('#subtabs').innerHTML = '';
    $('#isi').innerHTML = '<div class="card pilih-dulu"><b>' + esc(judul) + '</b>' + esc(teks) + (tombol ? '<br><br><button class="btn utama" id="b-gerbang">Masuk</button>' : '') + '</div>';
    const g = $('#b-gerbang'); if (g) g.onclick = masuk;
  }

  async function rute() {
    const [, sub] = location.hash.replace(/^#/, '').split('/');
    if (!B.staf()) return pesanGerbang('Perlu masuk', 'Halaman ini hanya untuk akun staf yang terdaftar.', true);
    if (!B.admin()) return pesanGerbang('Khusus administrator', 'Akun Anda terdaftar sebagai operator: bisa melihat nama peserta di halaman Monitoring, tetapi tidak bisa mengedit data.', false);
    const aktif = sub || 'cek-form';
    kepala('Edit data master dan selesaikan yang belum cocok');
    tab(aktif);
    await B.administrator.tampil(aktif);
  }

  async function mulaiUlang() { await B.muatSesi(); await rute(); }

  $('#subtabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = '#admin/' + b.dataset.tab; };
  document.addEventListener('click', (e) => { const go = e.target.closest('[data-href]'); if (go) location.href = go.dataset.href; });
  $('#batal-masuk').onclick = () => $('#dlg-masuk').close();
  $('#form-masuk').onsubmit = async (e) => {
    e.preventDefault();
    const tombol = $('#ok-masuk'); tombol.disabled = true;
    const { error } = await B.masuk($('#in-email').value.trim(), $('#in-sandi').value);
    tombol.disabled = false;
    if (error) { const g = $('#galat-masuk'); g.textContent = B.galat(error); g.hidden = false; return; }
    $('#dlg-masuk').close();
    B.toast('Berhasil masuk.');
    await mulaiUlang();
  };
  $('#batal-sandi').onclick = () => $('#dlg-sandi').close();
  $('#form-sandi').onsubmit = async (e) => {
    e.preventDefault();
    const a = $('#in-sandi-baru').value, b = $('#in-sandi-ulang').value, g = $('#galat-sandi');
    if (a.length < 8) { g.textContent = 'Kata sandi minimal 8 karakter.'; g.hidden = false; return; }
    if (a !== b) { g.textContent = 'Pengulangan kata sandi tidak sama.'; g.hidden = false; return; }
    const { error } = await B.sb.auth.updateUser({ password: a });
    if (error) { g.textContent = B.galat(error); g.hidden = false; return; }
    $('#dlg-sandi').close();
    B.toast('Kata sandi diganti.');
  };
  window.addEventListener('hashchange', rute);
  window.BSUApp = { masuk };
  mulaiUlang();
})();
