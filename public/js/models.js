// Kutulardan yapılmış low-poly modeller: silahlar, oyuncular ve birinci şahıs silah görünümü (viewmodel).
import * as THREE from 'three';

const matCache = new Map();
function mat(color, rough = 0.7, metal = 0.1) {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); matCache.set(key, m); }
  return m;
}
const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0) {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  return mesh;
}
function cyl(r, len, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}
// Şarjör parçalarını işaretler (uzun şarjör eklentisi bunları büyütür)
function mag(m) { m.userData.mag = true; return m; }
function limb(from, to, w, m) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const mesh = new THREE.Mesh(boxGeo(w, w, a.distanceTo(b)), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  return mesh;
}

// Ortam haritası olmadığı için metaliklik düşük tutuldu (yüksek metal = simsiyah görünür)
const COL = {
  gun: mat(0x3a3c3f, 0.45, 0.25), gun2: mat(0x55585c, 0.5, 0.2), black: mat(0x232323, 0.6, 0.15),
  wood: mat(0x8a5428, 0.7, 0), woodDark: mat(0x613a1c, 0.7, 0), silver: mat(0xb8bdc3, 0.35, 0.3),
  green: mat(0x56683f, 0.7, 0.05), olive: mat(0x6a743f, 0.6, 0.05), tan: mat(0xb39c66, 0.8, 0),
  blade: mat(0xd5dadf, 0.25, 0.35), grey: mat(0x9a9ea3, 0.5, 0.2), white: mat(0xd8d8d0, 0.6, 0.05),
  red: mat(0xa02020, 0.5, 0.1), screen: new THREE.MeshBasicMaterial({ color: 0x55ff66 }),
};

// Silah modelleri: kabza (sağ el) orijinde, namlu -Z yönünde
export function createWeaponModel(name, atts = [], opts = {}) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  let left = null, kind = 'rifle';
  const add = (...m) => m.forEach((x) => g.add(x));
  switch (name) {
    case 'ak47':
    case 'galil': {
      const metal = name === 'ak47' ? COL.gun : COL.gun2;
      const wood = name === 'ak47' ? COL.wood : COL.black;
      add(box(0.06, 0.08, 0.4, metal, 0, 0.05, -0.12),
        box(0.066, 0.066, 0.2, wood, 0, 0.045, -0.4),
        box(0.028, 0.028, 0.3, metal, 0, 0.062, -0.6),
        box(0.024, 0.024, 0.22, metal, 0, 0.095, -0.42),
        box(0.012, 0.05, 0.012, metal, 0, 0.1, -0.72),
        box(0.05, 0.1, 0.3, wood, 0, 0.02, 0.22, 0.12),
        box(0.04, 0.11, 0.05, wood, 0, -0.04, 0.02, 0.35),
        mag(box(0.045, 0.18, 0.07, name === 'ak47' ? COL.gun : COL.gun2, 0, -0.07, -0.17, -0.35)));
      muzzle.position.set(0, 0.062, -0.76);
      left = [0, 0.0, -0.4];
      break;
    }
    case 'm4a1': {
      add(box(0.06, 0.085, 0.36, COL.black, 0, 0.05, -0.1),
        box(0.02, 0.035, 0.16, COL.black, 0, 0.11, -0.08),
        box(0.012, 0.06, 0.012, COL.black, 0, 0.1, -0.42),
        box(0.07, 0.07, 0.22, COL.gun2, 0, 0.045, -0.38),
        box(0.024, 0.024, 0.18, COL.black, 0, 0.05, -0.58),
        cyl(0.022, 0.2, COL.black, 0, 0.05, -0.76),
        box(0.05, 0.09, 0.24, COL.black, 0, 0.03, 0.22),
        box(0.04, 0.11, 0.05, COL.black, 0, -0.04, 0.02, 0.3),
        mag(box(0.045, 0.16, 0.065, COL.gun2, 0, -0.07, -0.15, -0.15)));
      muzzle.position.set(0, 0.05, -0.87);
      left = [0, 0.0, -0.36];
      break;
    }
    case 'famas': {
      add(box(0.065, 0.11, 0.62, COL.black, 0, 0.04, -0.15),
        box(0.025, 0.06, 0.4, COL.black, 0, 0.12, -0.2),
        box(0.024, 0.024, 0.14, COL.gun, 0, 0.05, -0.53),
        box(0.04, 0.11, 0.05, COL.black, 0, -0.05, -0.08, 0.3),
        mag(box(0.045, 0.14, 0.06, COL.gun2, 0, -0.06, 0.06, -0.1)));
      muzzle.position.set(0, 0.05, -0.61);
      left = [0, -0.02, -0.33];
      break;
    }
    case 'mp5':
    case 'p90': {
      if (name === 'mp5') {
        add(box(0.055, 0.08, 0.3, COL.black, 0, 0.05, -0.08),
          box(0.06, 0.065, 0.14, COL.gun2, 0, 0.04, -0.3),
          box(0.022, 0.022, 0.08, COL.black, 0, 0.05, -0.41),
          mag(box(0.035, 0.16, 0.05, COL.gun, 0, -0.07, -0.16, -0.25)),
          box(0.04, 0.05, 0.2, COL.black, 0, 0.04, 0.17),
          box(0.04, 0.1, 0.05, COL.black, 0, -0.04, 0.02, 0.3));
        muzzle.position.set(0, 0.05, -0.46);
        left = [0, 0.0, -0.3];
      } else {
        add(box(0.07, 0.1, 0.45, COL.gun2, 0, 0.03, -0.12),
          mag(box(0.05, 0.03, 0.35, COL.black, 0, 0.095, -0.15)),
          box(0.022, 0.022, 0.06, COL.black, 0, 0.04, -0.37),
          box(0.04, 0.09, 0.05, COL.gun2, 0, -0.04, -0.02, 0.2));
        muzzle.position.set(0, 0.04, -0.41);
        left = [0, -0.03, -0.26];
      }
      break;
    }
    case 'awp':
    case 'scout': {
      const body = name === 'awp' ? COL.green : COL.black;
      add(box(0.07, 0.09, 0.6, body, 0, 0.035, -0.1),
        box(0.028, 0.028, name === 'awp' ? 0.5 : 0.42, COL.gun, 0, 0.055, name === 'awp' ? -0.65 : -0.61),
        cyl(0.03, 0.3, COL.black, 0, 0.13, -0.08),
        cyl(0.036, 0.04, COL.black, 0, 0.13, -0.24),
        box(0.02, 0.04, 0.02, COL.black, 0, 0.09, -0.15),
        box(0.02, 0.04, 0.02, COL.black, 0, 0.09, 0.0),
        box(0.06, 0.13, 0.3, body, 0, 0.0, 0.3),
        box(0.04, 0.1, 0.05, body, 0, -0.04, 0.03, 0.3),
        mag(box(0.05, 0.07, 0.08, COL.gun, 0, -0.03, -0.14)),
        box(0.07, 0.015, 0.015, COL.silver, 0.04, 0.06, 0.06));
      muzzle.position.set(0, 0.055, name === 'awp' ? -0.9 : -0.82);
      left = [0, -0.01, -0.38];
      break;
    }
    case 'glock':
    case 'usp':
    case 'deagle': {
      kind = 'pistol';
      const slideMat = name === 'deagle' ? COL.silver : name === 'usp' ? COL.gun2 : COL.gun;
      const len = name === 'deagle' ? 0.24 : name === 'usp' ? 0.21 : 0.18;
      const hh = name === 'deagle' ? 0.06 : 0.045;
      add(box(0.034, hh, len, slideMat, 0, 0.04, -len / 2 + 0.04),
        box(0.032, 0.12, 0.055, name === 'deagle' ? COL.black : COL.gun, 0, -0.03, 0.0, 0.22),
        box(0.008, 0.02, 0.02, COL.black, 0, 0.02, -0.04));
      muzzle.position.set(0, 0.045, -len + 0.03);
      left = [-0.02, -0.04, 0.02];
      break;
    }
    case 'knife': {
      kind = 'knife';
      add(box(0.026, 0.03, 0.11, COL.black, 0, 0, 0.02),
        box(0.05, 0.012, 0.012, COL.grey, 0, 0, -0.04),
        box(0.006, 0.036, 0.2, COL.blade, 0, 0.004, -0.15),
        box(0.006, 0.02, 0.05, COL.blade, 0, 0.014, -0.265));
      muzzle.position.set(0, 0, -0.25);
      break;
    }
    case 'he':
    case 'flash':
    case 'smoke': {
      kind = 'nade';
      const body = name === 'he' ? COL.olive : name === 'flash' ? COL.white : COL.grey;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.1, 12), body);
      m.position.set(0, 0.03, -0.03);
      add(m, box(0.02, 0.03, 0.02, COL.gun2, 0, 0.095, -0.03), box(0.012, 0.09, 0.02, COL.grey, 0.03, 0.05, -0.03));
      if (name === 'smoke') add(box(0.071, 0.015, 0.071, COL.red, 0, 0.05, -0.03));
      muzzle.position.set(0, 0.05, -0.05);
      break;
    }
    case 'bomb': {
      kind = 'bomb';
      add(box(0.24, 0.07, 0.15, COL.tan, 0, 0, 0),
        box(0.07, 0.075, 0.14, mat(0x6b5536), -0.06, 0.005, 0),
        box(0.07, 0.075, 0.14, mat(0x6b5536), 0.06, 0.005, 0),
        box(0.1, 0.02, 0.06, COL.black, 0, 0.045, 0.02),
        box(0.06, 0.005, 0.02, COL.screen, 0, 0.056, -0.0));
      muzzle.position.set(0, 0.06, 0);
      break;
    }
    default:
      add(box(0.05, 0.08, 0.4, COL.gun, 0, 0.04, -0.15));
      muzzle.position.set(0, 0.04, -0.36);
  }
  const leftV = left ? new THREE.Vector3(...left) : null;
  applyAttachments(g, name, kind, atts, muzzle, leftV);
  // Birinci şahısta dipçik kameraya çok yakın kalıp ekranı kapatıyor; çıkar
  if (opts.fp && kind === 'rifle') for (const c of [...g.children]) if (c.isMesh && c.position.z > 0.12) g.remove(c);
  mergeChildren(g);
  g.userData = { muzzle, left: leftV, kind, name };
  return g;
}

// ---------------------------------------------------------------- Eklentiler
const RAIL = { ak47: 0.095, galil: 0.095, m4a1: 0.135, famas: 0.155, mp5: 0.095, p90: 0.115 };
const ATT_MAT = mat(0x1c1d1f, 0.45, 0.35);
function applyAttachments(g, name, kind, atts, muzzle, left) {
  if (!atts || !atts.length) return;
  if (atts.includes('sil')) {
    const pistol = kind === 'pistol';
    const r = pistol ? 0.017 : 0.024, len = pistol ? 0.12 : 0.2;
    g.add(cyl(r, len, ATT_MAT, muzzle.position.x, muzzle.position.y, muzzle.position.z - len / 2 + 0.01));
    muzzle.position.z -= len;
  }
  if (atts.includes('dot') && RAIL[name] !== undefined) {
    const y = RAIL[name];
    g.add(box(0.03, 0.016, 0.07, ATT_MAT, 0, y + 0.008, -0.1));      // ray tabanı
    g.add(box(0.036, 0.006, 0.012, ATT_MAT, 0, y + 0.05, -0.12));    // çerçeve üst
    g.add(box(0.006, 0.034, 0.012, ATT_MAT, -0.015, y + 0.033, -0.12));
    g.add(box(0.006, 0.034, 0.012, ATT_MAT, 0.015, y + 0.033, -0.12));
  }
  if (atts.includes('mag')) {
    const mags = g.children.filter((c) => c.userData.mag);
    for (const m of mags) { m.scale.y = 1.55; m.position.y -= 0.035; }
    if (!mags.length) g.add(box(0.03, 0.045, 0.05, COL.black, 0, -0.105, 0.015, 0.22)); // tabanca: uzatılmış şarjör tabanı
  }
  if (atts.includes('grip') && left) g.add(box(0.03, 0.085, 0.035, ATT_MAT, 0, left.y - 0.065, left.z + 0.02));
}

// ---------------------------------------------------------------- Mesh birleştirme
// Bir grubun doğrudan çocuk mesh'lerini köşe renkli tek bir mesh'e birleştirir: çizim çağrısı sayısı düşer
const MERGED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.12 });
function mergeChildren(group) {
  const meshes = group.children.filter((c) => c.isMesh && !c.userData.keep && c.material.isMeshStandardMaterial);
  if (meshes.length < 2) return;
  const pos = [], nor = [], col = [], idx = [];
  let base = 0;
  for (const m of meshes) {
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    const p = geo.attributes.position, n = geo.attributes.normal;
    const c = m.material.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(geo.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
    geo.dispose();
    group.remove(m);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  merged.setIndex(idx);
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, MERGED_MAT);
  mesh.userData.merged = true;
  group.add(mesh);
}

function createArms(kind, team, left) {
  const g = new THREE.Group();
  const sleeve = mat(team === 'T' ? 0x5e4a30 : 0x2f3c52, 0.9, 0);
  const glove = mat(team === 'T' ? 0x2b2620 : 0x1a1a1a, 0.8, 0);
  if (kind === 'bomb') {
    g.add(box(0.08, 0.06, 0.1, glove, -0.14, 0.0, 0.0), box(0.08, 0.06, 0.1, glove, 0.14, 0.0, 0.0));
    g.add(limb([-0.14, -0.01, 0.04], [-0.24, -0.2, 0.35], 0.09, sleeve));
    g.add(limb([0.14, -0.01, 0.04], [0.24, -0.2, 0.35], 0.09, sleeve));
    mergeChildren(g);
    return g;
  }
  g.add(box(0.07, 0.07, 0.1, glove, 0, -0.035, 0.03));
  g.add(limb([0.0, -0.05, 0.07], [0.08, -0.22, 0.42], 0.085, sleeve));
  if (kind === 'rifle' && left) {
    g.add(box(0.07, 0.06, 0.1, glove, left.x - 0.01, left.y - 0.03, left.z));
    g.add(limb([left.x - 0.02, left.y - 0.05, left.z + 0.03], [-0.2, -0.24, 0.12], 0.085, sleeve));
  } else if (kind === 'pistol') {
    g.add(box(0.06, 0.06, 0.09, glove, -0.035, -0.05, 0.04));
    g.add(limb([-0.04, -0.06, 0.07], [-0.17, -0.25, 0.4], 0.085, sleeve));
  }
  mergeChildren(g);
  return g;
}

function makeFlashTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,230,1)');
  gr.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  g.translate(32, 32);
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -32); g.lineTo(5, 0); g.fill();
  }
  g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const FLASH_TEX = makeFlashTex();

// ---------------------------------------------------------------- Birinci şahıs görünüm
const VM_POSE = {
  rifle: { pos: [0.14, -0.16, -0.52], rot: [0, 0.045, 0] },
  pistol: { pos: [0.13, -0.15, -0.43], rot: [0, 0.03, 0] },
  knife: { pos: [0.19, -0.2, -0.42], rot: [0.35, 0.15, -0.2] },
  nade: { pos: [0.15, -0.17, -0.36], rot: [0.1, 0, 0] },
  bomb: { pos: [0.0, -0.21, -0.42], rot: [0.55, 0, 0] },
};
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class Viewmodel {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.model = null; this.kind = 'knife'; this.name = null; this.team = null;
    this.bobT = 0; this.kickV = 0; this.swayX = 0; this.swayY = 0;
    this.drawT = 1; this.reloadT = -1; this.reloadDur = 1; this.swingT = -1; this.swingAlt = false; this.throwT = -1;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH_TEX, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.flashT = 0;
    this.ads = false; this.adsT = 0; this.rail = null;
  }

  set(name, team, instant = false, atts = []) {
    const key = (atts || []).join(',');
    if (this.name === name && this.team === team && this.attKey === key && this.model) { if (!instant) this.drawT = 0; return; }
    if (this.model) this.root.remove(this.model);
    this.name = name; this.team = team; this.attKey = key;
    this.model = null;
    if (!name) return;
    const g = new THREE.Group();
    const w = createWeaponModel(name, atts, { fp: true });
    g.add(w);
    g.add(createArms(w.userData.kind, team, w.userData.left));
    this.kind = w.userData.kind;
    this.rail = atts.includes('dot') && RAIL[name] !== undefined ? RAIL[name] : null;
    w.userData.muzzle.add(this.flash);
    this.model = g;
    this.root.add(g);
    this.drawT = instant ? 1 : 0;
    this.reloadT = -1; this.swingT = -1; this.throwT = -1;
  }

  kick(amount = 1, flash = true) {
    this.kickV = Math.min(1.6, this.kickV + amount);
    if (flash && (this.kind === 'rifle' || this.kind === 'pistol')) {
      this.flash.visible = true;
      this.flashT = 0.045;
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.scale.setScalar(0.12 + Math.random() * 0.08);
    }
  }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  swing(alt) { this.swingT = 0; this.swingAlt = alt; }
  throwAnim() { this.throwT = 0; }
  look(dx, dy) {
    this.swayX = Math.max(-40, Math.min(40, this.swayX + dx));
    this.swayY = Math.max(-40, Math.min(40, this.swayY + dy));
  }

  update(dt, speed, onGround, visible) {
    if (!this.model) return;
    this.model.visible = visible;
    const pose = VM_POSE[this.kind] || VM_POSE.rifle;
    let [x, y, z] = pose.pos;
    let [rx, ry, rz] = pose.rot;
    this.adsT += ((this.ads && this.rail !== null ? 1 : 0) - this.adsT) * Math.min(1, dt * 12);
    const sp = (onGround ? Math.min(1, speed / 6) : 0) * (1 - this.adsT * 0.8);
    this.bobT += dt * (2 + speed * 1.5);
    x += Math.sin(this.bobT) * 0.013 * sp;
    y -= Math.abs(Math.cos(this.bobT)) * 0.012 * sp;
    if (!onGround) y += 0.01;
    const decay = Math.exp(-dt * 9);
    this.swayX *= decay; this.swayY *= decay;
    x -= this.swayX * 0.0005; y += this.swayY * 0.0005; ry -= this.swayX * 0.001;
    this.kickV = Math.max(0, this.kickV - dt * 9);
    z += this.kickV * 0.05; rx += this.kickV * 0.09;
    if (this.drawT < 1) {
      this.drawT = Math.min(1, this.drawT + dt * 2.6);
      const k = 1 - easeOut(this.drawT);
      y -= k * 0.22; rx -= k * 0.9;
    }
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      if (this.reloadT >= 1) this.reloadT = -1;
      else { const k = Math.sin(Math.min(1, this.reloadT * 1.1) * Math.PI); rx -= k * 0.45; y -= k * 0.07; rz += k * 0.45; }
    }
    if (this.swingT >= 0) {
      this.swingT += dt * (this.swingAlt ? 2.4 : 3.6);
      if (this.swingT >= 1) this.swingT = -1;
      else {
        const k = Math.sin(this.swingT * Math.PI);
        if (this.swingAlt) { z -= k * 0.16; rx -= k * 0.5; }
        else { ry += k * 1.1; x -= k * 0.14; rz -= k * 0.6; }
      }
    }
    if (this.throwT >= 0) {
      this.throwT += dt * 2.6;
      if (this.throwT >= 1) this.throwT = -1;
      else { const k = Math.sin(this.throwT * Math.PI); y += k * 0.08; z -= k * 0.22; rx += k * 1.2; }
    }
    if (this.adsT > 0.002) {
      // Nişan alırken kırmızı noktanın çerçevesi ekran merkezine hizalanır
      const a = this.adsT, ty = -(this.rail + 0.033);
      x += (0 - x) * a; y += (ty - y) * a; z += (-0.37 - z) * a;
      rx *= 1 - a; ry *= 1 - a; rz *= 1 - a;
    }
    this.model.position.set(x, y, z);
    this.model.rotation.set(rx, ry, rz);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
  }
}

// ---------------------------------------------------------------- Oyuncu modeli
export function makeNameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.33, 1);
  return s;
}

export function createPlayerModel(team) {
  const isT = team === 'T';
  const shirt = mat(isT ? 0x6e5434 : 0x34445e, 0.9, 0);
  const pants = mat(isT ? 0x4d4636 : 0x283244, 0.9, 0);
  const vest = mat(isT ? 0x3b3326 : 0x1f2733, 0.8, 0.05);
  const skin = mat(0xc8956a, 0.8, 0);
  const boot = mat(0x1e1a16, 0.8, 0);
  const headgear = mat(isT ? 0x2b2620 : 0x26301f, 0.7, 0.1);
  const glove = mat(0x1d1a17, 0.8, 0);

  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const legs = [];
  for (const sx of [-0.11, 0.11]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.85, 0);
    leg.add(box(0.17, 0.78, 0.2, pants, 0, -0.39, 0));
    leg.add(box(0.18, 0.12, 0.27, boot, 0, -0.79, -0.03));
    group.add(leg);
    legs.push(leg);
  }
  const upper = new THREE.Group();
  upper.position.y = 0.85;
  group.add(upper);
  upper.add(box(0.46, 0.62, 0.26, shirt, 0, 0.31, 0));
  upper.add(box(0.48, 0.36, 0.29, vest, 0, 0.37, 0));
  upper.add(box(0.47, 0.06, 0.28, mat(0x2a2218), 0, 0.03, 0));
  const head = new THREE.Group();
  head.position.y = 0.62;
  upper.add(head);
  head.add(box(0.24, 0.26, 0.25, skin, 0, 0.14, 0));
  if (isT) {
    head.add(box(0.26, 0.09, 0.27, headgear, 0, 0.255, 0));
    head.add(box(0.25, 0.11, 0.03, mat(0x3a3128), 0, 0.07, -0.125));
  } else {
    head.add(box(0.29, 0.12, 0.3, headgear, 0, 0.26, 0.005));
    head.add(box(0.22, 0.05, 0.03, mat(0x111111, 0.3, 0.5), 0, 0.17, -0.13));
  }
  const aim = new THREE.Group();
  aim.position.set(0, 0.55, 0);
  upper.add(aim);
  aim.add(limb([0.25, 0, 0.02], [0.08, -0.12, -0.33], 0.1, shirt));
  aim.add(limb([-0.25, 0, 0.02], [-0.02, -0.08, -0.5], 0.1, shirt));
  aim.add(box(0.08, 0.08, 0.08, glove, 0.08, -0.12, -0.35));
  aim.add(box(0.08, 0.08, 0.08, glove, -0.01, -0.08, -0.52));
  const weaponSlot = new THREE.Group();
  weaponSlot.position.set(0.06, -0.1, -0.36);
  aim.add(weaponSlot);
  // Parçaları birleştir: oyuncu başına ~5 çizim çağrısı (32 kişilik odada önemli)
  for (const part of [...legs, upper, head, aim]) mergeChildren(part);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const model = {
    group, legs, upper, aim, head, weaponSlot, weapon: null,
    setWeapon(name, atts = []) {
      if (model.weapon) weaponSlot.remove(model.weapon);
      model.weapon = null;
      if (!name) return;
      const w = createWeaponModel(name, atts);
      w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      if (w.userData.kind === 'bomb') w.position.set(-0.05, 0, 0.05);
      weaponSlot.add(w);
      model.weapon = w;
    },
  };
  return model;
}
