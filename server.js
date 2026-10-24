// DUST STRIKE oyun sunucusu: statik dosyaları sunar ve WebSocket üzerinden oyunu yönetir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { buildMap, siteAt, inBuyZone } from './public/shared/map.js';
import { WEAPONS, ITEMS, DEFAULT_PISTOL, calcDamage, blastDamage } from './public/shared/weapons.js';
import { raycastWorld, stepNade, groundAt, NADE_DT, NADE_FUSE } from './public/shared/physics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');

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

const TEAM_NAME = { T: 'Teröristler', CT: 'Anti-Terör Timi' };

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  let root = PUBLIC_DIR;
  if (urlPath.startsWith('/three/')) { root = THREE_DIR; urlPath = urlPath.slice('/three'.length); }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(root, '.' + urlPath);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- Oyun durumu
const MAP = buildMap();
const players = new Map();
let nextPlayerId = 1, nextItemId = 1, nextNadeId = 1;

const game = {
  phase: 'warmup', phaseEnd: 0, roundStart: 0, round: 0,
  score: { T: 0, CT: 0 }, loss: { T: 0, CT: 0 },
  bomb: null, plantedThisRound: false, items: [], nades: [],
  msg: 'Isınma: rakip takımdan oyuncu bekleniyor',
};

const now = () => Date.now();
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const vec3 = (a) => (Array.isArray(a) && a.length === 3 && a.every(finite) ? a : null);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const inGame = (p) => p.joined && (p.team === 'T' || p.team === 'CT');
const teamOf = (team) => [...players.values()].filter((p) => inGame(p) && p.team === team);
const r2 = (n) => Math.round(n * 100) / 100;

function send(p, m) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); }
function broadcast(m, except = null, filter = null) {
  const s = JSON.stringify(m);
  for (const p of players.values()) {
    if (p !== except && p.ws.readyState === 1 && (!filter || filter(p))) p.ws.send(s);
  }
}
function addMoney(p, n) { p.money = Math.max(0, Math.min(MAX_MONEY, p.money + n)); }
function cleanName(s) {
  s = String(s || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, 16);
  return s || 'Oyuncu' + Math.floor(Math.random() * 900 + 100);
}
function system(text) { broadcast({ t: 'chat', system: true, text }); }

function stateMsg() {
  const t = now();
  return {
    t: 'state', phase: game.phase, round: game.round, score: game.score, msg: game.msg, win: WIN_ROUNDS,
    left: game.phaseEnd ? Math.max(0, game.phaseEnd - t) : 0,
    buyLeft: game.phase === 'warmup' ? 1e9 : Math.max(0, game.roundStart + BUY_TIME * 1000 - t),
  };
}
function rosterMsg() {
  return {
    t: 'roster',
    ps: [...players.values()].filter((p) => p.joined).map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, alive: p.alive, ping: p.ping })),
  };
}
function bombMsg() {
  const b = game.bomb;
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
function itemsMsg() { return { t: 'items', items: game.items.map((i) => ({ id: i.id, w: i.w, p: i.p })) }; }
function youMsg(p) {
  return {
    t: 'you', team: p.team, alive: p.alive, hp: p.hp, armor: p.armor, helmet: p.helmet, kit: p.kit,
    money: p.money, primary: p.primary, secondary: p.secondary, nades: p.nades,
  };
}
const sendYou = (p) => send(p, youMsg(p));

// ---------------------------------------------------------------- Oyuncu yönetimi
function resetInventory(p) {
  p.primary = null;
  p.secondary = DEFAULT_PISTOL[p.team] || null;
  p.nades = { he: 0, flash: 0, smoke: 0 };
  p.armor = 0; p.helmet = false; p.kit = false;
}

function owns(p, w) {
  if (w === 'knife') return true;
  if (w === 'bomb') return !!game.bomb && game.bomb.carrier === p.id;
  if (WEAPONS[w]?.nade) return p.nades[w] > 0;
  return p.primary === w || p.secondary === w;
}

function spawnPlayer(p) {
  const list = MAP.spawns[p.team];
  const others = [...players.values()].filter((o) => o !== p && o.alive);
  let best = list[0], bestD = -1;
  const order = [...list].sort(() => Math.random() - 0.5);
  for (const s of order) {
    let d = Infinity;
    for (const o of others) d = Math.min(d, dist2(o.pos, s));
    if (d > bestD) { bestD = d; best = s; }
    if (d > 3) break;
  }
  p.pos = [best[0], 0, best[2]];
  p.yaw = p.team === 'T' ? 0 : Math.PI;
  p.pitch = 0;
  p.alive = true;
  p.hp = 100;
  p.sid++;
  p.respawnAt = 0;
  if (game.phase === 'warmup') p.money = MAX_MONEY;
  sendYou(p);
  send(p, { t: 'spawn', p: p.pos, yaw: p.yaw, sid: p.sid });
}

function autoTeam() {
  const t = teamOf('T').length, ct = teamOf('CT').length;
  if (t === ct) return Math.random() < 0.5 ? 'T' : 'CT';
  return t < ct ? 'T' : 'CT';
}

function setTeam(p, team) {
  if (team !== 'T' && team !== 'CT') team = autoTeam();
  if (p.joined && p.team === team) return;
  if (p.alive) {
    dropBombIfCarrier(p);
    p.alive = false;
  }
  const first = !p.joined;
  p.team = team;
  p.joined = true;
  resetInventory(p);
  system(first ? `${p.name} oyuna katıldı (${TEAM_NAME[team]})` : `${p.name} takım değiştirdi: ${TEAM_NAME[team]}`);
  if (game.phase === 'warmup' || game.phase === 'freeze') spawnPlayer(p);
  else sendYou(p);
  broadcast(rosterMsg());
  send(p, stateMsg());
  send(p, bombMsg());
  send(p, itemsMsg());
  checkTeams();
  checkElimination();
}

function leave(p) {
  players.delete(p.id);
  if (!p.joined) return;
  dropBombIfCarrier(p);
  if (game.bomb?.planting?.id === p.id) game.bomb.planting = null;
  if (game.bomb?.defusing?.id === p.id) game.bomb.defusing = null;
  broadcast({ t: 'leave', id: p.id });
  system(`${p.name} oyundan ayrıldı`);
  broadcast(rosterMsg());
  checkTeams();
  checkElimination();
}

// ---------------------------------------------------------------- Eşyalar ve bomba
function dropPos(p, forward = 1.2) {
  const d = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
  const o = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
  const hit = raycastWorld(MAP.boxes, o, d, forward + 0.4);
  const f = Math.max(0, Math.min(forward, hit.t - 0.4));
  const x = o[0] + d[0] * f, z = o[2] + d[2] * f;
  return [r2(x), r2(groundAt(MAP.boxes, x, z, p.pos[1]) + 0.02), r2(z)];
}

function dropItem(p, w, atFeet = false) {
  const pos = atFeet ? [p.pos[0], r2(groundAt(MAP.boxes, p.pos[0], p.pos[2], p.pos[1]) + 0.02), p.pos[2]] : dropPos(p);
  game.items.push({ id: nextItemId++, w, p: pos, owner: p.id, t: now() });
  if (game.items.length > 40) game.items.shift();
  broadcast(itemsMsg());
}

function dropBombIfCarrier(p, thrown = false) {
  const b = game.bomb;
  if (!b || b.carrier !== p.id) return;
  b.state = 'dropped';
  b.carrier = null;
  b.pos = thrown ? dropPos(p) : [p.pos[0], r2(groundAt(MAP.boxes, p.pos[0], p.pos[2], p.pos[1]) + 0.02), p.pos[2]];
  b.planting = null;
  b.dropBy = p.id;
  b.dropT = now();
  broadcast(bombMsg());
}

function plantBomb(p) {
  const b = game.bomb;
  b.state = 'planted';
  b.carrier = null;
  b.pos = [p.pos[0], p.pos[1], p.pos[2]];
  b.site = b.planting.site;
  b.explodeAt = now() + BOMB_TIME * 1000;
  b.planting = null;
  game.plantedThisRound = true;
  addMoney(p, 300);
  sendYou(p);
  broadcast(bombMsg());
}

function explodeBomb() {
  const b = game.bomb;
  b.state = 'exploded';
  broadcast({ t: 'boom', type: 'c4', p: b.pos });
  for (const v of players.values()) {
    if (!v.alive) continue;
    const d = dist(v.pos, b.pos);
    if (d > 30) continue;
    const raw = d < 8 ? 500 : 200 * (1 - (d - 8) / 22);
    damage(v, null, blastDamage(raw, v.armor), 'bomb', false);
  }
  broadcast(bombMsg());
  endRound('T', 'bomb');
}

// ---------------------------------------------------------------- Hasar
function damage(v, a, dmg, weapon, hs) {
  if (!v.alive) return;
  v.hp -= dmg.hp;
  v.armor = Math.max(0, v.armor - dmg.armor);
  if (v.armor === 0) v.helmet = false;
  send(v, { t: 'hurt', a: a ? a.id : 0, d: dmg.hp, hp: Math.max(0, v.hp), armor: v.armor, from: a ? a.pos : null });
  if (v.hp <= 0) { v.hp = 0; kill(v, a, weapon, hs); }
}

function kill(v, k, weapon, hs) {
  if (!v.alive) return;
  v.alive = false;
  v.deaths++;
  if (k && k !== v) {
    k.kills++;
    addMoney(k, WEAPONS[weapon]?.reward ?? 300);
    sendYou(k);
  }
  const drop = v.primary || v.secondary;
  if (drop) {
    if (v.primary === drop) v.primary = null; else v.secondary = null;
    dropItem(v, drop, true);
  }
  dropBombIfCarrier(v);
  if (game.bomb?.planting?.id === v.id) game.bomb.planting = null;
  if (game.bomb?.defusing?.id === v.id) { game.bomb.defusing = null; broadcast(bombMsg()); }
  broadcast({ t: 'kill', k: k ? k.id : 0, v: v.id, w: weapon, hs: !!hs });
  if (game.phase === 'warmup') v.respawnAt = now() + RESPAWN_DELAY * 1000;
  sendYou(v);
  broadcast(rosterMsg());
  checkElimination();
}

// ---------------------------------------------------------------- Raund akışı
function checkTeams() {
  const t = teamOf('T').length, ct = teamOf('CT').length;
  if (game.phase === 'warmup') {
    if (t > 0 && ct > 0) {
      if (!game.phaseEnd) {
        game.phaseEnd = now() + WARMUP_COUNTDOWN * 1000;
        game.msg = 'Her iki takımda oyuncu var — maç başlıyor!';
        broadcast(stateMsg());
      }
    } else if (game.phaseEnd) {
      game.phaseEnd = 0;
      game.msg = 'Isınma: rakip takımdan oyuncu bekleniyor';
      broadcast(stateMsg());
    }
  } else if (t === 0 || ct === 0) {
    toWarmup();
  }
}

function toWarmup() {
  game.phase = 'warmup';
  game.phaseEnd = 0;
  game.round = 0;
  game.score = { T: 0, CT: 0 };
  game.bomb = null;
  game.items = [];
  game.nades = [];
  game.msg = 'Isınma: rakip takımdan oyuncu bekleniyor';
  for (const p of players.values()) {
    if (!inGame(p)) continue;
    p.money = MAX_MONEY;
    if (!p.alive) spawnPlayer(p); else sendYou(p);
  }
  broadcast(stateMsg());
  broadcast(bombMsg());
  broadcast(itemsMsg());
  broadcast(rosterMsg());
}

function startMatch() {
  game.score = { T: 0, CT: 0 };
  game.loss = { T: 0, CT: 0 };
  game.round = 0;
  for (const p of players.values()) {
    if (!inGame(p)) continue;
    p.kills = 0; p.deaths = 0; p.money = START_MONEY; p.alive = false;
  }
  system('Maç başladı! İlk ' + WIN_ROUNDS + ' raundu alan kazanır.');
  startRound();
}

function startRound() {
  const t = now();
  game.round++;
  game.phase = 'freeze';
  game.phaseEnd = t + FREEZE_TIME * 1000;
  game.roundStart = t;
  game.items = [];
  game.nades = [];
  game.plantedThisRound = false;
  game.msg = `Raund ${game.round}`;
  const ts = teamOf('T'), cts = teamOf('CT');
  const all = [...ts, ...cts];
  for (const p of all) { if (!p.alive) resetInventory(p); p.alive = false; }
  for (const p of all) spawnPlayer(p);
  if (ts.length) {
    const c = ts[Math.floor(Math.random() * ts.length)];
    game.bomb = { state: 'carried', carrier: c.id, pos: null, site: null, planting: null, defusing: null };
  } else game.bomb = null;
  broadcast(stateMsg());
  broadcast(bombMsg());
  broadcast(itemsMsg());
  broadcast(rosterMsg());
}

function endRound(winner, reason) {
  if (game.phase === 'over' || game.phase === 'gameover' || game.phase === 'warmup') return;
  game.phase = 'over';
  game.phaseEnd = now() + OVER_TIME * 1000;
  game.score[winner]++;
  const loser = winner === 'T' ? 'CT' : 'T';
  const winMoney = reason === 'bomb' || reason === 'defuse' ? 3500 : 3250;
  const lossMoney = Math.min(3400, 1400 + 500 * game.loss[loser]);
  game.loss[winner] = 0;
  game.loss[loser] = Math.min(4, game.loss[loser] + 1);
  for (const p of players.values()) {
    if (!inGame(p)) continue;
    if (p.team === winner) addMoney(p, winMoney);
    else addMoney(p, lossMoney + (loser === 'T' && game.plantedThisRound ? 800 : 0));
    sendYou(p);
  }
  if (game.bomb) { game.bomb.planting = null; game.bomb.defusing = null; }
  const sub = { elim: 'Rakip takım yok edildi.', bomb: 'Hedef havaya uçuruldu.', defuse: 'Bomba imha edildi.', time: 'Süre doldu, hedef korundu.' }[reason] || '';
  game.msg = `${TEAM_NAME[winner]} kazandı!`;
  broadcast({ t: 'rend', winner, reason, msg: game.msg, sub });
  broadcast(stateMsg());
  broadcast(bombMsg());
}

function checkElimination() {
  if (game.phase !== 'live' && game.phase !== 'freeze') return;
  const ts = teamOf('T'), cts = teamOf('CT');
  if (!ts.length || !cts.length) return;
  const aliveT = ts.filter((p) => p.alive).length;
  const aliveCT = cts.filter((p) => p.alive).length;
  if (aliveCT === 0) endRound('T', 'elim');
  else if (aliveT === 0 && game.bomb?.state !== 'planted') endRound('CT', 'elim');
}

function canBuy(p) {
  if (!p.alive) return false;
  if (game.phase === 'warmup') return true;
  if (game.phase !== 'freeze' && game.phase !== 'live') return false;
  if (now() - game.roundStart > BUY_TIME * 1000) return false;
  return inBuyZone(p.team, p.pos[0], p.pos[2]);
}

function buy(p, item) {
  const note = (text) => send(p, { t: 'note', text });
  if (!canBuy(p)) return note('Şu an satın alamazsın (alan dışında ya da süre doldu)');
  const w = WEAPONS[item], it = ITEMS[item];
  const def = w || it;
  if (!def || item === 'knife' || item === 'bomb') return;
  if (def.team && def.team !== p.team) return note('Bu eşya diğer takıma ait');
  let price = def.price;
  if (item === 'vesthelm' && p.armor >= 100 && !p.helmet) price = 350;
  if (p.money < price) return note('Yeterli paran yok');
  if (w) {
    if (w.nade) {
      if (p.nades[w.nade] >= w.max) return note('Daha fazla taşıyamazsın');
      p.nades[w.nade]++;
    } else if (w.slot === 1) {
      if (p.primary === item) return note('Bu silah zaten sende');
      if (p.primary) dropItem(p, p.primary);
      p.primary = item;
    } else if (w.slot === 2) {
      if (p.secondary === item) return note('Bu silah zaten sende');
      if (p.secondary) dropItem(p, p.secondary);
      p.secondary = item;
    } else return;
  } else if (item === 'vest') {
    if (p.armor >= 100) return note('Zaten tam zırhın var');
    p.armor = 100;
  } else if (item === 'vesthelm') {
    if (p.armor >= 100 && p.helmet) return note('Zaten zırh ve kaskın var');
    p.armor = 100; p.helmet = true;
  } else if (item === 'kit') {
    if (p.kit) return note('Zaten imha kitin var');
    p.kit = true;
  }
  p.money -= price;
  send(p, { t: 'bought', item });
  sendYou(p);
}

// ---------------------------------------------------------------- Mesajlar
function handle(p, m) {
  if (!m || typeof m.t !== 'string') return;
  const b = game.bomb;
  switch (m.t) {
    case 'join':
      p.name = cleanName(m.name);
      setTeam(p, m.team);
      break;

    case 'team':
      if (p.joined) setTeam(p, m.team);
      break;

    case 'st': {
      if (!p.alive || m.s !== p.sid) return;
      const pos = vec3(m.p);
      if (!pos) return;
      const bd = MAP.bounds;
      p.pos = [Math.max(bd.x0, Math.min(bd.x1, pos[0])), Math.max(0, Math.min(20, pos[1])), Math.max(bd.z0, Math.min(bd.z1, pos[2]))];
      if (finite(m.y)) p.yaw = m.y;
      if (finite(m.x)) p.pitch = Math.max(-1.6, Math.min(1.6, m.x));
      p.crouch = finite(m.c) ? Math.max(0, Math.min(1, m.c)) : 0;
      if (typeof m.w === 'string' && owns(p, m.w)) p.weapon = m.w;
      break;
    }

    case 'shot': {
      if (!p.alive || game.phase === 'freeze') return;
      const w = WEAPONS[m.w];
      if (!w || w.nade || m.w === 'bomb' || !owns(p, m.w)) return;
      const t = now();
      const rate = (m.alt && w.rate2 ? w.rate2 : w.rate) * 1000 * 0.7;
      if (t - (p.lastShot[m.w] || 0) < rate) return;
      p.lastShot[m.w] = t;
      const o = vec3(m.o), e = vec3(m.e);
      if (!o || !e) return;
      let blood = false;
      if (Array.isArray(m.hits)) {
        for (const h of m.hits.slice(0, 1)) {
          const v = players.get(h && h.id);
          if (!v || !v.alive || v === p || v.team === p.team) continue;
          const d = dist(v.pos, p.pos);
          if ((w.melee && d > 3.5) || d > 200) continue;
          const zone = ['head', 'body', 'legs'].includes(h.z) ? h.z : 'body';
          damage(v, p, calcDamage(m.w, zone, d, v.armor, v.helmet, !!m.alt), m.w, zone === 'head' && !w.melee);
          blood = true;
        }
      }
      broadcast({ t: 'shot', id: p.id, w: m.w, o, e, b: blood, alt: !!m.alt }, p);
      break;
    }

    case 'nade': {
      if (!p.alive || game.phase === 'freeze') return;
      const type = m.type;
      if (!['he', 'flash', 'smoke'].includes(type) || !(p.nades[type] > 0)) return;
      const o = vec3(m.o), v = vec3(m.v);
      if (!o || !v) return;
      const sp = Math.hypot(v[0], v[1], v[2]);
      if (sp > 30) for (let i = 0; i < 3; i++) v[i] *= 30 / sp;
      p.nades[type]--;
      const n = { id: nextNadeId++, owner: p.id, cid: m.cid, type, p: [...o], v: [...v], steps: 0, fuseSteps: Math.round(NADE_FUSE[type] / NADE_DT) };
      game.nades.push(n);
      broadcast({ t: 'nade', id: n.id, owner: p.id, type, o, v }, p);
      sendYou(p);
      break;
    }

    case 'buy':
      if (typeof m.item === 'string') buy(p, m.item);
      break;

    case 'drop': {
      if (!p.alive) return;
      if (m.w === 'bomb') { dropBombIfCarrier(p, true); break; }
      if (m.w && (p.primary === m.w || p.secondary === m.w)) {
        if (p.primary === m.w) p.primary = null; else p.secondary = null;
        dropItem(p, m.w);
        sendYou(p);
      }
      break;
    }

    case 'plant': {
      if (!p.alive || game.phase !== 'live' || !b || b.state !== 'carried' || b.carrier !== p.id) return;
      const site = siteAt(p.pos[0], p.pos[2]);
      if (!site) return;
      b.planting = { id: p.id, until: now() + PLANT_TIME * 1000, pos: [...p.pos], site };
      broadcast({ t: 'planting', id: p.id, p: p.pos }, p);
      break;
    }
    case 'unplant':
      if (b?.planting?.id === p.id) b.planting = null;
      break;

    case 'defuse': {
      if (!p.alive || p.team !== 'CT' || game.phase !== 'live' || !b || b.state !== 'planted' || b.defusing) return;
      if (dist2(p.pos, b.pos) > 2.2 || Math.abs(p.pos[1] - b.pos[1]) > 1.5) return;
      b.defusing = { id: p.id, until: now() + (p.kit ? KIT_DEFUSE_TIME : DEFUSE_TIME) * 1000, pos: [...p.pos] };
      broadcast(bombMsg());
      break;
    }
    case 'undefuse':
      if (b?.defusing?.id === p.id) { b.defusing = null; broadcast(bombMsg()); }
      break;

    case 'chat': {
      const text = String(m.text || '').replace(/[\n\r]/g, ' ').trim().slice(0, 120);
      if (!text || !p.joined) return;
      const msg = { t: 'chat', id: p.id, name: p.name, team: p.team, text, tm: !!m.tm, dead: !p.alive };
      if (m.tm) broadcast(msg, null, (o) => o.team === p.team);
      else broadcast(msg);
      break;
    }

    case 'ping':
      p.ping = Math.max(0, Math.min(999, m.rtt | 0));
      send(p, { t: 'pong', ts: m.ts });
      break;
  }
}

// ---------------------------------------------------------------- Tick
function explodeNade(n) {
  game.nades.splice(game.nades.indexOf(n), 1);
  const owner = players.get(n.owner) || null;
  if (n.type === 'he') {
    for (const v of players.values()) {
      if (!v.alive) continue;
      if (owner && v !== owner && v.team === owner.team) continue; // dost ateşi kapalı
      const chest = [v.pos[0], v.pos[1] + 1.0, v.pos[2]];
      const d = dist(n.p, chest);
      if (d > HE_RADIUS) continue;
      const dir = [(chest[0] - n.p[0]) / d, (chest[1] - n.p[1]) / d, (chest[2] - n.p[2]) / d];
      const hit = raycastWorld(MAP.boxes, n.p, dir, d);
      if (hit.hit && hit.t < d - 0.3) continue;
      damage(v, owner, blastDamage(100 * (1 - d / HE_RADIUS), v.armor), 'he', false);
    }
  }
  broadcast({ t: 'boom', id: n.id, owner: n.owner, cid: n.cid, type: n.type, p: n.p.map(r2) });
}

function updatePhase(t) {
  switch (game.phase) {
    case 'warmup':
      for (const p of players.values()) {
        if (inGame(p) && !p.alive && p.respawnAt && t >= p.respawnAt) {
          resetInventory(p);
          spawnPlayer(p);
          broadcast(rosterMsg());
        }
      }
      if (game.phaseEnd && t >= game.phaseEnd) startMatch();
      break;
    case 'freeze':
      if (t >= game.phaseEnd) {
        game.phase = 'live';
        game.phaseEnd = t + ROUND_TIME * 1000;
        game.msg = '';
        broadcast(stateMsg());
      }
      break;
    case 'live': {
      const b = game.bomb;
      if (b && b.state === 'planted') { if (t >= b.explodeAt) explodeBomb(); }
      else if (t >= game.phaseEnd) endRound('CT', 'time');
      break;
    }
    case 'over':
      if (t >= game.phaseEnd) {
        const w = game.score.T >= WIN_ROUNDS ? 'T' : game.score.CT >= WIN_ROUNDS ? 'CT' : null;
        if (w) {
          game.phase = 'gameover';
          game.phaseEnd = t + GAMEOVER_TIME * 1000;
          game.msg = `MAÇ BİTTİ — ${TEAM_NAME[w]} kazandı (${game.score.T} - ${game.score.CT})`;
          broadcast(stateMsg());
        } else startRound();
      }
      break;
    case 'gameover':
      if (t >= game.phaseEnd) startMatch();
      break;
  }
}

function updateBomb(t) {
  const b = game.bomb;
  if (!b || game.phase !== 'live') return;
  if (b.planting) {
    const pl = players.get(b.planting.id);
    if (!pl || !pl.alive || dist(pl.pos, b.planting.pos) > 0.6) b.planting = null;
    else if (t >= b.planting.until) plantBomb(pl);
  }
  if (b.defusing) {
    const df = players.get(b.defusing.id);
    if (!df || !df.alive || dist(df.pos, b.defusing.pos) > 0.6) { b.defusing = null; broadcast(bombMsg()); }
    else if (t >= b.defusing.until) {
      b.state = 'defused';
      b.defusing = null;
      addMoney(df, 300);
      broadcast(bombMsg());
      endRound('CT', 'defuse');
    }
  }
  if (b.state === 'dropped') {
    for (const p of players.values()) {
      if (!p.alive || p.team !== 'T') continue;
      if (p.id === b.dropBy && t - b.dropT < 1500) continue;
      if (dist2(p.pos, b.pos) < 1.2 && Math.abs(p.pos[1] - b.pos[1]) < 1.5) {
        b.state = 'carried'; b.carrier = p.id; b.pos = null;
        broadcast(bombMsg());
        break;
      }
    }
  }
}

function updateItems(t) {
  let changed = false;
  for (let i = game.items.length - 1; i >= 0; i--) {
    const it = game.items[i];
    const w = WEAPONS[it.w];
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (it.owner === p.id && t - it.t < 1500) continue;
      if (dist2(p.pos, it.p) > 1.1 || Math.abs(p.pos[1] - it.p[1]) > 1.5) continue;
      if (w.slot === 1 && !p.primary) p.primary = it.w;
      else if (w.slot === 2 && !p.secondary) p.secondary = it.w;
      else continue;
      game.items.splice(i, 1);
      sendYou(p);
      changed = true;
      break;
    }
  }
  if (changed) broadcast(itemsMsg());
}

function broadcastSnap() {
  const ps = [];
  for (const p of players.values()) {
    if (!inGame(p)) continue;
    ps.push([p.id, r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), Math.round(p.yaw * 1000) / 1000, Math.round(p.pitch * 1000) / 1000, r2(p.crouch), p.weapon, p.alive ? 1 : 0]);
  }
  if (ps.length) broadcast({ t: 'snap', ps });
}

let lastTick = now(), lastSlow = 0, nadeAcc = 0;
setInterval(() => {
  const t = now();
  const dt = Math.min(0.2, (t - lastTick) / 1000);
  lastTick = t;
  updatePhase(t);
  updateBomb(t);
  updateItems(t);
  nadeAcc += dt;
  while (nadeAcc >= NADE_DT) {
    nadeAcc -= NADE_DT;
    for (const n of game.nades) stepNade(MAP.boxes, n);
  }
  for (const n of [...game.nades]) if (n.steps >= n.fuseSteps) explodeNade(n);
  broadcastSnap();
  if (t - lastSlow > 2000) {
    lastSlow = t;
    broadcast(rosterMsg());
    broadcast(stateMsg());
  }
}, 50);

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const p = {
    id: nextPlayerId++, ws, name: 'Oyuncu', team: 'SPEC', joined: false, alive: false,
    hp: 100, armor: 0, helmet: false, kit: false, money: START_MONEY,
    primary: null, secondary: null, nades: { he: 0, flash: 0, smoke: 0 },
    pos: [0, 0, 0], yaw: 0, pitch: 0, crouch: 0, weapon: 'knife',
    kills: 0, deaths: 0, sid: 0, respawnAt: 0, lastShot: {}, ping: 0,
  };
  players.set(p.id, p);
  send(p, { t: 'welcome', id: p.id });
  send(p, stateMsg());
  send(p, rosterMsg());
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    try { handle(p, m); } catch (err) { console.error('Mesaj hatası:', err); }
  });
  ws.on('close', () => leave(p));
  ws.on('error', () => {});
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n  DUST STRIKE sunucusu çalışıyor!\n');
  console.log(`  Bu bilgisayardan:          http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Aynı ağdaki arkadaşların:  http://${a.address}:${PORT}`);
    }
  }
  console.log('\n  Kapatmak için bu pencerede Ctrl+C\n');
});
