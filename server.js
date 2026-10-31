// DUST STRIKE oyun sunucusu: statik dosyaları sunar ve WebSocket üzerinden oyunu yönetir.
// Her oyun modu ayrı bir odadır; oyuncular menüden mod seçer, modlar aynı anda oynanabilir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { buildMap, MAPS, MAP_IDS } from './public/shared/map.js';
import { WEAPONS, ITEMS, ATTACHMENTS, DEFAULT_PISTOL, calcDamage, blastDamage, canAttach, attCode } from './public/shared/weapons.js';
import { raycastWorld, stepNade, groundAt, NADE_DT, NADE_FUSE } from './public/shared/physics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const THREE_ADDONS_DIR = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm');

// Oyun ayarları (saniye)
const FREEZE_TIME = 5;
const ROUND_TIME = 115;
const BUY_TIME = 25;
const OVER_TIME = 6;
const GAMEOVER_TIME = 10;
const WARMUP_COUNTDOWN = 8;
const BOMB_TIME = 40;
const PLANT_TIME = 3;
const DEFUSE_TIME = 10;
const KIT_DEFUSE_TIME = 5;
const WIN_ROUNDS = 10;
const START_MONEY = 800;
const MAX_MONEY = 16000;
const RESPAWN_DELAY = 2.5;
const HE_RADIUS = 9;
const DM_TIME = Number(process.env.DM_TIME) || 10 * 60; // ölüm maçı süresi (sn)
const SPAWN_PROTECT = 2;

const MODES = {
  classic: { name: 'Klasik', teams: true, max: 20 },
  tdm: { name: 'Takımlı Ölüm Maçı', teams: true, max: 20, time: DM_TIME },
  ffa: { name: 'Herkes Tek', teams: false, max: 32, time: DM_TIME },
};
const TEAM_NAME = { T: 'Teröristler', CT: 'Anti-Terör Timi' };

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (urlPath === '/stats') {
    // Sunucu sağlık bilgisi (yük testi için): oyuncu sayıları ve tick süreleri
    const busy = Object.values(rooms).filter((r) => r.players.size).map((r) => ({ room: r.key, players: r.players.size, phase: r.phase }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ uptime: Math.round(process.uptime()), clients: clients.size, rooms: busy, tickAvgMs: +stats.avg.toFixed(2), tickMaxMs: +stats.max.toFixed(2), lateTicks: stats.late, memMB: Math.round(process.memoryUsage().rss / 1048576) }));
  }
  let root = PUBLIC_DIR;
  if (urlPath.startsWith('/three/addons/')) { root = THREE_ADDONS_DIR; urlPath = urlPath.slice('/three/addons'.length); }
  else if (urlPath.startsWith('/three/')) { root = THREE_DIR; urlPath = urlPath.slice('/three'.length); }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(root, '.' + urlPath);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- Yardımcılar
const clients = new Map();
let nextPlayerId = 1, nextItemId = 1, nextNadeId = 1, nextWid = 1;

const now = () => Date.now();
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const vec3 = (a) => (Array.isArray(a) && a.length === 3 && a.every(finite) ? a : null);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const r2 = (n) => Math.round(n * 100) / 100;

function send(p, m) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); }
function addMoney(p, n) { p.money = Math.max(0, Math.min(MAX_MONEY, p.money + n)); }
function cleanName(s) {
  s = String(s || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, 16);
  return s || 'Oyuncu' + Math.floor(Math.random() * 900 + 100);
}
function youMsg(p) {
  return {
    t: 'you', team: p.team, alive: p.alive, hp: p.hp, armor: p.armor, helmet: p.helmet, kit: p.kit,
    money: p.money, primary: p.primary, secondary: p.secondary, nades: p.nades, att: p.att,
    refunds: p.room ? p.room.refundList(p) : [],
  };
}
const sendYou = (p) => send(p, youMsg(p));

// ---------------------------------------------------------------- Oda (bir oyun modu)
class Room {
  constructor(mode, mapId) {
    this.mode = mode;
    this.key = `${mode}:${mapId}`;
    this.map = buildMap(mapId);
    this.cfg = MODES[mode];
    this.dm = mode !== 'classic';
    this.players = new Map();
    this.phase = 'warmup';
    this.phaseEnd = 0;
    this.roundStart = 0;
    this.round = 0;
    this.score = { T: 0, CT: 0 };
    this.loss = { T: 0, CT: 0 };
    this.bomb = null;
    this.plantedThisRound = false;
    this.items = [];
    this.nades = [];
    this.nadeAcc = 0;
    this.firedWids = new Set(); // ateş edilmiş silahlar (iade edilemez)
    this.msg = this.waitMsg();
  }

  waitMsg() { return this.mode === 'ffa' ? 'Isınma: en az 2 oyuncu bekleniyor' : 'Isınma: rakip takımdan oyuncu bekleniyor'; }
  broadcast(m, except = null, filter = null) {
    const s = JSON.stringify(m);
    for (const p of this.players.values()) {
      if (p !== except && p.ws.readyState === 1 && (!filter || filter(p))) p.ws.send(s);
    }
  }
  system(text) { this.broadcast({ t: 'chat', system: true, text }); }
  teamOf(team) { return [...this.players.values()].filter((p) => p.team === team); }
  enemies(a, b) { return a !== b && (this.mode === 'ffa' || a.team !== b.team); }
  enoughPlayers() {
    return this.mode === 'ffa' ? this.players.size >= 2 : this.teamOf('T').length > 0 && this.teamOf('CT').length > 0;
  }

  stateMsg() {
    const t = now();
    return {
      t: 'state', mode: this.mode, map: this.map.id, phase: this.phase, round: this.round, score: this.score, msg: this.msg, win: WIN_ROUNDS,
      left: this.phaseEnd ? Math.max(0, this.phaseEnd - t) : 0,
      buyLeft: this.dm || this.phase === 'warmup' ? 1e9 : Math.max(0, this.roundStart + BUY_TIME * 1000 - t),
    };
  }
  rosterMsg() {
    return { t: 'roster', ps: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, alive: p.alive, ping: p.ping })) };
  }
  bombMsg() {
    const b = this.bomb;
    if (!b) return { t: 'bomb', b: null };
    return {
      t: 'bomb',
      b: {
        state: b.state, carrier: b.carrier, pos: b.pos, site: b.site,
        left: b.state === 'planted' ? Math.max(0, b.explodeAt - now()) : 0,
        defuser: b.defusing ? b.defusing.id : 0,
      },
    };
  }
  itemsMsg() { return { t: 'items', items: this.items.map((i) => ({ id: i.id, w: i.w, p: i.p })) }; }

  // ---------------- Oyuncu yönetimi
  add(p, team) {
    p.room = this;
    this.players.set(p.id, p);
    p.kills = 0; p.deaths = 0; p.alive = false; p.lastPrimary = null; p.team = null;
    p.money = this.dm ? MAX_MONEY : START_MONEY;
    send(p, { t: 'room', mode: this.mode, map: this.map.id });
    this.setTeam(p, team, true);
  }

  remove(p) {
    this.dropBombIfCarrier(p);
    if (this.bomb?.planting?.id === p.id) this.bomb.planting = null;
    if (this.bomb?.defusing?.id === p.id) this.bomb.defusing = null;
    this.players.delete(p.id);
    p.room = null;
    p.alive = false;
    p.team = 'SPEC';
    this.broadcast({ t: 'leave', id: p.id });
    this.system(`${p.name} ayrıldı`);
    this.broadcast(this.rosterMsg());
    this.checkTeams();
    this.checkElimination();
    broadcastRooms();
  }

  autoTeam(p) {
    const t = this.teamOf('T').filter((o) => o !== p).length;
    const ct = this.teamOf('CT').filter((o) => o !== p).length;
    if (t === ct) return Math.random() < 0.5 ? 'T' : 'CT';
    return t < ct ? 'T' : 'CT';
  }

  setTeam(p, team, first = false) {
    // Herkes Tek modunda takım sadece görünüş içindir, herkes birbirine düşmandır
    if (this.mode === 'ffa') { if (!first) return; team = Math.random() < 0.5 ? 'T' : 'CT'; }
    else if (team !== 'T' && team !== 'CT') team = this.autoTeam(p);
    if (!first && p.team === team) return;
    if (p.alive) { this.dropBombIfCarrier(p); p.alive = false; }
    p.team = team;
    p.lastPrimary = null;
    this.resetInventory(p);
    const teamTxt = this.mode === 'ffa' ? '' : ` (${TEAM_NAME[team]})`;
    this.system(first ? `${p.name} katıldı${teamTxt}` : `${p.name} takım değiştirdi: ${TEAM_NAME[team]}`);
    if (this.dm || this.phase === 'warmup' || this.phase === 'freeze') this.spawnPlayer(p);
    else sendYou(p);
    this.broadcast(this.rosterMsg());
    send(p, this.stateMsg());
    send(p, this.bombMsg());
    send(p, this.itemsMsg());
    this.checkTeams();
    this.checkElimination();
    broadcastRooms();
  }

  resetInventory(p) {
    p.primary = null;
    p.secondary = DEFAULT_PISTOL[p.team] || 'glock';
    p.nades = { he: 0, flash: 0, smoke: 0 };
    p.armor = 0; p.helmet = false; p.kit = false;
    p.att = { 1: [], 2: [] };
    p.wid = { 1: 0, 2: nextWid++ }; // her silahın kimliği var (varsayılan tabanca dahil)
    p.buys = [];
  }

  owns(p, w) {
    if (w === 'knife') return true;
    if (w === 'bomb') return !!this.bomb && this.bomb.carrier === p.id;
    if (WEAPONS[w]?.nade) return p.nades[w] > 0;
    return p.primary === w || p.secondary === w;
  }

  pickSpawn(p) {
    const others = [...this.players.values()].filter((o) => o !== p && o.alive);
    if (!this.dm) {
      const list = this.map.spawns[p.team];
      let best = list[0], bestD = -1;
      for (const s of [...list].sort(() => Math.random() - 0.5)) {
        let d = Infinity;
        for (const o of others) d = Math.min(d, dist2(o.pos, s));
        if (d > bestD) { bestD = d; best = s; }
        if (d > 3) break;
      }
      return best;
    }
    // Ölüm maçı: rastgele adaylar arasından düşmanlara en uzak olanı seç
    const foes = others.filter((o) => this.enemies(p, o));
    let best = this.map.dmSpawns[0], bestD = -Infinity;
    for (let i = 0; i < 24; i++) {
      const s = this.map.dmSpawns[Math.floor(Math.random() * this.map.dmSpawns.length)];
      let d = 1e6;
      for (const o of foes) d = Math.min(d, dist2(o.pos, s));
      if (others.some((o) => dist2(o.pos, s) < 1.2)) d = -1;
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  spawnPlayer(p) {
    const t = now();
    const s = this.pickSpawn(p);
    p.pos = [s[0], s[1] || 0, s[2]];
    p.yaw = this.dm ? Math.atan2(s[0], s[2]) : this.map.yaw[p.team];
    p.pitch = 0;
    p.alive = true;
    p.hp = 100;
    p.sid++;
    p.respawnAt = 0;
    p.buys = [];
    if (this.dm) {
      // Ölüm maçında son alınan ana silah, zırh ve kask otomatik verilir
      this.resetInventory(p);
      p.primary = p.lastPrimary;
      p.att[1] = p.lastPrimary ? [...(p.lastAtt || [])] : [];
      p.armor = 100; p.helmet = true;
      p.money = MAX_MONEY;
      p.protectUntil = t + SPAWN_PROTECT * 1000;
    } else {
      p.protectUntil = 0;
      if (this.phase === 'warmup') p.money = MAX_MONEY;
    }
    sendYou(p);
    send(p, { t: 'spawn', p: p.pos, yaw: p.yaw, sid: p.sid, prot: this.dm ? SPAWN_PROTECT * 1000 : 0 });
  }

  // ---------------- Eşyalar ve bomba
  dropPos(p, forward = 1.2) {
    const d = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
    const o = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
    const hit = raycastWorld(this.map.boxes, o, d, forward + 0.4);
    const f = Math.max(0, Math.min(forward, hit.t - 0.4));
    const x = o[0] + d[0] * f, z = o[2] + d[2] * f;
    return [r2(x), r2(groundAt(this.map.boxes, x, z, p.pos[1]) + 0.02), r2(z)];
  }

  feetPos(p) { return [p.pos[0], r2(groundAt(this.map.boxes, p.pos[0], p.pos[2], p.pos[1]) + 0.02), p.pos[2]]; }

  // Yere bırakılan silah kimliğini (wid) korur: iade sadece satın alınan silahın kendisi için yapılabilir
  dropItem(p, w, atFeet = false) {
    const slot = WEAPONS[w].slot;
    const it = { id: nextItemId++, w, wid: p.wid[slot] || 0, p: atFeet ? this.feetPos(p) : this.dropPos(p), owner: p.id, t: now() };
    p.wid[slot] = 0;
    this.items.push(it);
    if (this.items.length > 40) this.items.shift();
    this.broadcast(this.itemsMsg());
    return it.id;
  }

  dropBombIfCarrier(p, thrown = false) {
    const b = this.bomb;
    if (!b || b.carrier !== p.id) return;
    b.state = 'dropped';
    b.carrier = null;
    b.pos = thrown ? this.dropPos(p) : this.feetPos(p);
    b.planting = null;
    b.dropBy = p.id;
    b.dropT = now();
    this.broadcast(this.bombMsg());
  }

  plantBomb(p) {
    const b = this.bomb;
    b.state = 'planted';
    b.carrier = null;
    b.pos = [p.pos[0], p.pos[1], p.pos[2]];
    b.site = b.planting.site;
    b.explodeAt = now() + BOMB_TIME * 1000;
    b.planting = null;
    this.plantedThisRound = true;
    addMoney(p, 300);
    sendYou(p);
    this.broadcast(this.bombMsg());
  }

  explodeBomb() {
    const b = this.bomb;
    b.state = 'exploded';
    this.broadcast({ t: 'boom', type: 'c4', p: b.pos });
    for (const v of this.players.values()) {
      if (!v.alive) continue;
      const d = dist(v.pos, b.pos);
      if (d > 30) continue;
      const raw = d < 8 ? 500 : 200 * (1 - (d - 8) / 22);
      this.damage(v, null, blastDamage(raw, v.armor), 'bomb', false);
    }
    this.broadcast(this.bombMsg());
    this.endRound('T', 'bomb');
  }

  // ---------------- Hasar
  damage(v, a, dmg, weapon, hs) {
    if (!v.alive) return;
    if (v.protectUntil > now()) return;
    if (this.dm && this.phase === 'gameover') return;
    v.hp -= dmg.hp;
    v.armor = Math.max(0, v.armor - dmg.armor);
    if (v.armor === 0) v.helmet = false;
    send(v, { t: 'hurt', a: a ? a.id : 0, d: dmg.hp, hp: Math.max(0, v.hp), armor: v.armor, from: a ? a.pos : null });
    if (v.hp <= 0) { v.hp = 0; this.kill(v, a, weapon, hs); }
  }

  kill(v, k, weapon, hs) {
    if (!v.alive) return;
    v.alive = false;
    v.deaths++;
    if (k && k !== v) {
      k.kills++;
      if (!this.dm) addMoney(k, WEAPONS[weapon]?.reward ?? 300);
      if (this.mode === 'tdm' && this.phase === 'live') this.score[k.team]++;
      sendYou(k);
    }
    if (!this.dm) {
      const drop = v.primary || v.secondary;
      if (drop) {
        if (v.primary === drop) v.primary = null; else v.secondary = null;
        this.dropItem(v, drop, true);
      }
    }
    v.buys = [];
    this.dropBombIfCarrier(v);
    if (this.bomb?.planting?.id === v.id) this.bomb.planting = null;
    if (this.bomb?.defusing?.id === v.id) { this.bomb.defusing = null; this.broadcast(this.bombMsg()); }
    this.broadcast({ t: 'kill', k: k ? k.id : 0, v: v.id, w: weapon, hs: !!hs });
    if (this.dm || this.phase === 'warmup') v.respawnAt = now() + RESPAWN_DELAY * 1000;
    sendYou(v);
    this.broadcast(this.rosterMsg());
    if (this.mode === 'tdm') this.broadcast(this.stateMsg());
    this.checkElimination();
  }

  // ---------------- Maç akışı
  checkTeams() {
    const enough = this.enoughPlayers();
    if (this.phase === 'warmup') {
      if (enough && !this.phaseEnd) {
        this.phaseEnd = now() + (this.dm ? 5000 : WARMUP_COUNTDOWN * 1000);
        this.msg = this.mode === 'ffa' ? 'Yeterli oyuncu var — maç başlıyor!' : 'Her iki takımda oyuncu var — maç başlıyor!';
        this.broadcast(this.stateMsg());
      } else if (!enough && this.phaseEnd) {
        this.phaseEnd = 0;
        this.msg = this.waitMsg();
        this.broadcast(this.stateMsg());
      }
    } else if (!enough) {
      this.toWarmup();
    }
  }

  toWarmup() {
    this.phase = 'warmup';
    this.phaseEnd = 0;
    this.round = 0;
    this.score = { T: 0, CT: 0 };
    this.bomb = null;
    this.items = [];
    this.nades = [];
    this.firedWids.clear();
    this.msg = this.waitMsg();
    for (const p of this.players.values()) {
      p.money = MAX_MONEY;
      if (!p.alive) this.spawnPlayer(p); else sendYou(p);
    }
    this.broadcast(this.stateMsg());
    this.broadcast(this.bombMsg());
    this.broadcast(this.itemsMsg());
    this.broadcast(this.rosterMsg());
    this.checkTeams();
  }

  startMatch() {
    this.score = { T: 0, CT: 0 };
    this.loss = { T: 0, CT: 0 };
    this.round = 0;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.money = this.dm ? MAX_MONEY : START_MONEY; p.alive = false;
    }
    if (this.dm) {
      this.phase = 'live';
      this.phaseEnd = now() + this.cfg.time * 1000;
      this.bomb = null;
      this.items = [];
      this.nades = [];
      this.msg = this.mode === 'ffa' ? 'Maç başladı! En çok leşi alan oyuncu kazanır' : 'Maç başladı! En çok leşi alan takım kazanır';
      for (const p of this.players.values()) this.spawnPlayer(p);
      this.system(`Maç başladı! Süre: ${this.cfg.time / 60} dakika.`);
      this.broadcast(this.stateMsg());
      this.broadcast(this.bombMsg());
      this.broadcast(this.itemsMsg());
      this.broadcast(this.rosterMsg());
      return;
    }
    this.system('Maç başladı! İlk ' + WIN_ROUNDS + ' raundu alan kazanır.');
    this.startRound();
  }

  startRound() {
    const t = now();
    this.round++;
    this.phase = 'freeze';
    this.phaseEnd = t + FREEZE_TIME * 1000;
    this.roundStart = t;
    this.items = [];
    this.nades = [];
    this.firedWids.clear();
    this.plantedThisRound = false;
    this.msg = `Raund ${this.round}`;
    const ts = this.teamOf('T'), cts = this.teamOf('CT');
    const all = [...ts, ...cts];
    for (const p of all) { if (!p.alive) this.resetInventory(p); p.alive = false; }
    for (const p of all) this.spawnPlayer(p);
    if (ts.length) {
      const c = ts[Math.floor(Math.random() * ts.length)];
      this.bomb = { state: 'carried', carrier: c.id, pos: null, site: null, planting: null, defusing: null };
    } else this.bomb = null;
    this.broadcast(this.stateMsg());
    this.broadcast(this.bombMsg());
    this.broadcast(this.itemsMsg());
    this.broadcast(this.rosterMsg());
  }

  endRound(winner, reason) {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    this.phase = 'over';
    this.phaseEnd = now() + OVER_TIME * 1000;
    this.score[winner]++;
    const loser = winner === 'T' ? 'CT' : 'T';
    const winMoney = reason === 'bomb' || reason === 'defuse' ? 3500 : 3250;
    const lossMoney = Math.min(3400, 1400 + 500 * this.loss[loser]);
    this.loss[winner] = 0;
    this.loss[loser] = Math.min(4, this.loss[loser] + 1);
    for (const p of this.players.values()) {
      if (p.team === winner) addMoney(p, winMoney);
      else addMoney(p, lossMoney + (loser === 'T' && this.plantedThisRound ? 800 : 0));
      sendYou(p);
    }
    if (this.bomb) { this.bomb.planting = null; this.bomb.defusing = null; }
    const sub = { elim: 'Rakip takım yok edildi.', bomb: 'Hedef havaya uçuruldu.', defuse: 'Bomba imha edildi.', time: 'Süre doldu, hedef korundu.' }[reason] || '';
    this.msg = `${TEAM_NAME[winner]} kazandı!`;
    this.broadcast({ t: 'rend', winner, reason, msg: this.msg, sub });
    this.broadcast(this.stateMsg());
    this.broadcast(this.bombMsg());
  }

  endDM() {
    this.phase = 'gameover';
    this.phaseEnd = now() + GAMEOVER_TIME * 1000;
    let msg, sub, winner = null;
    if (this.mode === 'tdm') {
      const { T, CT } = this.score;
      winner = T > CT ? 'T' : CT > T ? 'CT' : null;
      msg = winner ? `${TEAM_NAME[winner]} kazandı!` : 'Berabere!';
      sub = `Toplam leş — T ${T} : ${CT} CT`;
    } else {
      const top = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
      msg = top ? `${top.name} kazandı!` : 'Maç bitti';
      sub = top ? `${top.kills} leş ile birinci` : '';
      winner = top ? top.id : null;
    }
    this.msg = `MAÇ BİTTİ — ${msg}`;
    this.broadcast({ t: 'rend', winner, reason: 'time', msg, sub, final: true });
    this.broadcast(this.stateMsg());
    this.broadcast(this.rosterMsg());
  }

  checkElimination() {
    if (this.dm || (this.phase !== 'live' && this.phase !== 'freeze')) return;
    const ts = this.teamOf('T'), cts = this.teamOf('CT');
    if (!ts.length || !cts.length) return;
    const aliveT = ts.filter((p) => p.alive).length;
    const aliveCT = cts.filter((p) => p.alive).length;
    if (aliveCT === 0) this.endRound('T', 'elim');
    else if (aliveT === 0 && this.bomb?.state !== 'planted') this.endRound('CT', 'elim');
  }

  canBuy(p) {
    if (!p.alive) return false;
    if (this.dm || this.phase === 'warmup') return true;
    if (this.phase !== 'freeze' && this.phase !== 'live') return false;
    if (now() - this.roundStart > BUY_TIME * 1000) return false;
    return this.map.inBuyZone(p.team, p.pos[0], p.pos[2]);
  }

  buy(p, item) {
    const note = (text) => send(p, { t: 'note', text });
    if (!this.canBuy(p)) return note('Şu an satın alamazsın (alan dışında ya da süre doldu)');
    const w = WEAPONS[item], it = ITEMS[item];
    const def = w || it;
    if (!def || item === 'knife' || item === 'bomb') return;
    if (def.team && def.team !== p.team && this.mode !== 'ffa') return note('Bu eşya diğer takıma ait');
    let price = this.dm ? 0 : def.price;
    if (!this.dm && item === 'vesthelm' && p.armor >= 100 && !p.helmet) price = 350;
    if (p.money < price) return note('Yeterli paran yok');
    const rec = { item, price };
    if (w) {
      if (w.nade) {
        if (p.nades[w.nade] >= w.max) return note('Daha fazla taşıyamazsın');
        p.nades[w.nade]++;
        rec.nade = w.nade;
      } else if (w.slot === 1 || w.slot === 2) {
        const s = w.slot, key = s === 1 ? 'primary' : 'secondary';
        if (p[key] === item) return note('Bu silah zaten sende');
        // Eski silah yere düşer; alım iade edilirse ve o silah hâlâ yerdeyse geri verilir.
        // Ölüm maçında eski silah yere düşmez, iptal edilince doğrudan geri verilir.
        rec.slot = s;
        rec.prevAtt = [...p.att[s]];
        if (p[key] && this.dm) { rec.prevW = p[key]; rec.prevWid = p.wid[s]; }
        else if (p[key]) rec.prevItem = this.dropItem(p, p[key]);
        p[key] = item;
        p.att[s] = [];
        p.wid[s] = rec.wid = nextWid++;
        if (s === 1) { p.lastAtt = []; p.lastPrimary = item; }
      } else return;
    } else if (item === 'vest') {
      if (p.armor >= 100) return note('Zaten tam zırhın var');
      rec.prevArmor = p.armor; rec.prevHelmet = p.helmet;
      p.armor = 100;
    } else if (item === 'vesthelm') {
      if (p.armor >= 100 && p.helmet) return note('Zaten zırh ve kaskın var');
      rec.prevArmor = p.armor; rec.prevHelmet = p.helmet;
      p.armor = 100; p.helmet = true;
    } else if (item === 'kit') {
      if (p.kit) return note('Zaten imha kitin var');
      p.kit = true;
    }
    p.money -= price;
    this.addBuy(p, rec);
    send(p, { t: 'bought', item });
    sendYou(p);
  }

  // ---------------- İade: bu raund alınan eşya, satın alma süresi ve alanı içinde tam fiyatına geri verilir.
  // Ateş edilen silah, atılan bomba, hasar alan zırh ve elden çıkan silah iade edilemez.
  // Ölüm maçında eşyalar bedava: iade, alımı iptal edip önceki silahı geri verir.
  addBuy(p, rec) {
    p.buys.push(rec);
    if (p.buys.length > 40) p.buys.shift(); // bedava alımlarda liste sınırsız büyümesin
  }

  refundable(p, r) {
    if (r.att) return p.wid[r.slot] === r.wid && p.att[r.slot].includes(r.att) && !this.firedWids.has(r.wid);
    if (r.slot) return p.wid[r.slot] === r.wid && !this.firedWids.has(r.wid);
    if (r.nade) return p.nades[r.nade] > 0;
    if (r.item === 'vest' || r.item === 'vesthelm') {
      // Zırh alımları sırayla geri alınır (önce kask yükseltmesi, sonra yelek)
      const last = p.buys.findLast((x) => x.item === 'vest' || x.item === 'vesthelm');
      return r === last && p.armor >= 100 && (r.item === 'vest' || p.helmet);
    }
    if (r.item === 'kit') return p.kit;
    return false;
  }

  refundList(p) {
    if (!p.buys) return [];
    return p.buys.filter((r) => this.refundable(p, r)).map((r) => ({ item: r.item, price: r.price, slot: r.slot || 0 }));
  }

  refund(p, item, slot) {
    const note = (text) => send(p, { t: 'note', text });
    if (!this.canBuy(p)) return note('İade sadece satın alma süresinde ve satın alma alanında yapılabilir');
    const i = p.buys.findLastIndex((r) => r.item === item && (!r.att || r.slot === slot) && this.refundable(p, r));
    if (i < 0) return note('Bu eşya iade edilemez (kullanıldı ya da artık sende değil)');
    const r = p.buys[i];
    p.buys.splice(i, 1);
    let total = r.price;
    if (r.att) {
      p.att[r.slot] = p.att[r.slot].filter((a) => a !== r.att);
      if (r.slot === 1) p.lastAtt = [...p.att[1]];
    } else if (r.slot) {
      // Bu silaha bu raund takılan eklentiler de iade edilir
      for (let k = p.buys.length - 1; k >= 0; k--) {
        const a = p.buys[k];
        if (a.att && a.slot === r.slot && this.refundable(p, a)) { total += a.price; p.buys.splice(k, 1); }
      }
      const key = r.slot === 1 ? 'primary' : 'secondary';
      const old = r.prevItem ? this.items.find((it) => it.id === r.prevItem) : null;
      if (old) { this.items.splice(this.items.indexOf(old), 1); this.broadcast(this.itemsMsg()); }
      const back = old ? { w: old.w, wid: old.wid } : r.prevW ? { w: r.prevW, wid: r.prevWid } : null;
      p[key] = back ? back.w : null;
      p.att[r.slot] = back ? [...r.prevAtt] : [];
      p.wid[r.slot] = back ? back.wid : 0;
      if (r.slot === 1) { p.lastPrimary = p.primary; p.lastAtt = [...p.att[1]]; }
    } else if (r.nade) p.nades[r.nade]--;
    else if (r.item === 'kit') p.kit = false;
    else { p.armor = r.prevArmor; p.helmet = r.prevHelmet; }
    addMoney(p, total);
    send(p, { t: 'refunded', item, money: total });
    sendYou(p);
  }

  attOf(p, w) { const s = WEAPONS[w]?.slot; return s === 1 || s === 2 ? p.att[s] || [] : []; }
  curAtt(p) { return this.attOf(p, p.weapon); }

  buyAttachment(p, att, slot) {
    const note = (text) => send(p, { t: 'note', text });
    if (!this.canBuy(p)) return note('Şu an satın alamazsın (alan dışında ya da süre doldu)');
    const def = ATTACHMENTS[att];
    if (!def) return;
    const w = slot === 1 ? p.primary : p.secondary;
    if (!w) return note('Önce bu yuvaya bir silah al');
    if (!canAttach(w, att)) return note(`${def.name} bu silaha takılamaz`);
    if (p.att[slot].includes(att)) return note(`${def.name} zaten takılı`);
    const price = this.dm ? 0 : def.price;
    if (p.money < price) return note('Yeterli paran yok');
    p.money -= price;
    p.att[slot].push(att);
    if (slot === 1) p.lastAtt = [...p.att[1]];
    this.addBuy(p, { item: 'att_' + att, att, slot, wid: p.wid[slot], price });
    send(p, { t: 'bought', item: 'att_' + att });
    sendYou(p);
  }

  // ---------------- Oda içi mesajlar
  handle(p, m) {
    const b = this.bomb;
    switch (m.t) {
      case 'st': {
        if (!p.alive || m.s !== p.sid) return;
        const pos = vec3(m.p);
        if (!pos) return;
        const bd = this.map.bounds;
        p.pos = [Math.max(bd.x0, Math.min(bd.x1, pos[0])), Math.max(0, Math.min(20, pos[1])), Math.max(bd.z0, Math.min(bd.z1, pos[2]))];
        if (finite(m.y)) p.yaw = m.y;
        if (finite(m.x)) p.pitch = Math.max(-1.6, Math.min(1.6, m.x));
        p.crouch = finite(m.c) ? Math.max(0, Math.min(1, m.c)) : 0;
        if (typeof m.w === 'string' && this.owns(p, m.w)) p.weapon = m.w;
        break;
      }

      case 'shot': {
        if (!p.alive || this.phase === 'freeze') return;
        const w = WEAPONS[m.w];
        if (!w || w.nade || m.w === 'bomb' || !this.owns(p, m.w)) return;
        const t = now();
        const rate = (m.alt && w.rate2 ? w.rate2 : w.rate) * 1000 * 0.7;
        if (t - (p.lastShot[m.w] || 0) < rate) return;
        p.lastShot[m.w] = t;
        p.protectUntil = 0; // ateş eden oyuncunun doğuş koruması biter
        const wid = !this.dm && (w.slot === 1 || w.slot === 2) ? p.wid[w.slot] : 0;
        if (wid && !this.firedWids.has(wid)) {
          this.firedWids.add(wid);
          if (p.buys.some((r) => r.wid === wid)) sendYou(p); // iade listesi değişti
        }
        const o = vec3(m.o), e = vec3(m.e);
        if (!o || !e) return;
        let blood = false;
        if (Array.isArray(m.hits)) {
          for (const h of m.hits.slice(0, 1)) {
            const v = this.players.get(h && h.id);
            if (!v || !v.alive || !this.enemies(p, v)) continue;
            const d = dist(v.pos, p.pos);
            if ((w.melee && d > 3.5) || d > 200) continue;
            const zone = ['head', 'body', 'legs'].includes(h.z) ? h.z : 'body';
            this.damage(v, p, calcDamage(m.w, zone, d, v.armor, v.helmet, !!m.alt), m.w, zone === 'head' && !w.melee);
            blood = true;
          }
        }
        this.broadcast({ t: 'shot', id: p.id, w: m.w, o, e, b: blood, alt: !!m.alt, s: this.attOf(p, m.w).includes('sil') ? 1 : 0 }, p);
        break;
      }

      case 'nade': {
        if (!p.alive || this.phase === 'freeze') return;
        const type = m.type;
        if (!['he', 'flash', 'smoke'].includes(type) || !(p.nades[type] > 0)) return;
        const o = vec3(m.o), v = vec3(m.v);
        if (!o || !v) return;
        const sp = Math.hypot(v[0], v[1], v[2]);
        if (sp > 30) for (let i = 0; i < 3; i++) v[i] *= 30 / sp;
        p.nades[type]--;
        p.protectUntil = 0;
        // Elde kalan bomba sayısından fazla iade kaydı tutulmaz
        let extra = p.buys.filter((r) => r.nade === type).length - p.nades[type];
        for (let k = p.buys.length - 1; k >= 0 && extra > 0; k--) if (p.buys[k].nade === type) { p.buys.splice(k, 1); extra--; }
        const n = { id: nextNadeId++, owner: p.id, cid: m.cid, type, p: [...o], v: [...v], steps: 0, fuseSteps: Math.round(NADE_FUSE[type] / NADE_DT) };
        this.nades.push(n);
        this.broadcast({ t: 'nade', id: n.id, owner: p.id, type, o, v }, p);
        sendYou(p);
        break;
      }

      case 'buy':
        if (typeof m.item === 'string' && m.item.startsWith('att_')) { this.buyAttachment(p, m.item.slice(4), m.slot === 2 ? 2 : 1); break; }
        if (typeof m.item === 'string') this.buy(p, m.item);
        break;

      case 'refund':
        if (typeof m.item === 'string') this.refund(p, m.item, m.slot === 2 ? 2 : 1);
        break;

      case 'drop': {
        if (!p.alive) return;
        if (m.w === 'bomb') { this.dropBombIfCarrier(p, true); break; }
        if (m.w && (p.primary === m.w || p.secondary === m.w)) {
          if (p.primary === m.w) { p.primary = null; p.lastPrimary = null; p.att[1] = []; } else { p.secondary = null; p.att[2] = []; }
          this.dropItem(p, m.w);
          sendYou(p);
        }
        break;
      }

      case 'plant': {
        if (!p.alive || this.phase !== 'live' || !b || b.state !== 'carried' || b.carrier !== p.id) return;
        const site = this.map.siteAt(p.pos[0], p.pos[2]);
        if (!site) return;
        b.planting = { id: p.id, until: now() + PLANT_TIME * 1000, pos: [...p.pos], site };
        this.broadcast({ t: 'planting', id: p.id, p: p.pos }, p);
        break;
      }
      case 'unplant':
        if (b?.planting?.id === p.id) b.planting = null;
        break;

      case 'defuse': {
        if (!p.alive || p.team !== 'CT' || this.phase !== 'live' || !b || b.state !== 'planted' || b.defusing) return;
        if (dist2(p.pos, b.pos) > 2.2 || Math.abs(p.pos[1] - b.pos[1]) > 1.5) return;
        b.defusing = { id: p.id, until: now() + (p.kit ? KIT_DEFUSE_TIME : DEFUSE_TIME) * 1000, pos: [...p.pos] };
        this.broadcast(this.bombMsg());
        break;
      }
      case 'undefuse':
        if (b?.defusing?.id === p.id) { b.defusing = null; this.broadcast(this.bombMsg()); }
        break;

      case 'chat': {
        const text = String(m.text || '').replace(/[\n\r]/g, ' ').trim().slice(0, 120);
        if (!text) return;
        const teamOnly = !!m.tm && this.mode !== 'ffa';
        const msg = { t: 'chat', id: p.id, name: p.name, team: p.team, text, tm: teamOnly, dead: !p.alive };
        if (teamOnly) this.broadcast(msg, null, (o) => o.team === p.team);
        else this.broadcast(msg);
        break;
      }
    }
  }

  // ---------------- Tick
  explodeNade(n) {
    this.nades.splice(this.nades.indexOf(n), 1);
    const owner = this.players.get(n.owner) || null;
    if (n.type === 'he') {
      for (const v of this.players.values()) {
        if (!v.alive) continue;
        if (owner && v !== owner && !this.enemies(owner, v)) continue; // dost ateşi kapalı
        const chest = [v.pos[0], v.pos[1] + 1.0, v.pos[2]];
        const d = dist(n.p, chest);
        if (d > HE_RADIUS) continue;
        const dir = [(chest[0] - n.p[0]) / d, (chest[1] - n.p[1]) / d, (chest[2] - n.p[2]) / d];
        const hit = raycastWorld(this.map.boxes, n.p, dir, d);
        if (hit.hit && hit.t < d - 0.3) continue;
        this.damage(v, owner, blastDamage(100 * (1 - d / HE_RADIUS), v.armor), 'he', false);
      }
    }
    this.broadcast({ t: 'boom', id: n.id, owner: n.owner, cid: n.cid, type: n.type, p: n.p.map(r2) });
  }

  respawnDead(t) {
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAt && t >= p.respawnAt) {
        if (!this.dm) this.resetInventory(p);
        this.spawnPlayer(p);
        this.broadcast(this.rosterMsg());
      }
    }
  }

  updatePhase(t) {
    if (this.dm) {
      if (this.phase !== 'gameover') this.respawnDead(t);
      if (this.phase === 'warmup' && this.phaseEnd && t >= this.phaseEnd) this.startMatch();
      else if (this.phase === 'live' && t >= this.phaseEnd) this.endDM();
      else if (this.phase === 'gameover' && t >= this.phaseEnd) {
        if (this.enoughPlayers()) this.startMatch(); else this.toWarmup();
      }
      return;
    }
    switch (this.phase) {
      case 'warmup':
        this.respawnDead(t);
        if (this.phaseEnd && t >= this.phaseEnd) this.startMatch();
        break;
      case 'freeze':
        if (t >= this.phaseEnd) {
          this.phase = 'live';
          this.phaseEnd = t + ROUND_TIME * 1000;
          this.msg = '';
          this.broadcast(this.stateMsg());
        }
        break;
      case 'live': {
        const b = this.bomb;
        if (b && b.state === 'planted') { if (t >= b.explodeAt) this.explodeBomb(); }
        else if (t >= this.phaseEnd) this.endRound('CT', 'time');
        break;
      }
      case 'over':
        if (t >= this.phaseEnd) {
          const w = this.score.T >= WIN_ROUNDS ? 'T' : this.score.CT >= WIN_ROUNDS ? 'CT' : null;
          if (w) {
            this.phase = 'gameover';
            this.phaseEnd = t + GAMEOVER_TIME * 1000;
            this.msg = `MAÇ BİTTİ — ${TEAM_NAME[w]} kazandı (${this.score.T} - ${this.score.CT})`;
            this.broadcast(this.stateMsg());
          } else this.startRound();
        }
        break;
      case 'gameover':
        if (t >= this.phaseEnd) this.startMatch();
        break;
    }
  }

  updateBomb(t) {
    const b = this.bomb;
    if (!b || this.phase !== 'live') return;
    if (b.planting) {
      const pl = this.players.get(b.planting.id);
      if (!pl || !pl.alive || dist(pl.pos, b.planting.pos) > 0.6) b.planting = null;
      else if (t >= b.planting.until) this.plantBomb(pl);
    }
    if (b.defusing) {
      const df = this.players.get(b.defusing.id);
      if (!df || !df.alive || dist(df.pos, b.defusing.pos) > 0.6) { b.defusing = null; this.broadcast(this.bombMsg()); }
      else if (t >= b.defusing.until) {
        b.state = 'defused';
        b.defusing = null;
        addMoney(df, 300);
        this.broadcast(this.bombMsg());
        this.endRound('CT', 'defuse');
      }
    }
    if (b.state === 'dropped') {
      for (const p of this.players.values()) {
        if (!p.alive || p.team !== 'T') continue;
        if (p.id === b.dropBy && t - b.dropT < 1500) continue;
        if (dist2(p.pos, b.pos) < 1.2 && Math.abs(p.pos[1] - b.pos[1]) < 1.5) {
          b.state = 'carried'; b.carrier = p.id; b.pos = null;
          this.broadcast(this.bombMsg());
          break;
        }
      }
    }
  }

  updateItems(t) {
    let changed = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const w = WEAPONS[it.w];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (it.owner === p.id && t - it.t < 1500) continue;
        if (dist2(p.pos, it.p) > 1.1 || Math.abs(p.pos[1] - it.p[1]) > 1.5) continue;
        if (w.slot === 1 && !p.primary) { p.primary = it.w; p.att[1] = []; p.wid[1] = it.wid || 0; }
        else if (w.slot === 2 && !p.secondary) { p.secondary = it.w; p.att[2] = []; p.wid[2] = it.wid || 0; }
        else continue;
        this.items.splice(i, 1);
        sendYou(p);
        changed = true;
        break;
      }
    }
    if (changed) this.broadcast(this.itemsMsg());
  }

  broadcastSnap() {
    if (!this.players.size) return;
    const ps = [];
    for (const p of this.players.values()) {
      ps.push([p.id, r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), Math.round(p.yaw * 1000) / 1000, Math.round(p.pitch * 1000) / 1000, r2(p.crouch), p.weapon, p.alive ? 1 : 0, attCode(this.curAtt(p))]);
    }
    this.broadcast({ t: 'snap', ps });
  }

  tick(t, dt) {
    this.updatePhase(t);
    this.updateBomb(t);
    this.updateItems(t);
    this.nadeAcc += dt;
    while (this.nadeAcc >= NADE_DT) {
      this.nadeAcc -= NADE_DT;
      for (const n of this.nades) stepNade(this.map.boxes, n);
    }
    for (const n of [...this.nades]) if (n.steps >= n.fuseSteps) this.explodeNade(n);
    this.broadcastSnap();
  }
}

// ---------------------------------------------------------------- Odalar ve lobi
// Her harita için o haritanın desteklediği her mod ayrı bir oda (ör. "ffa:depo")
const rooms = {};
for (const mapId of MAP_IDS) for (const mode of MAPS[mapId].modes) rooms[`${mode}:${mapId}`] = new Room(mode, mapId);

function roomsMsg() {
  const r = {};
  for (const [k, room] of Object.entries(rooms)) {
    r[k] = { mode: room.mode, map: room.map.id, T: room.teamOf('T').length, CT: room.teamOf('CT').length, total: room.players.size, max: room.cfg.max, phase: room.phase };
  }
  return { t: 'rooms', rooms: r };
}
function broadcastRooms() {
  const s = JSON.stringify(roomsMsg());
  for (const p of clients.values()) if (p.ws.readyState === 1) p.ws.send(s);
}

function handle(p, m) {
  if (!m || typeof m.t !== 'string') return;
  switch (m.t) {
    case 'join': {
      p.name = cleanName(m.name);
      const mode = MODES[m.mode] ? m.mode : 'classic';
      const room = rooms[`${mode}:${m.map}`] || rooms[`${mode}:kum`];
      if (p.room === room) { if (room.cfg.teams) room.setTeam(p, m.team); break; }
      if (room.players.size >= room.cfg.max) { send(p, { t: 'joinfail', text: `${room.cfg.name} dolu (${room.cfg.max} kişi). Başka bir mod seç.` }); break; }
      if (p.room) p.room.remove(p);
      room.add(p, m.team);
      break;
    }
    case 'team':
      if (p.room) p.room.setTeam(p, m.team);
      break;
    case 'ping':
      p.ping = Math.max(0, Math.min(999, m.rtt | 0));
      send(p, { t: 'pong', ts: m.ts });
      break;
    default:
      if (p.room) p.room.handle(p, m);
  }
}

let lastTick = now(), lastSlow = 0;
const stats = { avg: 0, max: 0, late: 0, maxReset: now() };
setInterval(() => {
  const t = now();
  const dt = Math.min(0.2, (t - lastTick) / 1000);
  if (t - lastTick > 80) stats.late++;
  lastTick = t;
  const t0 = performance.now();
  for (const room of Object.values(rooms)) room.tick(t, dt);
  const took = performance.now() - t0;
  stats.avg = stats.avg * 0.95 + took * 0.05;
  if (t - stats.maxReset > 10000) { stats.max = 0; stats.maxReset = t; }
  stats.max = Math.max(stats.max, took);
  if (t - lastSlow > 2000) {
    lastSlow = t;
    for (const room of Object.values(rooms)) {
      if (!room.players.size) continue;
      room.broadcast(room.rosterMsg());
      room.broadcast(room.stateMsg());
    }
    broadcastRooms();
  }
}, 50);

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const p = {
    id: nextPlayerId++, ws, name: 'Oyuncu', team: 'SPEC', room: null, alive: false,
    hp: 100, armor: 0, helmet: false, kit: false, money: START_MONEY,
    primary: null, secondary: null, lastPrimary: null, att: { 1: [], 2: [] }, lastAtt: [], nades: { he: 0, flash: 0, smoke: 0 },
    wid: { 1: 0, 2: 0 }, buys: [],
    pos: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, weapon: 'knife',
    kills: 0, deaths: 0, sid: 0, respawnAt: 0, protectUntil: 0, lastShot: {}, ping: 0,
  };
  clients.set(p.id, p);
  send(p, { t: 'welcome', id: p.id });
  send(p, roomsMsg());
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    try { handle(p, m); } catch (err) { console.error('Mesaj hatası:', err); }
  });
  ws.on('close', () => {
    clients.delete(p.id);
    if (p.room) p.room.remove(p); else broadcastRooms();
  });
  ws.on('error', () => {});
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n  DUST STRIKE sunucusu çalışıyor! Modlar: Klasik, Takımlı Ölüm Maçı, Herkes Tek\n');
  console.log(`  Bu bilgisayardan:          http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Aynı ağdaki arkadaşların:  http://${a.address}:${PORT}`);
    }
  }
  console.log('\n  Kapatmak için bu pencerede Ctrl+C\n');
});
