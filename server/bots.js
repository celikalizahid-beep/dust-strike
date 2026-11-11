// Botlar: sunucuda çalışan yapay zekâ oyuncular. Oda için sıradan bir oyuncudurlar (aynı hasar, satın alma, bomba
// kuralları); yalnızca bağlantıları yoktur ve hareketlerini bu dosya üretir. Yol bulma haritanın hücre ızgarasında
// yapılır: iki komşu hücre arasında oyuncu gövdesi gerçekten yürüyebiliyorsa (basamak çıkma dahil) bağlantı vardır.
import { CELL } from '../public/shared/map.js';
import { WEAPONS } from '../public/shared/weapons.js';
import { boxHit, movePlayer, raycastWorld, PLAYER_HW, STAND_H, STEP_H, STAND_EYE } from '../public/shared/physics.js';

export const BOT_NAMES = ['Kaya', 'Demir', 'Aslan', 'Yıldız', 'Bora', 'Tuna', 'Efe', 'Kurt', 'Doğan', 'Şahin', 'Poyraz', 'Atlas', 'Alp', 'Toprak', 'Deniz', 'Çınar'];

const navCache = new Map();
const cellKey = (c, r) => r * 1000 + c;

// Haritanın yürüme ağı: düğümler doğulabilen hücre ortaları, kenarlar yürünebilen komşuluklar
export function buildNav(map) {
  if (navCache.has(map.id)) return navCache.get(map.id);
  const boxes = map.boxes;
  const floorUnder = (x, z, y) => {
    let top = 0;
    for (const b of boxes) {
      if (x + PLAYER_HW <= b.min[0] || x - PLAYER_HW >= b.max[0] || z + PLAYER_HW <= b.min[2] || z - PLAYER_HW >= b.max[2]) continue;
      if (b.max[1] <= y + STEP_H + 1e-6 && b.max[1] > top) top = b.max[1];
    }
    return top;
  };
  const fits = (x, z, y) => !boxHit(boxes, x, y + 0.002, z, PLAYER_HW, STAND_H);
  // a'dan b'ye küçük adımlarla yürünebiliyor mu (yükseklik farkı basamaklarla aşılıyor mu)
  const walk = (a, b) => {
    let y = a[1];
    for (let i = 1; i <= 10; i++) {
      const x = a[0] + (b[0] - a[0]) * (i / 10), z = a[2] + (b[2] - a[2]) * (i / 10);
      const ny = floorUnder(x, z, y);
      if (y - ny > 2.6 || !fits(x, z, ny)) return false;
      y = ny;
    }
    return Math.abs(y - b[1]) < 0.35;
  };
  const nodes = new Map();
  for (const s of map.dmSpawns) {
    const c = Math.floor((s[0] - map.ox) / CELL), r = Math.floor((s[2] - map.oz) / CELL);
    nodes.set(cellKey(c, r), { c, r, p: s, next: [] });
  }
  for (const n of nodes.values()) {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = nodes.get(cellKey(n.c + dc, n.r + dr));
      if (m && walk(n.p, m.p)) n.next.push(m);
    }
  }
  const nav = {
    nodes,
    at(x, z) {
      const c = Math.floor((x - map.ox) / CELL), r = Math.floor((z - map.oz) / CELL);
      let n = nodes.get(cellKey(c, r));
      if (n) return n;
      // Düğümsüz hücre (sandık üstü, eşya yanı): en yakın düğüm
      let best = null, bd = Infinity;
      for (const m of nodes.values()) { const d = (m.p[0] - x) ** 2 + (m.p[2] - z) ** 2; if (d < bd) { bd = d; best = m; } }
      return best;
    },
    // Genişlik öncelikli arama: düğüm listesi (başlangıç hariç) ya da yol yoksa null
    path(from, to) {
      if (!from || !to) return null;
      if (from === to) return [];
      const prev = new Map([[from, null]]);
      const queue = [from];
      for (let i = 0; i < queue.length; i++) {
        const n = queue[i];
        if (n === to) break;
        for (const m of n.next) if (!prev.has(m)) { prev.set(m, n); queue.push(m); }
      }
      if (!prev.has(to)) return null;
      const out = [];
      for (let n = to; n !== from; n = prev.get(n)) out.push(n);
      return out.reverse();
    },
    random() { const list = [...nodes.values()]; return list[Math.floor(Math.random() * list.length)]; },
  };
  navCache.set(map.id, nav);
  return nav;
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function turn(from, to, max) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

// Botun karar durumu (oyuncu nesnesindeki "ai" alanı)
export function newBrain() {
  return { path: null, goal: null, goalAt: 0, target: null, seenAt: 0, look: 0, nextShot: 0, burst: 0, stuck: 0, bought: -1, hold: 0, skill: 0.75 + Math.random() * 0.5 };
}

function siteNode(room, nav, name) {
  const s = room.map.sites[name];
  return s ? nav.at((s.x0 + s.x1) / 2 + (Math.random() - 0.5) * 6, (s.z0 + s.z1) / 2 + (Math.random() - 0.5) * 6) : null;
}

// Nereye gidilecek: ölüm maçında rastgele; klasikte T bombayı kurmaya, CT bölgeyi tutmaya / bombayı imhaya gider
function pickGoal(bot, room, nav) {
  const b = room.bomb, sites = Object.keys(room.map.sites || {});
  if (room.dm || !sites.length || room.phase === 'warmup') return nav.random();
  if (b && b.pos && (b.state === 'planted' || (b.state === 'dropped' && bot.team === 'T'))) return nav.at(b.pos[0], b.pos[2]);
  if (bot.team === 'T') {
    // Takım aynı bölgeye gider: raund numarasına göre seçilir
    return siteNode(room, nav, sites[room.round % sites.length]);
  }
  return siteNode(room, nav, sites[(bot.id + room.round) % sites.length]);
}

function buyGear(bot, room, api) {
  const ai = bot.ai;
  if (ai.bought === bot.sid) return;
  ai.bought = bot.sid;
  if (bot.primary) return;
  const options = room.mode === 'ffa' ? ['ak47', 'm4a1', 'mp5', 'p90'] : bot.team === 'T' ? ['ak47', 'galil', 'mp5'] : ['m4a1', 'famas', 'mp5'];
  for (const w of options) {
    if (room.dm || bot.money >= WEAPONS[w].price) { api.handle(bot, { t: 'buy', item: w }); break; }
  }
  if (!room.dm && bot.money >= 650 && bot.armor < 100) api.handle(bot, { t: 'buy', item: 'vest' });
}

// Bir botun bir tick'i. api.handle(bot, mesaj): botun adına odaya istemci mesajı gönderir (ateş, satın alma, bomba)
export function updateBot(bot, room, dt, t, api) {
  const ai = bot.ai;
  if (!bot.alive) { ai.path = null; ai.target = null; return; }
  const nav = buildNav(room.map);
  if (room.canBuy(bot)) buyGear(bot, room, api);
  bot.weapon = bot.primary || bot.secondary || 'knife';
  const w = WEAPONS[bot.weapon];
  const eye = [bot.pos[0], bot.pos[1] + STAND_EYE, bot.pos[2]];

  // ---- Düşman arama (saniyede birkaç kez): görüş hattı açık en yakın düşman
  if (t >= ai.look) {
    ai.look = t + 180 + Math.random() * 120;
    let best = null, bd = 75;
    for (const o of room.players.values()) {
      if (!o.alive || !room.enemies(bot, o)) continue;
      const chest = [o.pos[0], o.pos[1] + 1.1 - (o.crouch || 0) * 0.4, o.pos[2]];
      const d = dist3(eye, chest);
      if (d >= bd) continue;
      const dir = [(chest[0] - eye[0]) / d, (chest[1] - eye[1]) / d, (chest[2] - eye[2]) / d];
      if (raycastWorld(room.map.boxes, eye, dir, d).hit) continue;
      best = o; bd = d;
    }
    if (best !== ai.target) { ai.target = best; ai.seenAt = t; }
  }
  const frozen = room.phase === 'freeze';
  const b = room.bomb;
  const tgt = ai.target && ai.target.alive ? ai.target : null;

  // ---- Bomba işleri (klasik): kurarken / imha ederken yerinden oynamaz
  let busy = false;
  if (!room.dm && room.phase === 'live' && b) {
    if (b.state === 'carried' && b.carrier === bot.id && room.map.siteAt(bot.pos[0], bot.pos[2]) && !tgt) {
      if (!b.planting) api.handle(bot, { t: 'plant' });
      busy = true;
    } else if (b.state === 'planted' && bot.team === 'CT' && dist2(bot.pos, b.pos) < 1.8 && !tgt) {
      if (!b.defusing) api.handle(bot, { t: 'defuse' });
      busy = b.defusing?.id === bot.id || !b.defusing;
    }
  }

  // ---- Çatışma: düşmana dön, tepki süresinden sonra ateş et
  if (tgt) {
    const dx = tgt.pos[0] - bot.pos[0], dz = tgt.pos[2] - bot.pos[2], d = Math.hypot(dx, dz);
    bot.yaw = turn(bot.yaw, Math.atan2(-dx, -dz), dt * 7);
    bot.pitch = Math.atan2(tgt.pos[1] + 1.1 - eye[1], Math.max(0.1, d));
    const reaction = 420 / ai.skill;
    if (!frozen && w && !w.nade && t - ai.seenAt > reaction && t >= ai.nextShot) {
      const melee = !!w.melee;
      if (!melee || d < 1.9) {
        const rate = (w.rate || 0.5) * 1000;
        ai.burst++;
        // Otomatik silahta kısa seriler, aralarda duraklama
        ai.nextShot = t + (w.auto ? (ai.burst % 5 === 0 ? 450 + Math.random() * 400 : rate * 1.25) : rate + 250 + Math.random() * 350);
        const chance = Math.max(0.1, Math.min(0.55, (0.62 - d / 95) * ai.skill)) * (w.scope ? 1.25 : 1);
        const hit = melee || Math.random() < chance;
        const zone = !melee && Math.random() < 0.13 ? 'head' : Math.random() < 0.2 ? 'legs' : 'body';
        const miss = hit ? 0 : 0.5 + Math.random();
        const e = [tgt.pos[0] + (Math.random() - 0.5) * miss * 2, tgt.pos[1] + (zone === 'head' ? 1.6 : zone === 'legs' ? 0.5 : 1.15) + miss * 0.4, tgt.pos[2] + (Math.random() - 0.5) * miss * 2];
        api.handle(bot, { t: 'shot', w: bot.weapon, o: eye, e, hits: hit ? [{ id: tgt.id, z: zone }] : [] });
      }
    }
  }

  // ---- Hareket
  let vx = 0, vz = 0;
  const fighting = tgt && !(w && w.melee);
  if (!frozen && !busy && !fighting) {
    if (tgt) { ai.goal = nav.at(tgt.pos[0], tgt.pos[2]); ai.path = null; } // bıçakla: düşmana koş
    if (!ai.path || !ai.goal || t > ai.goalAt) {
      if (!tgt) ai.goal = pickGoal(bot, room, nav);
      ai.path = nav.path(nav.at(bot.pos[0], bot.pos[2]), ai.goal) || [];
      ai.goalAt = t + (tgt ? 700 : 9000 + Math.random() * 6000);
    }
    while (ai.path.length && dist2(bot.pos, ai.path[0].p) < 0.55) ai.path.shift();
    const next = ai.path[0];
    if (next) {
      const dx = next.p[0] - bot.pos[0], dz = next.p[2] - bot.pos[2], d = Math.hypot(dx, dz) || 1;
      const speed = ((w && w.speed) || 6) * 0.9;
      vx = (dx / d) * speed; vz = (dz / d) * speed;
      if (!tgt) { bot.yaw = turn(bot.yaw, Math.atan2(-dx, -dz), dt * 8); bot.pitch *= 0.8; }
    } else if (!tgt) ai.goalAt = Math.min(ai.goalAt, t + 1500 + Math.random() * 2500); // hedefe vardı: biraz bekle
  }
  const pos = { x: bot.pos[0], y: bot.pos[1], z: bot.pos[2] };
  const vel = { x: vx, y: bot.vy || 0, z: vz };
  movePlayer(room.map.boxes, pos, vel, dt, STAND_H);
  // Takıldıysa (köşe, eşya) yolu yeniden hesapla
  if ((vx || vz) && Math.hypot(pos.x - bot.pos[0], pos.z - bot.pos[2]) < Math.hypot(vx, vz) * dt * 0.25) {
    if (++ai.stuck > 12) { ai.stuck = 0; ai.path = null; ai.goalAt = 0; }
  } else ai.stuck = 0;
  bot.vy = vel.y;
  bot.pos = [pos.x, pos.y, pos.z];
  bot.crouch = 0;
}
