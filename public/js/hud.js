// Ekran arayüzü: can/zırh/cephane, radar, skor tablosu, satın alma menüsü, sohbet ve mesajlar.
import { WEAPONS, ITEMS, BUY_MENU, ATTACHMENTS, canAttach } from '../shared/weapons.js';
import { CELL, MAPS, MAP_IDS, buildMap } from '../shared/map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const teamCls = (t) => (t === 'T' ? 'tcol' : t === 'CT' ? 'ctcol' : '');
const RADAR_PPM = 2.6;
const CH_SHAPES = ['cross', 't', 'x', 'circle', 'dot'];
const OUTLINE = '0 0 0 1px rgba(0,0,0,.85)';

function styleCrosshair(el, c) {
  const st = el.style;
  st.setProperty('--col', c.color);
  st.setProperty('--len', c.len + 'px');
  st.setProperty('--th', c.thick + 'px');
  st.setProperty('--dot', Math.max(2, Math.round(c.thick * 1.5)) + 'px');
  st.setProperty('--ol', c.outline ? OUTLINE : '0 0 0 0 transparent');
  st.setProperty('--oli', c.outline ? 'inset ' + OUTLINE : '0 0 0 0 transparent');
  st.opacity = c.alpha;
  for (const s of CH_SHAPES) el.classList.toggle('shape-' + s, s === c.shape);
}

export class HUD {
  constructor(map) {
    this.cache = {};
    this.buyOpen = false;
    this.buyCat = null;
    this.buyCtx = null;
    this.centerTimer = 0;
    this.noteTimer = 0;
    this.moneyShown = null;
    this.radar = $('radar').getContext('2d');
    this.setMap(map);
  }

  set(id, value, prop = 'textContent') {
    const k = id + prop;
    if (this.cache[k] === value) return;
    this.cache[k] = value;
    $(id)[prop] = value;
  }
  toggle(id, cls, on) {
    const k = id + '.' + cls;
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    $(id).classList.toggle(cls, on);
  }

  setVisible(v) { this.toggle('hud', 'hidden', !v); }
  fps(v) {
    this.toggle('fps', 'hidden', v === null);
    if (v !== null) this.set('fps', `${Math.round(v)} FPS`);
  }
  setHP(hp) { this.set('hpVal', String(hp)); this.toggle('hpBlk', 'low', hp <= 25); }
  setArmor(a) { this.set('arVal', String(a)); }
  setMoney(m) {
    if (this.moneyShown !== null && m !== this.moneyShown) {
      const d = m - this.moneyShown;
      const el = $('moneyDelta');
      el.textContent = (d > 0 ? '+$' : '-$') + Math.abs(d);
      el.style.color = d > 0 ? '#7dff7d' : '#ff6a5a';
      el.style.transition = 'none';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      void el.offsetWidth;
      el.style.transition = '';
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-12px)'; }, 900);
    }
    this.moneyShown = m;
    this.set('moneyVal', String(m));
  }
  setAmmo(a, b) {
    this.set('magVal', a ?? '');
    this.set('resVal', b ?? '');
    this.toggle('ammoSep', 'hidden', b === null || b === undefined);
  }
  setWeapon(name) { this.set('wname', name || ''); }
  setTimer(text, danger, label) {
    this.set('timerVal', text);
    this.set('roundLbl', label);
    this.toggle('timer', 'danger', !!danger);
  }
  setScore(t, ct, lt = 'T', lct = 'CT', ffa = false) {
    this.set('scoreT', String(t)); this.set('scoreCT', String(ct));
    this.set('scoreTLbl', lt); this.set('scoreCTLbl', lct);
    this.toggle('topbar', 'ffa', ffa);
  }
  icons({ buy, bomb, kit, helmet }) {
    const html = (buy ? '<span class="buy">$ SATIN AL</span>' : '') + (bomb ? '<span class="bomb">C4</span>' : '') + (kit ? '<span>KİT</span>' : '') + (helmet ? '<span>KASK</span>' : '');
    this.set('icons', html, 'innerHTML');
  }
  // Nişangah: spread o anki sapmanın piksel karşılığı (dinamik nişangahta boşluğa eklenir)
  crosshair(spread, visible, forceDot = false) {
    const c = this.ch;
    this.toggle('crosshair', 'dot', c.dot || forceDot);
    const g = Math.round(c.gap + (c.dynamic ? spread : 0));
    if (this.cache.gap !== g) { this.cache.gap = g; $('crosshair').style.setProperty('--gap', g + 'px'); }
    this.toggle('crosshair', 'hidden', !visible);
  }
  // Nişangah görünümü (şekil, renk, boyutlar); ayarlardaki önizleme de aynı şekilde çizilir
  setCrosshairStyle(c) {
    this.ch = c;
    this.cache.gap = null;
    styleCrosshair($('crosshair'), c);
    const pv = $('chPreview');
    if (pv) { styleCrosshair(pv, c); pv.classList.toggle('dot', c.dot); pv.style.setProperty('--gap', c.gap + 'px'); }
  }
  flash(op) { const v = op.toFixed(3); if (this.cache.flash !== v) { this.cache.flash = v; $('flash').style.opacity = v; } }
  hurt(op) { const v = op.toFixed(3); if (this.cache.hurt !== v) { this.cache.hurt = v; $('hurt').style.opacity = v; } }
  scope(on) { this.toggle('scope', 'hidden', !on); }
  redDot(on) { this.toggle('reddot', 'hidden', !on); }
  hint(text) { this.set('hint', text || ''); }
  spec(html) { this.set('spec', html ? `<span>${html}</span>` : '', 'innerHTML'); }
  enemyName(text, color) {
    this.set('enemyName', text || '');
    if (this.cache.enemyColor !== color) { this.cache.enemyColor = color; $('enemyName').style.color = color || '#fff'; }
  }
  progress(label, frac) {
    if (frac === null || frac === undefined) { this.toggle('progress', 'hidden', true); return; }
    this.toggle('progress', 'hidden', false);
    this.set('progressLabel', label);
    $('progressFill').style.width = Math.min(100, frac * 100).toFixed(1) + '%';
  }
  center(main, sub = '', ms = 3000) {
    $('centerMain').textContent = main || '';
    $('centerSub').textContent = sub || '';
    clearTimeout(this.centerTimer);
    if (ms) this.centerTimer = setTimeout(() => { $('centerMain').textContent = ''; $('centerSub').textContent = ''; }, ms);
  }
  note(text, ms = 2500) {
    $('note').textContent = text;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { $('note').textContent = ''; }, ms);
  }

  killfeed({ k, kTeam, v, vTeam, w, hs, mine }) {
    const el = document.createElement('div');
    el.className = 'kf' + (mine ? ' mine' : '');
    el.innerHTML = (k ? `<span class="${teamCls(kTeam)}">${esc(k)}</span>` : '') +
      `<span class="w">${esc(w)}</span>` + (hs ? '<span class="hs">KAFA</span>' : '') +
      `<span class="${teamCls(vTeam)}">${esc(v)}</span>`;
    const box = $('killfeed');
    box.appendChild(el);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  chat({ name, team, text, tm, dead, system }) {
    const el = document.createElement('div');
    if (system) { el.className = 'sys'; el.textContent = text; }
    else {
      el.innerHTML = (dead ? '<span style="color:#aaa">*ÖLÜ* </span>' : '') + (tm ? '<span style="color:#aaa">(Takım) </span>' : '') +
        `<span class="${teamCls(team)}">${esc(name)}</span>: ${esc(text)}`;
    }
    const box = $('chatlog');
    box.appendChild(el);
    while (box.children.length > 8) box.firstChild.remove();
    setTimeout(() => { el.style.opacity = '0'; }, 11000);
    setTimeout(() => el.remove(), 12000);
  }
  openChat(teamOnly) {
    const i = $('chatinput');
    i.classList.remove('hidden');
    i.placeholder = teamOnly ? 'Takım sohbeti (Enter gönder, Esc iptal)' : 'Herkese (Enter gönder, Esc iptal)';
    i.value = '';
    i.focus(); // iOS klavyeyi sadece dokunma olayı içinde yapılan odaklamada açar
  }
  closeChat() { const i = $('chatinput'); const v = i.value; i.blur(); i.classList.add('hidden'); return v; }

  scoreboard(show, data) {
    $('scoreboard').classList.toggle('hidden', !show);
    if (!show || !data) return;
    const { roster, myId, score, round, bombCarrier, myTeam, mode, phase } = data;
    const table = (ps, cls) => {
      const rows = ps.sort((a, b) => b.k - a.k || a.d - b.d).map((p, i) => {
        const status = !p.alive ? 'ÖLÜ' : p.id === bombCarrier && myTeam === 'T' ? 'BOMBA' : '';
        const rank = mode === 'ffa' ? `${i + 1}. ` : '';
        return `<tr class="${p.id === myId ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td class="${cls(p)}">${rank}${esc(p.name)}</td><td>${status}</td><td>${p.k}</td><td>${p.d}</td><td>${p.ping}</td></tr>`;
      }).join('');
      return `<table><tr><th style="width:46%">Oyuncu</th><th>Durum</th><th>Leş</th><th>Ölüm</th><th>Ping</th></tr>${rows || '<tr><td colspan="5" style="color:#777">Oyuncu yok</td></tr>'}</table>`;
    };
    const section = (team, label) => `<div class="hdr ${teamCls(team)}"><span>${label}</span><span>${score[team]}</span></div>` +
      table(roster.filter((p) => p.team === team), () => teamCls(team));
    const modeName = { classic: 'Klasik', tdm: 'Takımlı Ölüm Maçı', ffa: 'Herkes Tek' }[mode] || '';
    const sub = mode === 'classic' ? (round ? 'Raund ' + round : 'Isınma') : phase === 'warmup' ? 'Isınma' : phase === 'gameover' ? 'Maç bitti' : 'En çok leş kazanır';
    $('sbBody').innerHTML = `<h2>DUST STRIKE · ${modeName} · ${sub}</h2>` +
      (mode === 'ffa' ? table(roster, () => '') : section('T', 'Teröristler') + section('CT', 'Anti-Terör Timi'));
  }

  // ---------------- Satın alma menüsü
  buyPrice(item, ctx) {
    if (ctx.dm) return 0;
    if (item.startsWith('att_')) return ATTACHMENTS[item.slice(4)].price;
    if (item === 'vesthelm' && ctx.armor >= 100 && !ctx.helmet) return 350;
    return (WEAPONS[item] || ITEMS[item]).price;
  }
  itemDef(item) { return item.startsWith('att_') ? ATTACHMENTS[item.slice(4)] : WEAPONS[item] || ITEMS[item]; }
  buyColumns(ctx) {
    return BUY_MENU.map((cat) => ({
      name: cat.name,
      items: cat.items.filter((it) => {
        const d = this.itemDef(it);
        if (it === 'kit') return ctx.team === 'CT' && !ctx.ffa;
        return !d.team || d.team === ctx.team || ctx.ffa;
      }),
    }));
  }
  openBuy(ctx) {
    this.buyOpen = true;
    this.buyCat = null;
    this.buyCtx = ctx;
    $('buymenu').classList.remove('hidden');
    this.renderBuy();
  }
  refreshBuy(ctx) { if (this.buyOpen) { this.buyCtx = ctx; this.renderBuy(); } }
  closeBuy() { this.buyOpen = false; $('buymenu').classList.add('hidden'); }
  renderBuy() {
    const ctx = this.buyCtx;
    const cols = this.buyColumns(ctx);
    const owned = new Set([ctx.inv.primary, ctx.inv.secondary]);
    $('buyCols').innerHTML = cols.map((c, ci) => {
      const isAtt = c.items[0]?.startsWith('att_');
      const title = isAtt ? `${c.name} <small style="color:#aaa">(${ctx.attWeapon ? WEAPONS[ctx.attWeapon].name : 'silah yok'})</small>` : c.name;
      return `<div class="bcol ${this.buyCat === ci ? 'active' : ''}"><h3>${ci + 1}. ${title}</h3>` +
        c.items.map((it, ii) => {
          const d = this.itemDef(it);
          const price = this.buyPrice(it, ctx);
          let off = price > ctx.money, have = owned.has(it);
          if (isAtt) {
            const a = it.slice(4);
            have = ctx.attHave.includes(a);
            off = off || have || !ctx.attWeapon || !canAttach(ctx.attWeapon, a);
          }
          return `<button class="bitem ${have ? 'owned' : ''}" data-item="${it}" title="${d.desc || ''}" ${off ? 'disabled' : ''}><span><span class="k">${ii + 1}</span>${d.name}</span><span class="p">${have ? 'TAKILI' : price ? '$' + price : 'BEDAVA'}</span></button>`;
        }).join('') + '</div>';
    }).join('');
    $('buyMoney').textContent = '$' + ctx.money;
    for (const b of $('buyCols').querySelectorAll('.bitem')) b.onclick = () => ctx.onBuy(b.dataset.item);
  }
  buyKey(n) {
    const cols = this.buyColumns(this.buyCtx);
    if (n === 0) { this.buyCat = null; this.renderBuy(); return; }
    if (this.buyCat === null) {
      if (cols[n - 1]) { this.buyCat = n - 1; this.renderBuy(); }
    } else {
      const it = cols[this.buyCat].items[n - 1];
      if (it) this.buyCtx.onBuy(it);
      this.buyCat = null;
      this.renderBuy();
    }
  }

  // ---------------- Radar
  setMap(map) { this.map = map; this.radarBase = this.buildRadarBase(map); }
  buildRadarBase(map) {
    const s = CELL * RADAR_PPM;
    const c = document.createElement('canvas');
    c.width = map.w * s; c.height = map.h * s;
    const g = c.getContext('2d');
    for (let r = 0; r < map.h; r++) {
      for (let col = 0; col < map.w; col++) {
        const ch = map.grid[r][col];
        if (ch === '#') continue;
        g.fillStyle = ch === '.' ? 'rgba(220,200,160,0.55)' : 'rgba(120,90,50,0.8)';
        g.fillRect(col * s, r * s, s + 0.5, s + 0.5);
      }
    }
    g.fillStyle = 'rgba(255,90,60,0.9)';
    g.font = 'bold 22px Verdana';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [k, st] of Object.entries(map.sites)) {
      g.fillText(k, ((st.x0 + st.x1) / 2 - map.ox) * RADAR_PPM, ((st.z0 + st.z1) / 2 - map.oz) * RADAR_PPM);
    }
    return c;
  }
  drawRadar({ x, z, yaw, mates, bomb, team }) {
    const g = this.radar;
    const W = 190, R = 92;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(yaw);
    const { ox, oz } = this.map;
    g.translate(-(x - ox) * RADAR_PPM, -(z - oz) * RADAR_PPM);
    g.drawImage(this.radarBase, 0, 0);
    const dot = (px, pz, col, r = 4) => {
      g.fillStyle = col;
      g.beginPath(); g.arc((px - ox) * RADAR_PPM, (pz - oz) * RADAR_PPM, r, 0, Math.PI * 2); g.fill();
    };
    for (const m of mates) dot(m.x, m.z, team === 'T' ? '#ffb347' : '#7fb2ff', 4);
    if (bomb) dot(bomb.x, bomb.z, bomb.planted ? '#ff2a2a' : '#ff9d2a', bomb.planted ? 6 : 4);
    g.restore();
    g.strokeStyle = 'rgba(255,178,40,0.6)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, W / 2, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(W / 2, W / 2 - 7); g.lineTo(W / 2 - 5, W / 2 + 5); g.lineTo(W / 2 + 5, W / 2 + 5); g.closePath(); g.fill();
  }

  // ---------------- Menü
  showMenu(v) { $('menu').classList.toggle('hidden', !v); }
  menuStatus(t) { $('menuStatus').textContent = t; }
  // Menüdeki mod + harita seçimi; seçili mod o haritada yoksa ilk uygun harita seçilir ve döndürülür
  menuRooms(rooms, mode, mapId, onMapPick) {
    for (const k of ['classic', 'tdm', 'ffa']) {
      let total = 0, max = 0;
      for (const r of Object.values(rooms || {})) if (r.mode === k) { total += r.total; max += r.max; }
      $('cnt-' + k).textContent = rooms ? `${total} oyuncu` : '';
      document.querySelector(`.mode[data-mode="${k}"]`).classList.toggle('sel', k === mode);
    }
    const ids = MAP_IDS.filter((id) => MAPS[id].modes.includes(mode));
    if (!ids.includes(mapId)) mapId = ids[0];
    $('mapPick').innerHTML = ids.map((id) => {
      const r = rooms && rooms[`${mode}:${id}`];
      return `<button class="mapc ${id === mapId ? 'sel' : ''}" data-map="${id}"><img src="${this.mapPreview(id)}" alt=""><b>${MAPS[id].title}</b><span>${MAPS[id].desc}</span><small>${r ? `${r.total}/${r.max}` : '0'} oyuncu</small></button>`;
    }).join('');
    for (const b of $('mapPick').querySelectorAll('.mapc')) b.onclick = () => onMapPick && onMapPick(b.dataset.map);
    const r = rooms && rooms[`${mode}:${mapId}`];
    $('cntT').textContent = (r ? r.T : 0) + ' oyuncu';
    $('cntCT').textContent = (r ? r.CT : 0) + ' oyuncu';
    $('teamPick').classList.toggle('hidden', mode === 'ffa');
    $('ffaPick').classList.toggle('hidden', mode !== 'ffa');
    return mapId;
  }
  mapPreview(id) {
    this.previews = this.previews || {};
    if (this.previews[id]) return this.previews[id];
    const m = buildMap(id);
    const s = 3;
    const c = document.createElement('canvas');
    c.width = m.w * s; c.height = m.h * s;
    const g = c.getContext('2d');
    g.fillStyle = '#16130f'; g.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < m.h; r++) for (let col = 0; col < m.w; col++) {
      const ch = m.grid[r][col];
      if (ch === '#') continue;
      g.fillStyle = ch === '.' ? '#cdb88f' : '#7a5a32';
      g.fillRect(col * s, r * s, s, s);
    }
    g.fillStyle = 'rgba(220,60,40,0.55)';
    for (const st of Object.values(m.sites)) g.fillRect((st.x0 - m.ox) / CELL * s, (st.z0 - m.oz) / CELL * s, (st.x1 - st.x0) / CELL * s, (st.z1 - st.z0) / CELL * s);
    return (this.previews[id] = c.toDataURL());
  }
  showPause(v) { $('pause').classList.toggle('hidden', !v); }
}
