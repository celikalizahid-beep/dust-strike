// Yük testi: gerçek oyuncu gibi bağlanan botlar (haritada dolaşır, silah alır, birbirine ateş eder).
// Kullanım: node tools/bots.mjs [sunucu adresi] [bot sayısı] [süre sn] [mod] [harita]
//   örnek:  node tools/bots.mjs http://localhost:3000 31 60 ffa depo
import WebSocket from 'ws';
import { buildMap } from '../public/shared/map.js';
import { movePlayer, raycastWorld, STAND_H } from '../public/shared/physics.js';

const [url = 'http://localhost:3000', countArg = '31', durArg = '60', mode = 'ffa', mapId = 'kum'] = process.argv.slice(2);
const COUNT = Number(countArg), DURATION = Number(durArg) * 1000;
const WS_URL = url.replace(/^http/, 'ws');
const MAP = buildMap(mapId);
const stats = { snaps: 0, gapSum: 0, gapMax: 0, lastSnap: 0, bytes: 0, msgs: 0, kills: 0, shots: 0, connected: 0, errors: 0 };

class Bot {
  constructor(i) {
    this.i = i;
    this.name = `Bot-${String(i + 1).padStart(2, '0')}`;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.alive = false; this.sid = 0; this.id = 0;
    this.others = new Map();
    this.target = null; this.stuck = 0; this.nextShot = 0;
    this.weapon = 'glock';
    this.ws = new WebSocket(WS_URL);
    this.ws.on('open', () => {
      stats.connected++;
      this.ws.send(JSON.stringify({ t: 'join', name: this.name, mode, map: mapId, team: 'auto' }));
    });
    this.ws.on('message', (data) => this.onMsg(data));
    this.ws.on('error', () => stats.errors++);
  }
  onMsg(data) {
    const m = JSON.parse(data);
    if (this.i === 0) { stats.bytes += data.length; stats.msgs++; }
    switch (m.t) {
      case 'welcome': this.id = m.id; break;
      case 'spawn':
        this.pos = { x: m.p[0], y: m.p[1], z: m.p[2] };
        this.sid = m.sid; this.alive = true; this.target = null;
        this.ws.send(JSON.stringify({ t: 'buy', item: Math.random() < 0.5 ? 'ak47' : 'm4a1' }));
        break;
      case 'you':
        this.alive = m.alive;
        this.weapon = m.primary || m.secondary || 'knife';
        break;
      case 'kill': if (this.i === 0) stats.kills++; if (m.v === this.id) this.alive = false; break;
      case 'snap':
        if (this.i === 0) {
          const now = Date.now();
          if (stats.lastSnap) { const g = now - stats.lastSnap; stats.gapSum += g; stats.gapMax = Math.max(stats.gapMax, g); }
          stats.lastSnap = now; stats.snaps++;
        }
        for (const e of m.ps) this.others.set(e[0], { x: e[1], y: e[2], z: e[3], alive: e[8] === 1 });
        break;
    }
  }
  pickTarget() {
    const s = MAP.dmSpawns[Math.floor(Math.random() * MAP.dmSpawns.length)];
    this.target = { x: s[0], z: s[2] };
  }
  step(dt, now) {
    if (!this.alive || this.ws.readyState !== 1) return;
    if (!this.target) this.pickTarget();
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) this.pickTarget();
    const sp = 5.4;
    this.vel.x = (dx / (d || 1)) * sp;
    this.vel.z = (dz / (d || 1)) * sp;
    this.yaw = Math.atan2(-dx, -dz);
    const before = { x: this.pos.x, z: this.pos.z };
    movePlayer(MAP.boxes, this.pos, this.vel, dt, STAND_H);
    if (Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < sp * dt * 0.3) { if (++this.stuck > 10) { this.pickTarget(); this.stuck = 0; } } else this.stuck = 0;
    this.ws.send(JSON.stringify({ t: 'st', s: this.sid, p: [this.pos.x, this.pos.y, this.pos.z], y: this.yaw, x: 0, c: 0, w: this.weapon }));
    // Görüş alanındaki en yakın rakibe ateş et (%35 isabet)
    if (now > this.nextShot) {
      this.nextShot = now + 400 + Math.random() * 900;
      let best = null, bestD = 40;
      const eye = [this.pos.x, this.pos.y + 1.6, this.pos.z];
      for (const [id, o] of this.others) {
        if (id === this.id || !o.alive) continue;
        const od = Math.hypot(o.x - this.pos.x, o.z - this.pos.z);
        if (od >= bestD) continue;
        const to = [o.x - eye[0], o.y + 1.2 - eye[1], o.z - eye[2]];
        const len = Math.hypot(...to);
        if (raycastWorld(MAP.boxes, eye, to.map((v) => v / len), len).hit) continue;
        best = { id, o, len }; bestD = od;
      }
      if (best) {
        stats.shots++;
        const hit = Math.random() < 0.35 ? [{ id: best.id, z: Math.random() < 0.2 ? 'head' : 'body' }] : [];
        this.ws.send(JSON.stringify({ t: 'shot', w: this.weapon, o: eye, e: [best.o.x, best.o.y + 1.2, best.o.z], hits: hit }));
      }
    }
  }
}

const bots = [];
for (let i = 0; i < COUNT; i++) { bots.push(new Bot(i)); await new Promise((r) => setTimeout(r, 40)); }
let last = Date.now();
const timer = setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const b of bots) b.step(dt, now);
}, 50);

async function report() {
  let srv = {};
  try { srv = await (await fetch(url + '/stats')).json(); } catch { /* eski sunucu */ }
  const avgGap = stats.snaps > 1 ? (stats.gapSum / (stats.snaps - 1)).toFixed(1) : '-';
  console.log(`[${new Date().toLocaleTimeString()}] bağlı=${stats.connected}/${COUNT} hata=${stats.errors} | snapshot aralığı ort=${avgGap}ms maks=${stats.gapMax}ms | `
    + `oyuncu başı indirme=${(stats.bytes / 1024 / 5).toFixed(1)} KB/s ${(stats.msgs / 5).toFixed(0)} mesaj/s | leş=${stats.kills} atış=${stats.shots} | `
    + `sunucu tick ort=${srv.tickAvgMs ?? '?'}ms maks=${srv.tickMaxMs ?? '?'}ms geç=${srv.lateTicks ?? '?'} bellek=${srv.memMB ?? '?'}MB`);
  stats.bytes = 0; stats.msgs = 0; stats.gapMax = 0; stats.gapSum = 0; stats.snaps = 0; stats.lastSnap = 0;
}
const rep = setInterval(report, 5000);
setTimeout(() => {
  clearInterval(timer); clearInterval(rep);
  for (const b of bots) b.ws.close();
  console.log('Test bitti.');
  setTimeout(() => process.exit(0), 500);
}, DURATION);
