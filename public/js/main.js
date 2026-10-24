// DUST STRIKE istemcisi: render döngüsü, girdi, hareket, silahlar ve ağ.
import * as THREE from 'three';
import { buildMap, siteAt, inBuyZone } from '../shared/map.js';
import { WEAPONS } from '../shared/weapons.js';
import { movePlayer, boxHit, raycastWorld, rayAABB, STAND_H, CROUCH_H, STAND_EYE, CROUCH_EYE, JUMP_V, PLAYER_HW } from '../shared/physics.js';
import { buildWorld } from './world.js';
import { createPlayerModel, createWeaponModel, Viewmodel, makeNameSprite } from './models.js';
import * as sfx from './audio.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';

const MAP = buildMap();
const NADE_ORDER = ['he', 'flash', 'smoke'];
const BASE_FOV = 74;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const arr = (v) => [v.x, v.y, v.z];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

// ---------------------------------------------------------------- Görüntü
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
document.getElementById('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 600);
camera.rotation.order = 'YXZ';
const world = buildWorld(scene, MAP);
const fx = new Effects(scene, MAP.boxes);

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 20);
vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7350, 3.2));
vmScene.add(new THREE.AmbientLight(0xffffff, 0.6));
const vmSun = new THREE.DirectionalLight(0xfff2dc, 3.0);
vmSun.position.set(0.6, 1, 0.8);
vmScene.add(vmSun);
const vm = new Viewmodel(vmScene);
const hud = new HUD(MAP);

const bombModel = createWeaponModel('bomb');
bombModel.scale.setScalar(1.5);
bombModel.visible = false;
const bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
bombLed.position.set(0.08, 0.06, -0.04);
bombModel.add(bombLed);
scene.add(bombModel);

// ---------------------------------------------------------------- Durum
const S = {
  myId: 0, joined: false, team: 'SPEC', alive: false, hp: 100, armor: 0, helmet: false, kit: false, money: 0,
  inv: { primary: null, secondary: null, nades: { he: 0, flash: 0, smoke: 0 } },
  phase: 'warmup', phaseEnd: 0, buyEnd: 0, round: 0, score: { T: 0, CT: 0 }, msg: '',
  bomb: null, bombExplodeAt: 0, roster: new Map(), sid: 0, rtt: 0,
};
const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouch: 0, punchP: 0, punchY: 0, stepT: 0 };
const W = { cur: null, last: null, ammo: {}, nextFire: 0, reloadEnd: 0, drawEnd: 0, shots: 0, lastShot: 0, scope: 0, scopeResume: 0, sprayDir: 1, autoReload: false };
const input = { keys: Object.create(null), mouseL: false, mouseR: false, lPressed: false, rPressed: false, jumpAt: 0 };
const remotes = new Map();
const itemMeshes = new Map();
const act = { kind: null, start: 0, dur: 0, tick: 0 };
const view = {
  deathAt: 0, deathPos: new THREE.Vector3(), deathYaw: 0, deathPitch: 0, specId: 0, shake: 0,
  blindT0: 0, blindDur: 0, blindK: 0, hurt: 0, nextBeep: 0, ledOff: 0, aimCheck: 0,
  settings: loadSettings(),
};
let locked = false, chatOpen = false, chatTeam = false, menuOpen = false, nadeCid = 0;

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('dust-settings') || '{}'); } catch { /* yok say */ }
  return { sens: s.sens ?? 1.6, vol: s.vol ?? 0.6, name: s.name ?? '' };
}
function saveSettings() {
  try { localStorage.setItem('dust-settings', JSON.stringify(view.settings)); } catch { /* yok say */ }
}

// ---------------------------------------------------------------- Ağ
let ws = null;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => hud.menuStatus('Sunucuya bağlandı — takımını seç');
  ws.onclose = () => {
    hud.menuStatus('Sunucu bağlantısı koptu, yeniden deneniyor…');
    S.joined = false; S.alive = false;
    for (const id of [...remotes.keys()]) removeRemote(id);
    S.roster.clear();
    hud.setVisible(false); hud.showPause(false); hud.closeBuy(); hud.showMenu(true);
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(connect, 2000);
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onMessage(m);
  };
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onMessage(m) {
  const now = performance.now();
  switch (m.t) {
    case 'welcome': S.myId = m.id; break;
    case 'state': {
      const prevPhase = S.phase, prevRound = S.round;
      S.phase = m.phase; S.round = m.round; S.score = m.score;
      S.phaseEnd = m.left ? now + m.left : 0;
      S.buyEnd = now + m.buyLeft;
      hud.setScore(m.score.T, m.score.CT);
      if (m.phase === 'freeze' && m.round !== prevRound) { fx.clearRound(); hud.center(m.msg, 'Satın almak için B', 3000); }
      else if (m.msg && m.msg !== S.msg && (m.phase === 'warmup' || m.phase === 'gameover')) hud.center(m.msg, '', 4500);
      if (prevPhase === 'freeze' && m.phase === 'live' && S.joined) { sfx.roundStart(); hud.center('Hadi, hadi, hadi!', '', 1500); }
      S.msg = m.msg;
      break;
    }
    case 'roster': applyRoster(m.ps); break;
    case 'you': applyYou(m); break;
    case 'spawn': onSpawn(m); break;
    case 'snap': applySnap(m.ps, now); break;
    case 'shot': onRemoteShot(m); break;
    case 'hurt': onHurt(m); break;
    case 'kill': onKill(m); break;
    case 'rend':
      hud.center(m.msg, m.sub, 5000);
      if (S.joined) sfx.roundEnd(m.winner === S.team);
      break;
    case 'bomb': onBomb(m.b, now); break;
    case 'items': syncItems(m.items); break;
    case 'nade': fx.addNade({ sid: m.id, owner: m.owner, type: m.type, o: m.o, v: m.v }); break;
    case 'boom': onBoom(m); break;
    case 'planting': sfx.beep(new THREE.Vector3(...m.p)); break;
    case 'chat': hud.chat(m); sfx.chatBlip(); break;
    case 'note': hud.note(m.text); break;
    case 'bought': sfx.buy(); break;
    case 'leave': removeRemote(m.id); break;
    case 'pong': S.rtt = Math.round(now - m.ts); break;
  }
}

// ---------------------------------------------------------------- Diğer oyuncular
function getRemote(id) {
  let r = remotes.get(id);
  if (!r) {
    r = {
      id, name: '', team: null, model: null, modelTeam: null, nameSprite: null, snaps: [],
      alive: false, dead: false, deathT: 0, w: null,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, speed: 0, legT: 0, stepT: 0, hitboxes: [],
    };
    remotes.set(id, r);
  }
  return r;
}

function ensureModel(r, team, force = false) {
  if (team !== 'T' && team !== 'CT') return;
  if (r.model && r.modelTeam === team && !force) return;
  if (r.model) scene.remove(r.model.group);
  r.model = createPlayerModel(team);
  r.modelTeam = team;
  r.team = team;
  r.nameSprite = makeNameSprite(r.name || '?', team === 'T' ? '#ffcc88' : '#a9ccff');
  r.nameSprite.position.y = 2.1;
  r.model.group.add(r.nameSprite);
  r.model.group.position.set(r.x, r.y, r.z);
  if (r.w) r.model.setWeapon(r.w);
  scene.add(r.model.group);
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  if (r.model) scene.remove(r.model.group);
  remotes.delete(id);
}

function applyRoster(ps) {
  const seen = new Set();
  let t = 0, ct = 0;
  for (const e of ps) {
    seen.add(e.id);
    S.roster.set(e.id, e);
    if (e.team === 'T') t++; else if (e.team === 'CT') ct++;
    if (e.id === S.myId) continue;
    const r = getRemote(e.id);
    if (r.name !== e.name || r.team !== e.team) { r.name = e.name; ensureModel(r, e.team, true); }
  }
  for (const id of [...S.roster.keys()]) if (!seen.has(id)) { S.roster.delete(id); removeRemote(id); }
  hud.menuCounts(t, ct);
  if (input.keys.Tab) showScoreboard();
}

function applySnap(ps, now) {
  for (const e of ps) {
    const [id, x, y, z, yaw, pitch, c, w, a] = e;
    if (id === S.myId) continue;
    const r = getRemote(id);
    if (!r.model) {
      const info = S.roster.get(id);
      if (info) { r.name = info.name; ensureModel(r, info.team); }
      if (!r.model) continue;
    }
    const alive = a === 1;
    if (alive && !r.alive) {
      r.snaps.length = 0;
      r.dead = false;
      r.model.group.rotation.x = 0;
      r.x = x; r.y = y; r.z = z;
    }
    r.alive = alive;
    if (alive) {
      r.snaps.push({ t: now, x, y, z, yaw, pitch, c });
      if (r.snaps.length > 40) r.snaps.shift();
    }
    if (w !== r.w) { r.w = w; r.model.setWeapon(w); }
  }
}

function updateRemotes(dt, now) {
  const rt = now - 100;
  for (const r of remotes.values()) {
    if (!r.model) continue;
    const g = r.model.group;
    if (r.alive && r.snaps.length) {
      const sn = r.snaps;
      while (sn.length > 2 && sn[1].t <= rt) sn.shift();
      const a = sn[0], b = sn[1];
      let x = a.x, y = a.y, z = a.z, yaw = a.yaw, pitch = a.pitch, c = a.c;
      if (b && rt >= a.t) {
        const f = Math.min(1, (rt - a.t) / Math.max(1, b.t - a.t));
        x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f; z = a.z + (b.z - a.z) * f;
        yaw = lerpAngle(a.yaw, b.yaw, f); pitch = a.pitch + (b.pitch - a.pitch) * f; c = a.c + (b.c - a.c) * f;
      }
      const moved = Math.hypot(x - r.x, z - r.z);
      const inAir = Math.abs(y - r.y) > 0.01;
      r.speed = r.speed * 0.8 + (dt > 0 ? moved / dt : 0) * 0.2;
      r.x = x; r.y = y; r.z = z; r.yaw = yaw; r.pitch = pitch; r.crouch = c;
      g.position.set(x, y, z);
      g.rotation.y = yaw;
      const m = r.model;
      const spd = Math.min(1, r.speed / 5);
      r.legT += dt * r.speed * 2.2;
      const swing = Math.sin(r.legT) * 0.6 * spd;
      m.legs[0].rotation.x = swing;
      m.legs[1].rotation.x = -swing;
      const hip = 0.85 - c * 0.5;
      m.upper.position.y = hip;
      for (const l of m.legs) { l.position.y = hip; l.scale.y = hip / 0.85; }
      m.aim.rotation.x = pitch;
      m.head.rotation.x = pitch * 0.5;
      if (r.speed > 4.2 && !inAir) {
        r.stepT -= dt;
        if (r.stepT <= 0) { r.stepT = 0.36; sfx.step(new THREE.Vector3(x, y, z), 1); }
      }
      const off = c * 0.5;
      r.hitboxes = [
        { zone: 'head', min: [x - 0.16, y + 1.47 - off, z - 0.16], max: [x + 0.16, y + 1.78 - off, z + 0.16] },
        { zone: 'body', min: [x - 0.27, y + 0.85 - off, z - 0.27], max: [x + 0.27, y + 1.47 - off, z + 0.27] },
        { zone: 'legs', min: [x - 0.22, y, z - 0.22], max: [x + 0.22, y + 0.85 - off, z + 0.22] },
      ];
    } else r.hitboxes = [];
    if (r.dead) {
      const f = Math.min(1, (now - r.deathT) / 450);
      g.rotation.x = f * f * Math.PI * 0.49;
      g.position.y = r.y + f * 0.13;
    }
    r.nameSprite.visible = r.alive && r.team === S.team;
  }
}

// ---------------------------------------------------------------- Sunucu olayları
function fillAmmo(w) {
  const d = WEAPONS[w];
  if (d && d.mag) W.ammo[w] = { mag: d.mag, res: d.reserve };
}

function applyYou(m) {
  const prev = S.inv;
  const wasAlive = S.alive;
  S.team = m.team; S.hp = m.hp; S.armor = m.armor; S.helmet = m.helmet; S.kit = m.kit; S.money = m.money;
  S.inv = { primary: m.primary, secondary: m.secondary, nades: { ...m.nades } };
  S.alive = m.alive;
  if (m.primary && m.primary !== prev.primary) {
    fillAmmo(m.primary);
    if (S.alive && wasAlive) switchWeapon(m.primary);
  }
  if (m.secondary && m.secondary !== prev.secondary) {
    fillAmmo(m.secondary);
    if (S.alive && wasAlive && (W.cur === prev.secondary || W.cur === 'knife' || !W.cur)) switchWeapon(m.secondary);
  }
  if (S.alive && W.cur && !owns(W.cur)) switchWeapon(bestWeapon());
  if (hud.buyOpen) hud.refreshBuy(buyCtx());
}

function onSpawn(m) {
  S.sid = m.sid;
  S.alive = true;
  P.pos.set(m.p[0], m.p[1], m.p[2]);
  P.vel.set(0, 0, 0);
  P.yaw = m.yaw; P.pitch = 0; P.crouch = 0; P.punchP = 0; P.punchY = 0; P.onGround = true;
  view.deathAt = 0; view.specId = 0; view.blindDur = 0; view.hurt = 0;
  act.kind = null;
  if (S.inv.primary) fillAmmo(S.inv.primary);
  if (S.inv.secondary) fillAmmo(S.inv.secondary);
  W.cur = null;
  switchWeapon(bestWeapon(), true);
  hud.spec('');
}

function onHurt(m) {
  S.hp = m.hp;
  S.armor = m.armor;
  view.hurt = Math.min(1, view.hurt + 0.25 + m.d / 100);
  P.punchP += Math.min(0.05, m.d * 0.0012);
  sfx.hurt();
}

function onKill(m) {
  const kInfo = S.roster.get(m.k), vInfo = S.roster.get(m.v);
  const kName = kInfo?.name ?? '?';
  const wName = m.w === 'bomb' ? 'C4' : (WEAPONS[m.w]?.name ?? m.w);
  const suicide = !m.k || m.k === m.v;
  hud.killfeed({ k: suicide ? '' : kName, kTeam: kInfo?.team, v: vInfo?.name ?? '?', vTeam: vInfo?.team, w: wName, hs: m.hs, mine: m.k === S.myId || m.v === S.myId });
  if (vInfo) vInfo.alive = false;
  if (m.v === S.myId) {
    S.alive = false;
    view.deathAt = performance.now();
    view.deathPos.copy(P.pos);
    view.deathYaw = P.yaw;
    view.deathPitch = P.pitch;
    W.scope = 0; W.scopeResume = 0;
    act.kind = null;
    input.mouseL = false;
    hud.progress(null);
    if (hud.buyOpen) hud.closeBuy();
    sfx.death();
    hud.spec(suicide ? 'Öldün' : `<b>${esc(kName)}</b> seni ${esc(wName)} ile öldürdü${m.hs ? ' (kafadan!)' : ''}`);
  } else {
    const r = remotes.get(m.v);
    if (r && r.model) { r.alive = false; r.dead = true; r.deathT = performance.now(); }
  }
}

function onRemoteShot(m) {
  const o = new THREE.Vector3(...m.o), e = new THREE.Vector3(...m.e);
  const w = WEAPONS[m.w];
  if (w?.melee) { sfx.knifeSwing(o); if (m.b) sfx.knifeHit(o); return; }
  sfx.gun(m.w, o);
  const r = remotes.get(m.id);
  const mz = o.clone();
  if (r?.model?.weapon && view.specId !== m.id) r.model.weapon.userData.muzzle.getWorldPosition(mz);
  else mz.y -= 0.15;
  if (view.specId === m.id && !S.alive) vm.kick(1); else fx.muzzle(mz);
  if (Math.random() < 0.6) fx.tracer(mz, e);
  if (m.b) { fx.blood(e); return; }
  const d = e.clone().sub(o);
  const len = d.length();
  if (len < 0.1) return;
  d.divideScalar(len);
  const h = raycastWorld(MAP.boxes, m.o, [d.x, d.y, d.z], len + 0.2);
  if (h.hit) fx.impact(new THREE.Vector3(...h.point), new THREE.Vector3(...h.normal));
}

function onBomb(b, now) {
  const prev = S.bomb;
  S.bomb = b;
  if (b && b.state === 'planted') {
    S.bombExplodeAt = now + b.left;
    if (!prev || prev.state !== 'planted') {
      hud.center('Bomba kuruldu!', `${b.site} bölgesi — ${S.team === 'CT' ? 'imha et!' : 'bölgeyi koru!'}`, 3500);
      sfx.planted();
      if (act.kind === 'plant') act.kind = null;
      view.nextBeep = now;
    }
  } else if (act.kind === 'defuse') act.kind = null;
  const hadBomb = prev && prev.state === 'carried' && prev.carrier === S.myId;
  const hasNow = hasBomb();
  if (hadBomb && !hasNow) { if (act.kind === 'plant') act.kind = null; if (W.cur === 'bomb') switchWeapon(bestWeapon()); }
  if (!hadBomb && hasNow) hud.note('C4 sende! 5 tuşu ile seç, A veya B bölgesinde E tuşunu basılı tut.', 5000);
  if (b && (b.state === 'dropped' || b.state === 'planted' || b.state === 'defused') && b.pos) {
    bombModel.visible = true;
    bombModel.position.set(b.pos[0], b.pos[1] + 0.06, b.pos[2]);
  } else bombModel.visible = false;
}

function syncItems(list) {
  const ids = new Set(list.map((i) => i.id));
  for (const [id, m] of itemMeshes) if (!ids.has(id)) { scene.remove(m); itemMeshes.delete(id); }
  for (const it of list) {
    if (itemMeshes.has(it.id)) continue;
    const outer = new THREE.Group();
    const inner = createWeaponModel(it.w);
    inner.rotation.z = Math.PI / 2;
    inner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outer.add(inner);
    outer.rotation.y = Math.random() * Math.PI * 2;
    outer.position.set(it.p[0], it.p[1] + 0.04, it.p[2]);
    scene.add(outer);
    itemMeshes.set(it.id, outer);
  }
}

function onBoom(m) {
  fx.removeNade((n) => (m.id && n.sid === m.id) || (m.owner === S.myId && m.cid && n.cid === m.cid));
  const pos = new THREE.Vector3(...m.p);
  if (m.type === 'he' || m.type === 'c4') {
    const big = m.type === 'c4';
    fx.explosion(pos, big);
    sfx.explosion(pos);
    const d = camera.position.distanceTo(pos);
    view.shake = Math.max(view.shake, (big ? 1.6 : 0.8) * Math.max(0, 1 - d / (big ? 60 : 25)));
    if (big) bombModel.visible = false;
  } else if (m.type === 'flash') {
    fx.flashPop(pos);
    sfx.flashPop(pos);
    applyFlash(pos);
  } else if (m.type === 'smoke') {
    fx.smoke(pos);
    sfx.smokeHiss(pos);
  }
}

function applyFlash(pos) {
  if (!S.joined) return;
  const eye = camera.position;
  const to = pos.clone().sub(eye);
  const d = to.length();
  if (d > 45) return;
  to.divideScalar(Math.max(0.01, d));
  const h = raycastWorld(MAP.boxes, [eye.x, eye.y, eye.z], [to.x, to.y, to.z], d);
  if (h.hit && h.t < d - 0.25) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dot = fwd.dot(to);
  let k = dot > 0.6 ? 1 : dot > 0.2 ? 0.75 : dot > -0.3 ? 0.4 : 0.15;
  k *= Math.max(0.25, 1 - d / 45);
  view.blindT0 = performance.now();
  view.blindDur = (0.5 + 4.5 * k) * 1000;
  view.blindK = Math.min(1, k * 1.25);
  sfx.ringing(k, view.blindDur / 1000);
}

function blindLevel(now) {
  const el = now - view.blindT0;
  if (el >= view.blindDur) return 0;
  const hold = view.blindDur * 0.45;
  return el < hold ? view.blindK : view.blindK * (1 - (el - hold) / (view.blindDur - hold));
}

// ---------------------------------------------------------------- Silahlar
const hasBomb = () => !!S.bomb && S.bomb.state === 'carried' && S.bomb.carrier === S.myId;
const bestWeapon = () => S.inv.primary || S.inv.secondary || 'knife';
function owns(w) {
  if (!w) return false;
  if (w === 'knife') return true;
  if (w === 'bomb') return hasBomb();
  if (WEAPONS[w]?.nade) return (S.inv.nades[w] || 0) > 0;
  return S.inv.primary === w || S.inv.secondary === w;
}
function weaponList() {
  return [S.inv.primary, S.inv.secondary, 'knife', ...NADE_ORDER.filter((n) => S.inv.nades[n] > 0), hasBomb() ? 'bomb' : null].filter(Boolean);
}

function switchWeapon(name, instant = false) {
  if (!name || !owns(name)) return;
  if (name === W.cur && !instant) return;
  if (W.cur && W.cur !== name) W.last = W.cur;
  W.cur = name;
  W.reloadEnd = 0; W.scope = 0; W.scopeResume = 0; W.shots = 0; W.autoReload = false;
  const d = WEAPONS[name];
  W.drawEnd = performance.now() + (instant ? 0 : (d.draw || 0.6) * 1000);
  W.nextFire = Math.max(W.nextFire, W.drawEnd);
  vm.set(name, S.team, instant);
  if (!instant) sfx.deploy();
  if (act.kind === 'plant' && name !== 'bomb') cancelAction();
}

function selectSlot(n) {
  if (!S.alive) return;
  if (n === 1) switchWeapon(S.inv.primary);
  else if (n === 2) switchWeapon(S.inv.secondary);
  else if (n === 3) switchWeapon('knife');
  else if (n === 4) {
    const avail = NADE_ORDER.filter((t) => S.inv.nades[t] > 0);
    if (avail.length) switchWeapon(avail[(avail.indexOf(W.cur) + 1) % avail.length]);
  } else if (n === 5 && hasBomb()) switchWeapon('bomb');
}

function cycleWeapon(dir) {
  const list = weaponList();
  if (!list.length) return;
  const i = list.indexOf(W.cur);
  switchWeapon(list[(i + dir + list.length) % list.length]);
}

const eyeHeight = () => STAND_EYE - (STAND_EYE - CROUCH_EYE) * P.crouch;
const eyePos = () => new THREE.Vector3(P.pos.x, P.pos.y + eyeHeight(), P.pos.z);
function dirFrom(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
function muzzleWorld() {
  const r = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  return eyePos().addScaledVector(dirFrom(P.yaw, P.pitch), 0.6).addScaledVector(r, 0.12).setY(P.pos.y + eyeHeight() - 0.1);
}

function currentSpread(w) {
  if (!w || !w.spread) return 0;
  const sp = Math.hypot(P.vel.x, P.vel.z);
  let s = w.scope && W.scope > 0 ? w.scopedSpread : w.spread;
  if (!P.onGround) s += w.jumpSpread;
  else if (sp > 0.6) s += w.moveSpread * Math.min(1, sp / 5.5);
  if (P.crouch > 0.5 && P.onGround) s *= 0.7;
  s += Math.min(W.shots, 12) * w.recoil * 0.35;
  return s;
}

function trace(o, d, range) {
  const wall = raycastWorld(MAP.boxes, [o.x, o.y, o.z], [d.x, d.y, d.z], range);
  let hit = null;
  for (const r of remotes.values()) {
    if (!r.alive || r.team === S.team) continue;
    for (const hb of r.hitboxes) {
      const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, hb.min, hb.max);
      if (h && h.t < wall.t && (!hit || h.t < hit.t)) hit = { t: h.t, id: r.id, zone: hb.zone };
    }
  }
  return { wall, hit };
}

function fireGun(now) {
  const w = WEAPONS[W.cur];
  const a = W.ammo[W.cur];
  if (!a) return;
  if (a.mag <= 0) {
    sfx.dry();
    W.nextFire = now + 300;
    if (a.res > 0) startReload();
    return;
  }
  const spread = currentSpread(w);
  a.mag--;
  W.nextFire = now + w.rate * 1000;
  W.lastShot = now;
  const eye = eyePos();
  const dir = dirFrom(P.yaw + P.punchY, P.pitch + P.punchP);
  if (spread > 0) {
    const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const rr = spread * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
    dir.addScaledVector(right, Math.cos(th) * rr).addScaledVector(up, Math.sin(th) * rr).normalize();
  }
  const res = trace(eye, dir, 250);
  const end = res.hit ? eye.clone().addScaledVector(dir, res.hit.t) : new THREE.Vector3(...res.wall.point);
  if (res.hit) {
    fx.blood(end);
    if (res.hit.zone === 'head') sfx.headshot(); else sfx.hitBody();
  } else if (res.wall.hit) fx.impact(end, new THREE.Vector3(...res.wall.normal));
  send({ t: 'shot', w: W.cur, o: arr(eye), e: arr(end), hits: res.hit ? [{ id: res.hit.id, z: res.hit.zone }] : [] });

  sfx.gun(W.cur, null);
  vm.kick(w.slot === 2 ? 0.8 : 1);
  const mz = muzzleWorld();
  fx.pulse(mz, 0xffb060, 18, 0.05);
  if (Math.random() < (w.auto ? 0.5 : 0.25)) fx.tracer(mz, end);

  const k = Math.min(W.shots, 6);
  P.punchP = Math.min(0.2, P.punchP + w.recoil * (1 + 0.25 * k));
  if (w.auto && W.shots >= 3) {
    if (Math.random() < 0.3) W.sprayDir *= -1;
    P.punchY = clamp(P.punchY + W.sprayDir * w.recoil * 0.5, -0.08, 0.08);
  }
  W.shots++;
  if (w.scope && W.scope > 0) { W.scopeResume = W.scope; W.scope = 0; }
  if (a.mag === 0 && a.res > 0) W.autoReload = true;
}

function knife(alt, now) {
  const w = WEAPONS.knife;
  W.nextFire = now + (alt ? w.rate2 : w.rate) * 1000;
  vm.swing(alt);
  const eye = eyePos();
  const dir = dirFrom(P.yaw, P.pitch);
  const range = alt ? w.range2 : w.range;
  const res = trace(eye, dir, range);
  let end;
  if (res.hit) {
    end = eye.clone().addScaledVector(dir, res.hit.t);
    sfx.knifeHit(null);
    fx.blood(end);
  } else if (res.wall.hit) {
    end = new THREE.Vector3(...res.wall.point);
    sfx.knifeWall();
    fx.impact(end, new THREE.Vector3(...res.wall.normal));
  } else {
    end = eye.clone().addScaledVector(dir, range);
    sfx.knifeSwing(null);
  }
  send({ t: 'shot', w: 'knife', alt, o: arr(eye), e: arr(end), hits: res.hit ? [{ id: res.hit.id, z: res.hit.zone }] : [] });
}

function throwNade(alt, now) {
  const type = W.cur;
  if (!(S.inv.nades[type] > 0)) return;
  W.nextFire = now + 1000;
  vm.throwAnim();
  sfx.nadeThrow();
  const eye = eyePos();
  const dir = dirFrom(P.yaw, P.pitch + 0.08);
  const h = raycastWorld(MAP.boxes, [eye.x, eye.y, eye.z], [dir.x, dir.y, dir.z], 0.6);
  const o = h.hit ? eye.clone() : eye.clone().addScaledVector(dir, 0.4);
  const v = dir.clone().multiplyScalar(alt ? 7 : 16).addScaledVector(P.vel, 0.6);
  const cid = ++nadeCid;
  S.inv.nades[type]--;
  fx.addNade({ cid, owner: S.myId, type, o: arr(o), v: arr(v) });
  send({ t: 'nade', type, o: arr(o), v: arr(v), cid });
  setTimeout(() => {
    if (W.cur !== type || !S.alive) return;
    if (S.inv.nades[type] > 0) vm.set(type, S.team);
    else switchWeapon(W.last && owns(W.last) ? W.last : bestWeapon());
  }, 450);
}

function startReload() {
  const w = WEAPONS[W.cur], a = W.ammo[W.cur];
  if (!S.alive || !w || !a || !w.mag || W.reloadEnd || a.mag >= w.mag || a.res <= 0) return;
  W.reloadEnd = performance.now() + w.reload * 1000;
  W.scope = 0; W.scopeResume = 0;
  vm.reload(w.reload);
  sfx.reload(W.cur, w.reload);
}

function dropWeapon() {
  if (!S.alive) return;
  if (W.cur === 'bomb') { send({ t: 'drop', w: 'bomb' }); return; }
  const w = WEAPONS[W.cur];
  if (w && (w.slot === 1 || w.slot === 2)) send({ t: 'drop', w: W.cur });
}

function updateWeapon(dt, now) {
  // Görüş tepmesinin toparlanması (CS 1.6 gibi: sabit + orantılı)
  const len = Math.hypot(P.punchP, P.punchY);
  if (len > 1e-5) {
    const nl = Math.max(0, len - (0.17 + len * 0.5) * dt);
    P.punchP *= nl / len;
    P.punchY *= nl / len;
  }
  if (!S.alive) return;
  const w = WEAPONS[W.cur];
  if (!w) return;
  if (W.reloadEnd && now >= W.reloadEnd) {
    const a = W.ammo[W.cur];
    const take = Math.min(w.mag - a.mag, a.res);
    a.mag += take; a.res -= take;
    W.reloadEnd = 0;
  }
  if (W.shots > 0 && now - W.lastShot > (w.rate || 0.1) * 1000 + 300) W.shots = 0;
  if (W.autoReload && now >= W.nextFire) { W.autoReload = false; startReload(); }
  if (W.scopeResume && now >= W.nextFire && !W.reloadEnd) { W.scope = W.scopeResume; W.scopeResume = 0; }

  const canAct = locked && !chatOpen && !hud.buyOpen && S.phase !== 'freeze' && act.kind === null &&
    now >= W.nextFire && now >= W.drawEnd && !W.reloadEnd;
  if (canAct) {
    if (w.melee) {
      if (input.lPressed || input.mouseL) knife(false, now);
      else if (input.rPressed || input.mouseR) knife(true, now);
    } else if (w.nade) {
      if (input.lPressed) throwNade(false, now);
      else if (input.rPressed) throwNade(true, now);
    } else if (w.mag) {
      if (w.auto ? input.mouseL : input.lPressed) fireGun(now);
    }
  }
  if (input.rPressed && w.scope && locked && !W.reloadEnd && now >= W.drawEnd) {
    W.scope = (W.scope + 1) % 3;
    W.scopeResume = 0;
    sfx.dry();
  }
}

// ---------------------------------------------------------------- Bomba kurma / imha
function cancelAction() {
  if (act.kind === 'plant') send({ t: 'unplant' });
  else if (act.kind === 'defuse') send({ t: 'undefuse' });
  act.kind = null;
  hud.progress(null);
}

function updateAction(now) {
  const b = S.bomb;
  const canPlant = S.phase === 'live' && hasBomb() && !!siteAt(P.pos.x, P.pos.z) && P.onGround;
  const nearBomb = S.team === 'CT' && S.phase === 'live' && b && b.state === 'planted' &&
    Math.hypot(P.pos.x - b.pos[0], P.pos.z - b.pos[2]) < 1.9 && Math.abs(P.pos.y - b.pos[1]) < 1.4;
  const holdE = !!input.keys.KeyE && !chatOpen;
  const wantPlant = canPlant && (holdE || (W.cur === 'bomb' && input.mouseL && locked));
  const wantDefuse = nearBomb && holdE && (!b.defuser || b.defuser === S.myId);
  if (act.kind === 'plant' && !wantPlant) cancelAction();
  if (act.kind === 'defuse' && !wantDefuse) cancelAction();
  if (!act.kind && wantPlant) {
    act.kind = 'plant'; act.start = now; act.dur = 3000;
    send({ t: 'plant' });
    if (W.cur !== 'bomb') switchWeapon('bomb');
    sfx.keypad();
  }
  if (!act.kind && wantDefuse) {
    act.kind = 'defuse'; act.start = now; act.dur = S.kit ? 5000 : 10000;
    send({ t: 'defuse' });
  }
  if (act.kind) {
    P.vel.x = 0; P.vel.z = 0;
    hud.progress(act.kind === 'plant' ? 'Bomba kuruluyor…' : 'Bomba imha ediliyor…', (now - act.start) / act.dur);
    if (act.kind === 'defuse' && now >= act.tick) { act.tick = now + 450; sfx.defuseTick(null); }
    hud.hint('');
  } else {
    hud.progress(null);
    let hint = '';
    if (canPlant) hint = 'Bombayı kurmak için E tuşunu basılı tut';
    else if (nearBomb) hint = b.defuser && b.defuser !== S.myId ? 'Takım arkadaşın bombayı imha ediyor' : `İmha etmek için E tuşunu basılı tut (${S.kit ? '5' : '10'} sn)`;
    else if (W.cur === 'bomb' && S.phase === 'live') hint = 'Bombayı A veya B bölgesine kurmalısın';
    hud.hint(hint);
  }
}

// ---------------------------------------------------------------- Hareket
function accelerate(wx, wz, wish, accel, dt) {
  if (wish <= 0) return;
  const cur = P.vel.x * wx + P.vel.z * wz;
  const add = wish - cur;
  if (add <= 0) return;
  const a = Math.min(accel * wish * dt, add);
  P.vel.x += a * wx;
  P.vel.z += a * wz;
}
function airAccelerate(wx, wz, wish, accel, dt) {
  if (wish <= 0) return;
  const cur = P.vel.x * wx + P.vel.z * wz;
  const add = Math.min(wish, 0.8) - cur;
  if (add <= 0) return;
  const a = Math.min(accel * wish * dt, add);
  P.vel.x += a * wx;
  P.vel.z += a * wz;
}

function updateLocal(dt, now) {
  const k = input.keys;
  const frozen = S.phase === 'freeze' || chatOpen || act.kind !== null;
  let fx2 = 0, fz = 0;
  if (!frozen) {
    if (k.KeyW) fz += 1;
    if (k.KeyS) fz -= 1;
    if (k.KeyD) fx2 += 1;
    if (k.KeyA) fx2 -= 1;
  }
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let wx = -sin * fz + cos * fx2, wz = -cos * fz - sin * fx2;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  const wantCrouch = !chatOpen && (k.KeyC || k.ControlLeft || k.ControlRight);
  if (wantCrouch) P.crouch = Math.min(1, P.crouch + dt * 7);
  else if (P.crouch > 0) {
    const nc = Math.max(0, P.crouch - dt * 7);
    if (!boxHit(MAP.boxes, P.pos.x, P.pos.y, P.pos.z, PLAYER_HW, STAND_H - (STAND_H - CROUCH_H) * nc)) P.crouch = nc;
  }
  const height = STAND_H - (STAND_H - CROUCH_H) * P.crouch;

  const wdef = WEAPONS[W.cur] || WEAPONS.knife;
  let maxSp = wdef.speed;
  if (W.scope > 0) maxSp *= 0.72;
  if (k.ShiftLeft || k.ShiftRight) maxSp *= 0.52;
  if (P.crouch > 0.5) maxSp *= 0.36;
  const wish = wl > 0 ? maxSp : 0;

  if (P.onGround) {
    const sp = Math.hypot(P.vel.x, P.vel.z);
    if (sp > 1e-4) {
      const ns = Math.max(0, sp - Math.max(sp, 1.9) * 5 * dt);
      P.vel.x *= ns / sp;
      P.vel.z *= ns / sp;
    }
    accelerate(wx, wz, wish, 6, dt);
    if (!frozen && now - input.jumpAt < 150) { P.vel.y = JUMP_V; P.onGround = false; input.jumpAt = 0; }
  } else airAccelerate(wx, wz, wish, 12, dt);

  const wasGround = P.onGround, vy = P.vel.y;
  P.onGround = movePlayer(MAP.boxes, P.pos, P.vel, dt, height);
  if (P.onGround && !wasGround && vy < -6) sfx.land(Math.min(1, -vy / 14));

  const sp2 = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && sp2 > 4.2) {
    P.stepT -= dt;
    if (P.stepT <= 0) { P.stepT = 0.37; sfx.step(null, 0.3); }
  } else P.stepT = Math.min(P.stepT, 0.1);
}

// ---------------------------------------------------------------- Kamera ve izleyici
function pickSpec(dir = 1) {
  const list = [...remotes.values()].filter((r) => r.alive && r.model && r.snaps.length);
  const mates = list.filter((r) => r.team === S.team);
  const pool = (mates.length ? mates : list).sort((a, b) => a.id - b.id);
  if (!pool.length) return null;
  const i = pool.findIndex((r) => r.id === view.specId);
  return pool[(i + dir + pool.length) % pool.length];
}
function cycleSpec(dir) {
  if (view.deathAt && performance.now() - view.deathAt < 2600) return;
  const r = pickSpec(dir);
  view.specId = r ? r.id : 0;
}

let specR = null;
function updateCamera(dt, now) {
  let vmVisible = false;
  specR = null;
  if (S.joined && S.alive) {
    camera.position.set(P.pos.x, P.pos.y + eyeHeight(), P.pos.z);
    camera.rotation.set(P.pitch + P.punchP, P.yaw + P.punchY, 0);
    vmVisible = W.scope === 0;
  } else if (S.joined && (S.team === 'T' || S.team === 'CT')) {
    const since = now - view.deathAt;
    if (view.deathAt && since < 2600) {
      const f = Math.min(1, since / 500);
      camera.position.set(view.deathPos.x, view.deathPos.y + STAND_EYE - (STAND_EYE - 0.3) * f, view.deathPos.z);
      camera.rotation.set(view.deathPitch * (1 - f) - 0.25 * f, view.deathYaw, 0.5 * f);
    } else {
      specR = remotes.get(view.specId);
      if (!specR || !specR.alive) { specR = pickSpec(); view.specId = specR ? specR.id : 0; }
      if (specR) {
        camera.position.set(specR.x, specR.y + STAND_EYE - (STAND_EYE - CROUCH_EYE) * specR.crouch, specR.z);
        camera.rotation.set(specR.pitch, specR.yaw, 0);
        vmVisible = !!specR.w;
        if (vm.name !== specR.w || vm.team !== specR.team) vm.set(specR.w, specR.team, true);
        hud.spec(`İzleniyor: <b>${esc(specR.name)}</b> · sonraki oyuncu için tıkla`);
      } else {
        const t = now * 0.00004;
        camera.position.set(Math.sin(t) * 30, 34, Math.cos(t) * 26);
        camera.lookAt(0, 0, 0);
        hud.spec(S.phase === 'warmup' ? 'Yeniden doğuluyor…' : 'Sonraki raundu bekle');
      }
    }
  } else {
    const t = now * 0.00004;
    camera.position.set(Math.sin(t) * 38, 30, Math.cos(t) * 30);
    camera.lookAt(0, 0, 0);
  }
  if (view.shake > 0.002) {
    camera.rotation.x += (Math.random() - 0.5) * view.shake * 0.06;
    camera.rotation.y += (Math.random() - 0.5) * view.shake * 0.06;
    view.shake *= Math.exp(-dt * 4);
  }
  for (const r of remotes.values()) if (r.model) r.model.group.visible = (r.alive || r.dead) && r !== specR;
  return vmVisible;
}

// ---------------------------------------------------------------- Arayüz
function canBuyHere(now) {
  if (!S.alive) return false;
  if (S.phase === 'warmup') return true;
  if (S.phase !== 'freeze' && S.phase !== 'live') return false;
  return now < S.buyEnd && inBuyZone(S.team, P.pos.x, P.pos.z);
}
function buyCtx() {
  return { team: S.team, money: S.money, inv: S.inv, armor: S.armor, helmet: S.helmet, kit: S.kit, onBuy: (item) => send({ t: 'buy', item }) };
}
function openBuy() {
  if (!S.alive) return;
  const now = performance.now();
  if (!canBuyHere(now)) {
    hud.note(S.phase !== 'warmup' && now >= S.buyEnd ? 'Satın alma süresi doldu' : 'Satın alma alanında değilsin (doğuş noktasına dön)');
    return;
  }
  hud.openBuy(buyCtx());
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  hud.closeBuy();
  requestLock();
}
function showScoreboard() {
  hud.scoreboard(true, { roster: [...S.roster.values()], myId: S.myId, score: S.score, round: S.round, bombCarrier: S.bomb?.carrier, myTeam: S.team });
}

const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function updateHUD(now, dt) {
  if (!S.joined) return;
  const left = Math.max(0, S.phaseEnd - now);
  let txt, label, danger = false;
  if (S.phase === 'warmup') { label = 'ISINMA'; txt = S.phaseEnd ? fmt(left) : '--:--'; }
  else if (S.phase === 'live' && S.bomb?.state === 'planted') { label = 'BOMBA'; txt = fmt(Math.max(0, S.bombExplodeAt - now)); danger = true; }
  else {
    label = S.phase === 'freeze' ? 'HAZIRLIK' : S.phase === 'over' ? 'RAUND SONU' : S.phase === 'gameover' ? 'MAÇ SONU' : `RAUND ${S.round}`;
    txt = fmt(left);
    danger = S.phase === 'live' && left < 10000;
  }
  hud.setTimer(txt, danger, label);
  hud.setHP(S.alive ? S.hp : 0);
  hud.setArmor(S.alive ? S.armor : 0);
  hud.setMoney(S.money);

  const w = WEAPONS[W.cur];
  if (S.alive && w) {
    if (w.mag) { const a = W.ammo[W.cur] || { mag: 0, res: 0 }; hud.setAmmo(String(a.mag), String(a.res)); }
    else if (w.nade) hud.setAmmo(String(S.inv.nades[W.cur] || 0), null);
    else hud.setAmmo('', null);
    hud.setWeapon(W.reloadEnd ? `${w.name} — şarjör değişiyor` : w.name);
  } else { hud.setAmmo('', null); hud.setWeapon(''); }
  hud.icons({ buy: canBuyHere(now), bomb: hasBomb(), kit: S.alive && S.kit, helmet: S.alive && S.helmet });
  const spread = S.alive ? currentSpread(w) : 0;
  hud.crosshair(4 + spread * 420, S.alive ? W.scope === 0 && !(w && w.scope) : !!specR);
  hud.scope(S.alive && W.scope > 0);
  view.hurt = Math.max(0, view.hurt - dt * 1.5);
  hud.hurt(view.hurt);
  hud.flash(blindLevel(now));

  const mates = [];
  for (const r of remotes.values()) if (r.alive && r.team === S.team && r.snaps.length) mates.push({ x: r.x, z: r.z });
  let bomb = null;
  const b = S.bomb;
  if (b && S.team === 'T') {
    if (b.state === 'carried' && b.carrier !== S.myId) { const c = remotes.get(b.carrier); if (c) bomb = { x: c.x, z: c.z }; }
    else if (b.pos && (b.state === 'dropped' || b.state === 'planted')) bomb = { x: b.pos[0], z: b.pos[2], planted: b.state === 'planted' };
  }
  const rx = S.alive ? P.pos.x : camera.position.x, rz = S.alive ? P.pos.z : camera.position.z;
  hud.drawRadar({ x: rx, z: rz, yaw: S.alive ? P.yaw : specR ? specR.yaw : 0, mates, bomb, team: S.team });

  if (now - view.aimCheck > 120) {
    view.aimCheck = now;
    let text = '', col = '';
    if (S.alive) {
      const o = eyePos();
      const d = dirFrom(P.yaw + P.punchY, P.pitch + P.punchP);
      const wallT = raycastWorld(MAP.boxes, [o.x, o.y, o.z], [d.x, d.y, d.z], 80).t;
      let best = null;
      for (const r of remotes.values()) {
        for (const hb of r.hitboxes) {
          const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, hb.min, hb.max);
          if (h && h.t < wallT && (!best || h.t < best.t)) best = { t: h.t, r };
        }
      }
      if (best) {
        const mate = best.r.team === S.team;
        text = `${mate ? 'Takım' : 'Düşman'}: ${best.r.name}`;
        col = mate ? '#7dff7d' : '#ff5a4a';
      }
    }
    hud.enemyName(text, col);
  }
}

function updateBombBeep(now) {
  const b = S.bomb;
  if (b && b.state === 'planted' && S.phase === 'live') {
    if (now >= view.nextBeep) {
      view.nextBeep = now + clamp((S.bombExplodeAt - now) / 40, 90, 1000);
      sfx.beep(bombModel.position);
      bombLed.visible = true;
      view.ledOff = now + 90;
    }
    if (now > view.ledOff) bombLed.visible = false;
  } else bombLed.visible = false;
}

// ---------------------------------------------------------------- Girdi
function requestLock() {
  const plain = () => {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* yok say */ }
  };
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(plain);
  } catch {
    plain();
  }
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) hud.showPause(false);
  else {
    input.mouseL = input.mouseR = false;
    if (S.joined && !hud.buyOpen && !chatOpen && !menuOpen) hud.showPause(true);
  }
});
document.addEventListener('pointerlockerror', () => { if (S.joined && !hud.buyOpen && !menuOpen) hud.showPause(true); });

canvas.addEventListener('mousedown', (e) => {
  sfx.init();
  if (!S.joined) return;
  if (!locked) { requestLock(); return; }
  if (e.button === 0) { input.mouseL = true; input.lPressed = true; if (!S.alive) cycleSpec(1); }
  if (e.button === 2) { input.mouseR = true; input.rPressed = true; if (!S.alive) cycleSpec(-1); }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouseL = false;
  if (e.button === 2) input.mouseR = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (!locked || !S.alive || hud.buyOpen) return;
  const k = view.settings.sens * 0.0011 * (camera.fov / BASE_FOV);
  P.yaw -= e.movementX * k;
  P.pitch = clamp(P.pitch - e.movementY * k, -1.55, 1.55);
  vm.look(e.movementX, e.movementY);
});
window.addEventListener('wheel', (e) => { if (locked && S.alive) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

const nameInput = document.getElementById('nameInput');
function digitOf(code) {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  return m ? Number(m[1]) : null;
}

window.addEventListener('keydown', (e) => {
  if (document.activeElement === nameInput) return;
  if (chatOpen) {
    if (e.code === 'Enter') {
      const text = hud.closeChat().trim();
      chatOpen = false;
      if (text) send({ t: 'chat', text, tm: chatTeam });
      requestLock();
    } else if (e.code === 'Escape') {
      hud.closeChat();
      chatOpen = false;
      if (!document.pointerLockElement) hud.showPause(true);
    }
    return;
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    if (!input.keys.Tab) { input.keys.Tab = true; showScoreboard(); }
    return;
  }
  if (!S.joined) return;
  if (menuOpen) { if (e.code === 'Escape' || e.code === 'KeyM') closeTeamMenu(); return; }
  if (hud.buyOpen) {
    const d = digitOf(e.code);
    if (d !== null) { hud.buyKey(d); e.preventDefault(); }
    else if (e.code === 'KeyB' || e.code === 'Escape') closeBuy();
    else input.keys[e.code] = true;
    return;
  }
  input.keys[e.code] = true;
  if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
  if (e.repeat) return;
  const d = digitOf(e.code);
  if (d !== null && d >= 1 && d <= 5) { selectSlot(d); return; }
  switch (e.code) {
    case 'Space': input.jumpAt = performance.now(); e.preventDefault(); break;
    case 'KeyQ': if (S.alive && W.last && owns(W.last)) switchWeapon(W.last); break;
    case 'KeyR': startReload(); break;
    case 'KeyB': openBuy(); break;
    case 'KeyG': dropWeapon(); break;
    case 'KeyY': e.preventDefault(); chatOpen = true; chatTeam = false; hud.openChat(false); break;
    case 'KeyU': e.preventDefault(); chatOpen = true; chatTeam = true; hud.openChat(true); break;
    case 'KeyM': openTeamMenu(); break;
  }
});
window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
  if (e.code === 'Tab') { e.preventDefault(); hud.scoreboard(false); }
});
window.addEventListener('blur', () => {
  for (const k in input.keys) input.keys[k] = false;
  input.mouseL = input.mouseR = false;
  hud.scoreboard(false);
});

// ---------------------------------------------------------------- Menüler
nameInput.value = view.settings.name;
for (const btn of document.querySelectorAll('[data-team]')) {
  btn.addEventListener('click', () => {
    sfx.init();
    sfx.setVolume(view.settings.vol);
    if (!ws || ws.readyState !== 1) { hud.menuStatus('Sunucuya bağlı değil, bekle…'); return; }
    const team = btn.dataset.team;
    view.settings.name = nameInput.value.trim().slice(0, 16);
    saveSettings();
    if (!S.joined) send({ t: 'join', name: view.settings.name, team });
    else send({ t: 'team', team });
    S.joined = true;
    menuOpen = false;
    hud.showMenu(false);
    hud.setVisible(true);
    requestLock();
  });
}
function openTeamMenu() {
  menuOpen = true;
  hud.showPause(false);
  hud.showMenu(true);
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeTeamMenu() {
  menuOpen = false;
  hud.showMenu(false);
  requestLock();
}

const sensEl = document.getElementById('sens'), volEl = document.getElementById('vol');
sensEl.value = view.settings.sens;
volEl.value = view.settings.vol;
document.getElementById('sensVal').textContent = Number(view.settings.sens).toFixed(1);
sensEl.addEventListener('input', () => {
  view.settings.sens = Number(sensEl.value);
  document.getElementById('sensVal').textContent = view.settings.sens.toFixed(1);
  saveSettings();
});
volEl.addEventListener('input', () => { view.settings.vol = Number(volEl.value); sfx.setVolume(view.settings.vol); saveSettings(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfx.init(); requestLock(); });
document.getElementById('teamBtn').addEventListener('click', openTeamMenu);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
});

setInterval(() => send({ t: 'ping', ts: performance.now(), rtt: S.rtt }), 2000);

// ---------------------------------------------------------------- Döngü
const tmpF = new THREE.Vector3(), tmpUp = new THREE.Vector3();
let last = performance.now(), lastSend = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (S.joined && S.alive) { updateLocal(dt, now); updateAction(now); }
  else { hud.hint(''); hud.progress(null); }
  updateWeapon(dt, now);
  input.lPressed = input.rPressed = false;

  if (S.alive && now - lastSend > 33) {
    lastSend = now;
    send({ t: 'st', s: S.sid, p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], y: r3(P.yaw), x: r3(P.pitch), c: r2(P.crouch), w: W.cur });
  }

  updateRemotes(dt, now);
  updateBombBeep(now);
  fx.update(dt, (p) => sfx.nadeBounce(p));
  const vmVisible = updateCamera(dt, now);

  const w = WEAPONS[W.cur];
  const fov = S.alive && W.scope > 0 && w?.zoom ? w.zoom[W.scope - 1] : BASE_FOV;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const speed = S.alive ? Math.hypot(P.vel.x, P.vel.z) : specR ? specR.speed : 0;
  vm.update(dt, speed, S.alive ? P.onGround : true, vmVisible);
  world.update(camera);

  tmpF.set(0, 0, -1).applyQuaternion(camera.quaternion);
  tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  sfx.setListener(camera.position, tmpF, tmpUp);

  updateHUD(now, dt);
  if (hud.buyOpen && !canBuyHere(now)) { hud.closeBuy(); if (!locked) hud.showPause(true); }

  renderer.clear();
  renderer.render(scene, camera);
  if (vmVisible) {
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }
}

connect();
requestAnimationFrame(frame);

// Hata ayıklama için konsoldan erişim
window.__dust = { S, P, W, remotes, send, switchWeapon, fireGun, trace, hud, fx, camera, scene, vm, vmScene, renderer };
