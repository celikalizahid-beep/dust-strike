// DUST STRIKE yönetim paneli (public/admin.html). Sunucudaki /admin/api ile konuşur.
// Oyuncu adları gibi dışarıdan gelen her metin textContent ile yazılır (HTML olarak yorumlanmaz).
(() => {
  const TOKEN_KEY = 'dust-admin-token';
  const REFRESH_MS = 3000;
  const $ = (id) => document.getElementById(id);

  // Küçük DOM yardımcısı: h('td', { class: 'x', text: 'y', onclick: fn }, çocuklar...)
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }

  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* depolama kapalı */ }
  let state = null, timer = 0, logFilter = 'all', busy = false, toastTimer = 0;

  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  async function api(method, route, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`/admin/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch {
      throw new ApiError('Sunucuya ulaşılamıyor', 0);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(json.error || `Hata (${res.status})`, res.status);
    return json;
  }

  function toast(text, isError = false) {
    const el = $('toast');
    el.textContent = text;
    el.className = isError ? 'err' : '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 6000 : 3000);
  }

  // ---------------------------------------------------------------- Giriş / çıkış
  function showLogin(message = '') {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* yok say */ }
    clearTimeout(timer);
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('loginError').textContent = message;
    $('password').value = '';
    $('password').focus();
  }
  function showApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginBtn').disabled = true;
    $('loginError').textContent = '';
    try {
      const res = await api('POST', '/login', { password: $('password').value });
      token = res.token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* yok say */ }
      showApp();
      await refresh();
    } catch (err) {
      $('loginError').textContent = err.message;
      $('password').select();
    } finally {
      $('loginBtn').disabled = false;
    }
  });
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('POST', '/logout', {}); } catch { /* oturum zaten bitmiş olabilir */ }
    showLogin();
  });

  // ---------------------------------------------------------------- İşlemler
  // Bir işlemi çalıştırır, sonucu bildirir ve listeyi hemen yeniler
  async function act(fn, okText) {
    if (busy) return;
    busy = true;
    try {
      await fn();
      if (okText) toast(okText);
      await refresh();
    } catch (err) {
      if (err.status === 401) showLogin('Oturum süresi doldu, yeniden giriş yap.');
      else toast(err.message, true);
    } finally {
      busy = false;
    }
  }

  function kick(p) {
    const reason = prompt(`${p.name} oyundan atılsın mı?\nSebep (isteğe bağlı, oyuncuya gösterilir):`, '');
    if (reason === null) return;
    act(() => api('POST', '/kick', { id: p.id, reason }), `${p.name} atıldı`);
  }
  function banPlayer(p) {
    const reason = prompt(`${p.name} (${p.ip}) banlansın mı?\nBu IP'den kimse oyuna giremez; ban bu sayfadan kaldırılabilir.\nSebep (isteğe bağlı, oyuncuya gösterilir):`, '');
    if (reason === null) return;
    act(() => api('POST', '/ban', { id: p.id, reason }), `${p.ip} banlandı`);
  }
  function banAddress(ip, hint = '') {
    const reason = prompt(`${ip} banlansın mı?${hint ? '\n' + hint : ''}\nSebep (isteğe bağlı):`, '');
    if (reason === null) return;
    act(() => api('POST', '/ban', { ip, reason }), `${ip} banlandı`);
  }
  function unban(b) {
    if (!confirm(`${b.ip} adresinin banı kaldırılsın mı?`)) return;
    act(() => api('POST', '/unban', { ip: b.ip }), `${b.ip} banı kaldırıldı`);
  }
  // Banı kaldırır ve adresi izinli listeye alır: aynı evden iki kişi oynuyorsa yeniden banlanmasınlar
  function unbanAndAllow(b) {
    if (!confirm(`${b.ip} adresinin banı kaldırılıp izinli listeye eklensin mi?\nBu IP'den aynı anda birden fazla kişi oynayabilecek.`)) return;
    act(async () => { await api('POST', '/unban', { ip: b.ip }); await api('POST', '/allow', { ip: b.ip, on: true }); }, `${b.ip} banı kaldırıldı ve izin verildi`);
  }

  $('banForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = $('banIp').value.trim();
    if (!ip) return;
    act(async () => {
      await api('POST', '/ban', { ip, reason: $('banReason').value });
      $('banIp').value = ''; $('banReason').value = '';
    }, `${ip} banlandı`);
  });
  $('allowForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = $('allowIp').value.trim();
    if (!ip) return;
    act(async () => { await api('POST', '/allow', { ip, on: true }); $('allowIp').value = ''; }, `${ip} izinli listeye eklendi`);
  });
  $('sayForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('sayText').value.trim();
    if (!text) return;
    act(async () => { await api('POST', '/say', { text }); $('sayText').value = ''; }, 'Duyuru gönderildi');
  });
  for (const input of document.querySelectorAll('input[name=ipRule]')) {
    input.addEventListener('change', () => {
      const names = { ban: 'Engelle ve IP\'yi banla', block: 'Sadece engelle', off: 'Kapalı' };
      act(() => api('POST', '/settings', { ipRule: input.value }), `Kural: ${names[input.value]}`);
    });
  }
  for (const b of $('logFilters').children) {
    b.addEventListener('click', () => {
      logFilter = b.dataset.f;
      for (const o of $('logFilters').children) o.classList.toggle('sel', o === b);
      if (state) renderLog(state);
    });
  }

  // ---------------------------------------------------------------- Çizim
  const pad = (n) => String(n).padStart(2, '0');
  function duration(sec) {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60);
    if (d) return `${d} gün ${hh} sa`;
    if (hh) return `${hh} sa ${mm} dk`;
    if (mm) return `${mm} dk ${sec % 60} sn`;
    return `${sec} sn`;
  }
  const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const dateTime = (t) => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const MODE = { classic: 'Klasik', tdm: 'Takımlı ÖM', ffa: 'Herkes Tek' };
  const td = (label, props = {}, ...kids) => h('td', { 'data-l': label, ...props }, ...kids);

  function table(heads, rows, emptyText) {
    if (!rows.length) return h('div', { class: 'empty', text: emptyText });
    return h('table', {}, h('thead', {}, h('tr', {}, heads.map((t) => h('th', { text: t })))), h('tbody', {}, rows));
  }

  function renderPlayers(s) {
    $('playersCount').textContent = `${s.players.length} oyunda · ${s.lobby} menüde`;
    const rows = [...s.players].sort((a, b) => a.mode.localeCompare(b.mode) || a.map.localeCompare(b.map) || a.id - b.id).map((p) => h('tr', { class: p.alive ? '' : 'dead' },
      td('Oyuncu', {}, h('b', { text: p.name, class: p.mode === 'ffa' ? '' : p.team === 'T' ? 't' : 'ct' })),
      td('Oda', { text: `${MODE[p.mode] || p.mode} · de_${p.map}`.replace('de_arena', 'dm_arena') }),
      td('Takım', { text: p.mode === 'ffa' ? '–' : p.team }),
      td('IP', {}, h('span', { class: 'mono', text: p.ip }),
        p.local && h('span', { class: 'tag', text: 'YEREL', title: 'Sunucunun çalıştığı bilgisayar: kural uygulanmaz, banlanamaz' }),
        !p.reliable && h('span', { class: 'tag warn', text: 'BELİRSİZ', title: 'IP güvenilir biçimde belirlenemedi (vekil ayarı eksik): kural ve ban uygulanmaz' }),
        p.allowed && h('span', { class: 'tag okk', text: 'İZİNLİ', title: 'İzinli listede: aynı IP kuralı uygulanmaz' })),
      td('Ping', { text: `${p.ping} ms` }),
      td('Leş / ölüm', { text: `${p.k} / ${p.d}` }),
      td('Süre', { text: duration((s.now - p.since) / 1000) }),
      td('', { class: 'act' },
        h('button', { class: 'small', text: 'At', title: 'Oyundan at (yeniden girebilir)', onclick: () => kick(p) }),
        h('button', { class: 'small danger', text: 'Banla', disabled: !p.reliable || p.local, title: p.local ? 'Yerel adres banlanamaz' : !p.reliable ? 'IP belirsiz: banlanamaz' : 'IP adresini banla', onclick: () => banPlayer(p) })),
    ));
    $('players').replaceChildren(table(['Oyuncu', 'Oda', 'Takım', 'IP', 'Ping', 'Leş / ölüm', 'Süre', ''], rows, 'Şu an oyunda kimse yok.'));
  }

  function renderBans(s) {
    $('bansCount').textContent = s.bans.length ? `${s.bans.length} adres` : '';
    const rows = s.bans.map((b) => h('tr', {},
      td('IP', {}, h('span', { class: 'mono', text: b.ip }),
        b.by === 'otomatik' && h('span', { class: 'tag auto', text: 'OTOMATİK', title: 'Aynı IP kuralı tarafından banlandı' }),
        b.fixed && h('span', { class: 'tag', text: 'AYAR', title: 'BANNED_IPS ortam değişkeninden geliyor' })),
      td('Sebep', { text: b.reason || '–' }),
      td('Oyuncular', { text: b.names && b.names.length ? b.names.join(', ') : '–' }),
      td('Tarih', { text: b.at ? dateTime(b.at) : '–' }),
      td('', { class: 'act' }, b.fixed
        ? h('span', { class: 'note', text: 'sunucu ayarlarından kaldırılır' })
        : [h('button', { class: 'small ok', text: 'Banı kaldır', onclick: () => unban(b) }),
          h('button', { class: 'small', text: 'Kaldır + izin ver', title: 'Banı kaldır ve bu IP\'yi aynı IP kuralından muaf tut', onclick: () => unbanAndAllow(b) })]),
    ));
    $('bans').replaceChildren(table(['IP', 'Sebep', 'Oyuncular', 'Tarih', ''], rows, 'Yasaklı IP yok.'));
  }

  function renderRule(s) {
    for (const input of document.querySelectorAll('input[name=ipRule]')) {
      const on = input.value === s.settings.ipRule;
      if (!busy) input.checked = on;
      input.closest('.rule').classList.toggle('sel', on);
    }
    const pills = s.allow.map((a) => h('span', { class: 'pill' }, h('span', { class: 'mono', text: a.ip }),
      a.fixed ? h('span', { class: 'tag', text: 'AYAR', title: 'ALLOWED_IPS ortam değişkeninden geliyor' })
        : h('button', { text: '✕', title: 'Listeden çıkar', onclick: () => act(() => api('POST', '/allow', { ip: a.ip, on: false }), `${a.ip} izinli listeden çıkarıldı`) })));
    $('allow').replaceChildren(...(pills.length ? pills : [h('span', { class: 'empty', text: 'İzinli IP yok.' })]));
  }

  const LOG_GROUP = { ban: 'mod', unban: 'mod', block: 'mod', kick: 'mod', allow: 'mod', join: 'join', leave: 'join', login: 'admin', loginfail: 'admin', settings: 'admin', say: 'admin' };
  function renderLog(s) {
    const banned = new Set(s.bans.map((b) => b.ip));
    const items = s.log.filter((e) => logFilter === 'all' || LOG_GROUP[e.type] === logFilter);
    const rows = items.map((e) => h('div', { class: `ev ${e.type}` },
      h('time', { text: clock(e.t), title: dateTime(e.t) }),
      h('span', { class: 'tx', text: e.text }),
      // Oyundan çıkmış birini de banlayabilmek için giriş kayıtlarında ban düğmesi
      e.type === 'join' && e.ip && !banned.has(e.ip) && !/^127\.|^::1$/.test(e.ip)
        && h('button', { class: 'small danger', text: 'Banla', onclick: () => banAddress(e.ip, e.text) }),
    ));
    $('log').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty', text: 'Kayıt yok.' })]));
  }

  function render(s) {
    $('stPlayers').textContent = s.players.length;
    $('stLobby').textContent = s.lobby;
    $('stBans').textContent = s.bans.length;
    $('stUptime').textContent = duration(s.server.uptime);
    $('stTick').textContent = s.server.tickAvgMs.toFixed(2);
    const warnings = [...s.warnings];
    if (s.passwordSource === 'file' && s.server.render) warnings.push('Admin şifresi sunucu her yeniden başladığında değişiyor. Render → Environment bölümüne ADMIN_PASSWORD ekle.');
    $('warnings').replaceChildren(...warnings.map((w) => h('div', { class: 'warnbox', text: w })));
    $('renderNote').classList.toggle('hidden', !s.server.render);
    renderPlayers(s);
    renderRule(s);
    renderBans(s);
    renderLog(s);
  }

  async function refresh() {
    clearTimeout(timer);
    if (!token) return;
    try {
      state = await api('GET', '/state');
      render(state);
    } catch (err) {
      if (err.status === 401) return showLogin('Oturum süresi doldu, yeniden giriş yap.');
      toast(err.message, true);
    }
    // Sekme arka plandayken boşuna istek atılmaz
    timer = setTimeout(refresh, document.hidden ? REFRESH_MS * 5 : REFRESH_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refresh(); });

  if (token) { showApp(); refresh(); } else showLogin();
})();
