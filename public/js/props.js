// Haritadaki eşyalar (araba, minibüs, konteyner, varil, kum torbası, palmiye, gişe, bank) ve bina cepheleri
// (pencere, kepenk, kapı, denizlik, kaide, klima). Hepsi kodla üretilir; aynı malzemeli parçalar tek mesh'te
// birleştirilir. Cephe süsleri yalnızca görseldir (çarpışma kutusu yoktur), eşyaların kutuları haritadadır.
import * as THREE from 'three';
import { CELL } from '../shared/map.js';

// ---------------------------------------------------------------- Dokular
function tex(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function noise(g, s, amount) {
  const img = g.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
const woodTex = () => tex(256, (g, s) => {
  g.fillStyle = '#7a5434'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) {
    const l = 0.8 + Math.random() * 0.35;
    g.fillStyle = `rgb(${122 * l | 0},${84 * l | 0},${52 * l | 0})`; g.fillRect(i * s / 6 + 2, 0, s / 6 - 4, s);
    g.strokeStyle = 'rgba(40,25,10,0.25)';
    for (let k = 0; k < 5; k++) { const x = i * s / 6 + 4 + Math.random() * (s / 6 - 8); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 5, s * 0.3, x - 5, s * 0.7, x + 2, s); g.stroke(); }
  }
  noise(g, s, 18);
});
const corrugatedTex = () => tex(256, (g, s) => {
  for (let x = 0; x < s; x++) { const l = 0.75 + 0.3 * (0.5 + 0.5 * Math.sin((x / s) * Math.PI * 2 * 12)); g.fillStyle = `rgb(${255 * l | 0},${255 * l | 0},${255 * l | 0})`; g.fillRect(x, 0, 1, s); }
  for (let i = 0; i < 14; i++) { const gr = g.createRadialGradient(Math.random() * s, Math.random() * s, 0, Math.random() * s, Math.random() * s, 40 + Math.random() * 60); gr.addColorStop(0, 'rgba(120,70,30,0.35)'); gr.addColorStop(1, 'rgba(120,70,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
  noise(g, s, 14);
});
const fabricTex = () => tex(128, (g, s) => {
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 3) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 3) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 1, s); }
  noise(g, s, 20);
});
const barkTex = () => tex(128, (g, s) => {
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 10) { g.fillStyle = 'rgba(30,20,10,0.35)'; g.fillRect(0, y, s, 3); g.fillStyle = 'rgba(200,170,120,0.12)'; g.fillRect(0, y + 3, s, 2); }
  noise(g, s, 26);
});

// ---------------------------------------------------------------- Birleştirici
// Kutu ve hazır geometri parçalarını (dönüşümüyle) malzeme başına tek BufferGeometry'de toplar.
// Kutularda dünya koordinatlı UV (doku esnemez) ve köşe rengi (renk tonu + alta doğru hafif koyulaşma) üretilir.
class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, n, uvs, col) {
    const i = this.pos.length / 3;
    for (const v of [a, b, c, d]) this.pos.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) { this.nor.push(n[0], n[1], n[2]); this.col.push(col[0], col[1], col[2]); }
    for (const t of uvs) this.uv.push(t[0], t[1]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // Eksene hizalı kutu (dünya koordinatı). o: { scale: UV ölçeği (m), tint: [r,g,b], bottom: alt yüz de çizilsin }
  box(min, max, o = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max, s = 1 / (o.scale || 1), t = o.tint || [1, 1, 1];
    const sh = (k) => [t[0] * k, t[1] * k, t[2] * k];
    const side = sh(1), top = sh(1.04), bot = sh(0.7);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s]], side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]], side);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]], side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s]], side);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s]], top);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]], bot);
  }
  // Hazır geometri (silindir, küre...) matris ile eklenir
  geo(geometry, matrix, tint = [1, 1, 1], uvScale = 1) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const i0 = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(tint[0], tint[1], tint[2]);
      this.uv.push(u ? u.getX(i) * uvScale : 0, u ? u.getY(i) * uvScale : 0);
      this.idx.push(i0 + i);
    }
    g.dispose();
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const rnd = (a, b, k = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };

// ---------------------------------------------------------------- Eşya modelleri
const CAR_COLORS = [0x8f969c, 0xb7a37a, 0x5d7385, 0x7d3e2f, 0xd8d4c8, 0x52604a];
const SHUTTER_COLORS = [0x3d6f93, 0x4f7a4a, 0x2f7f80, 0x7a5232, 0x8c3b30, 0x5a6f8c];
const AWNING_COLORS = [0xb04a3a, 0x3f7a55, 0x3a5f8f, 0xd8c8a0, 0xc08a3a];

export function buildScenery(map, theme, opts = {}) {
  const T = { wood: woodTex(), corr: corrugatedTex(), fabric: fabricTex(), bark: barkTex() };
  const B = {
    paint: new Batch(), glass: new Batch(), rubber: new Batch(), metal: new Batch(), chrome: new Batch(),
    light: new Batch(), wood: new Batch(), corr: new Batch(), fabric: new Batch(), bark: new Batch(), leaf: new Batch(),
    stone: new Batch(), dark: new Batch(), plaster: new Batch(),
  };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  const cylGeoLo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const sphGeo = new THREE.SphereGeometry(1, 10, 7);
  const boxGeo1 = new THREE.BoxGeometry(1, 1, 1);
  // Eşyanın yerel koordinatındaki kutuyu (merkez, ölçü) dünyaya yerleştir (eşya y ekseninde 0 ya da 90 derece döner)
  const placer = (p) => {
    const rot = p.rot === 90;
    return {
      box(batch, cx, cy, cz, sx, sy, sz, o) {
        const [wx, wz] = rot ? [p.x + cz, p.z - cx] : [p.x + cx, p.z + cz];
        const [hx, hz] = rot ? [sz / 2, sx / 2] : [sx / 2, sz / 2];
        batch.box([wx - hx, p.y + cy - sy / 2, wz - hz], [wx + hx, p.y + cy + sy / 2, wz + hz], o);
      },
      // Silindir: ekseni yerel 'x' (tekerlek), 'y' (dik) ya da 'z'
      cyl(batch, cx, cy, cz, r, len, axis, tint, geo = cylGeo) {
        const [wx, wz] = rot ? [p.x + cz, p.z - cx] : [p.x + cx, p.z + cz];
        Q.identity();
        let a = axis;
        if (rot && a !== 'y') a = a === 'x' ? 'z' : 'x';
        if (a === 'x') Q.setFromAxisAngle(V.set(0, 0, 1), Math.PI / 2);
        else if (a === 'z') Q.setFromAxisAngle(V.set(1, 0, 0), Math.PI / 2);
        M4.compose(V.set(wx, p.y + cy, wz), Q, SC.set(r, len, r));
        batch.geo(geo, M4, tint);
      },
    };
  };

  for (const p of map.props) {
    const P = placer(p), h = rnd(p.x, p.z);
    if (p.kind === 'car' || p.kind === 'van') {
      const van = p.kind === 'van';
      const paint = hex(CAR_COLORS[Math.floor(h * CAR_COLORS.length)]);
      const L = p.len, W = p.wid;
      // gövde, kabin, camlar
      P.box(B.paint, 0, 0.62, 0, L, van ? 0.9 : 0.66, W, { tint: paint });
      if (van) {
        P.box(B.paint, -0.35, 1.55, 0, L - 0.9, 0.95, W - 0.06, { tint: paint });
        P.box(B.glass, -0.35, 1.62, 0, L - 0.86, 0.5, W - 0.1);
        P.box(B.glass, L / 2 - 0.95, 1.45, 0, 0.5, 0.55, W - 0.14);
      } else {
        // kabin: dört yanı cam, köşe dikmeleri ve tavan boyalı
        P.box(B.glass, -0.2, 1.15, 0, 2.1, 0.4, W - 0.2);
        P.box(B.paint, -0.2, 1.38, 0, 1.9, 0.07, W - 0.18, { tint: paint });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(B.paint, -0.2 + sx * 0.98, 1.15, sz * (W / 2 - 0.11), 0.08, 0.42, 0.05, { tint: paint });
      }
      // tamponlar, farlar, stop lambaları, plaka
      P.box(B.rubber, L / 2 + 0.03, 0.4, 0, 0.12, 0.2, W - 0.02);
      P.box(B.rubber, -L / 2 - 0.03, 0.4, 0, 0.12, 0.2, W - 0.02);
      for (const s of [-1, 1]) {
        P.box(B.light, L / 2 + 0.005, 0.72, s * (W / 2 - 0.25), 0.04, 0.12, 0.28, { tint: [1, 0.95, 0.8] });
        P.box(B.light, -L / 2 - 0.005, 0.74, s * (W / 2 - 0.22), 0.04, 0.12, 0.24, { tint: [0.9, 0.12, 0.08] });
        for (const fx of [-1, 1]) {
          P.cyl(B.rubber, fx * (L / 2 - 0.85), 0.34, s * (W / 2 - 0.12), 0.34, 0.24, 'z');
          P.cyl(B.chrome, fx * (L / 2 - 0.85), 0.34, s * (W / 2 - 0.01), 0.2, 0.03, 'z');
        }
      }
      P.box(B.light, L / 2 + 0.06, 0.45, 0, 0.02, 0.12, 0.42, { tint: [0.9, 0.9, 0.85] });
    } else if (p.kind === 'container') {
      const tint = hex(theme.container || 0x2d5f8a);
      P.box(B.corr, 0, 1.3, 0, p.len, 2.6, p.wid, { tint, scale: 2.4 });
      P.box(B.metal, p.len / 2 + 0.02, 1.3, 0, 0.06, 2.5, p.wid - 0.1, { tint: hex(0x55585c) });
      for (const s of [-1, 1]) P.box(B.metal, p.len / 2 + 0.06, 1.3, s * 0.35, 0.04, 2.3, 0.05, { tint: hex(0x3a3c40) });
    } else if (p.kind === 'barrel') {
      const tint = hex([0x8a4b2a, 0x2d4f73, 0x4e6b3a][Math.floor(h * 3)]);
      P.cyl(B.metal, 0, 0.46, 0, 0.31, 0.92, 'y', tint);
      for (const y of [0.2, 0.72]) P.cyl(B.metal, 0, y, 0, 0.318, 0.04, 'y', tint.map((v) => v * 0.8));
      P.cyl(B.dark, 0, 0.925, 0, 0.29, 0.01, 'y');
    } else if (p.kind === 'sacks') {
      for (let i = 0; i < 5; i++) {
        const row = i < 3 ? 0 : 1, k = row ? i - 3 : i;
        Q.identity();
        const [cx, cz] = [(k - (row ? 0.5 : 1)) * 0.42, (rnd(i, h) - 0.5) * 0.08];
        const [wx, wz] = p.rot === 90 ? [p.x + cz, p.z - cx] : [p.x + cx, p.z + cz];
        M4.compose(V.set(wx, p.y + 0.14 + row * 0.25, wz), Q, SC.set(0.22, 0.14, 0.45));
        B.fabric.geo(sphGeo, M4, [1, 1, 1]);
      }
    } else if (p.kind === 'palm') {
      // hafif eğik gövde (halkalı), yapraklar
      const lean = (h - 0.5) * 0.5, segs = 7, hgt = 4.6;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, ox = lean * t0 * t0;
        P.cyl(B.bark, ox, (i + 0.5) * hgt / segs, 0, 0.18 - t0 * 0.06, hgt / segs + 0.02, 'y', [1, 1, 1], cylGeoLo);
      }
      const top = { x: lean, y: hgt };
      for (let f = 0; f < 9; f++) {
        const a = (f / 9) * Math.PI * 2 + h * 3;
        let px = top.x, py = top.y, pz = 0, pitch = 0.35 + rnd(f, h) * 0.3;
        for (let k = 0; k < 4; k++) {
          const len = 0.75;
          const dx = Math.cos(a) * Math.cos(pitch) * len, dy = -Math.sin(pitch) * len * 0.5 + (k === 0 ? 0.25 : 0), dz = Math.sin(a) * Math.cos(pitch) * len;
          const mx = px + dx / 2, my = py + dy / 2, mz = pz + dz / 2;
          const [wx, wz] = p.rot === 90 ? [p.x + mz, p.z - mx] : [p.x + mx, p.z + mz];
          Q.setFromUnitVectors(V.set(0, 0, 1), new THREE.Vector3(dx, dy, dz).normalize());
          M4.compose(V.set(wx, p.y + my, wz), Q, SC.set(0.36 - k * 0.07, 0.03, len + 0.05));
          B.leaf.geo(boxGeo1, M4, [0.85 + rnd(f, k) * 0.3, 1, 0.8]);
          px += dx; py += dy; pz += dz; pitch += 0.28;
        }
      }
    } else if (p.kind === 'booth') {
      const L = p.len;
      P.box(B.plaster, 0, 0.55, 0, L, 1.1, L, { scale: 2 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(B.wood, sx * (L / 2 - 0.08), 1.65, sz * (L / 2 - 0.08), 0.14, 1.1, 0.14, { scale: 1 });
      P.box(B.dark, 0, 1.65, 0, L - 0.2, 1.08, L - 0.2);
      P.box(B.wood, 0, 2.35, 0, L + 0.5, 0.18, L + 0.5, { scale: 2, bottom: true });
      P.box(B.wood, 0, 1.1, -L / 2 - 0.1, L, 0.06, 0.3, { scale: 1 });
    } else if (p.kind === 'bench') {
      P.box(B.wood, 0, 0.45, 0, p.len, 0.06, p.wid, { scale: 1 });
      P.box(B.wood, 0, 0.75, p.wid / 2 - 0.04, p.len, 0.35, 0.05, { scale: 1 });
      for (const s of [-1, 1]) P.box(B.metal, s * (p.len / 2 - 0.15), 0.22, 0, 0.06, 0.44, p.wid - 0.05, { tint: hex(0x2a2b2d) });
    }
  }

  // ---------------------------------------------------------------- Cepheler
  const { grid: g, w, h, ox, oz } = map;
  const floorAt = (c, r) => c >= 0 && r >= 0 && c < w && r < h && g[r][c] !== '#';
  const blocks = map.boxes.filter((b) => b.type === 'block');
  // Komşu hücredeki zemin yüksekliği ve hücre kapalı mı (merdiven, kapı...)
  const cellInfo = (c, r) => {
    const x = ox + (c + 0.5) * CELL, z = oz + (r + 0.5) * CELL;
    let y = 0, busy = false, roof = Infinity;
    for (const b of blocks) {
      if (x < b.min[0] - 0.9 || x > b.max[0] + 0.9 || z < b.min[2] - 0.9 || z > b.max[2] + 0.9) continue;
      const inside = x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2];
      if (b.mat === 'floor' || b.mat === 'step') { if (inside) y = Math.max(y, b.max[1]); }
      if (b.mat === 'roof' && inside) roof = Math.min(roof, b.min[1]);
      if (b.mat !== 'floor' && b.mat !== 'roof') busy = true;
    }
    return { y, busy, roof };
  };
  const frame = hex(0x6f4d2e);
  for (const b of map.boxes) {
    if (b.type !== 'wall') continue;
    const c0 = Math.round((b.min[0] - ox) / CELL), c1 = Math.round((b.max[0] - ox) / CELL);
    const r0 = Math.round((b.min[2] - oz) / CELL), r1 = Math.round((b.max[2] - oz) / CELL);
    const H = b.max[1];
    // Bazı çatılarda su tankı (ayaklı silindir): düz siluet bozulsun
    const area = (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]);
    if (!b.border && area >= 24 && rnd(c0, r0, 7) < 0.3) {
      const tx = (b.min[0] + b.max[0]) / 2 + (rnd(c0, r0, 8) - 0.5) * 2, tz = (b.min[2] + b.max[2]) / 2 + (rnd(c0, r0, 9) - 0.5) * 2;
      const tint = hex(rnd(c0, r0, 10) < 0.5 ? 0xd9d6cc : 0x4a6a8c);
      for (const [lx, lz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) B.metal.box([tx + lx - 0.04, H + 0.2, tz + lz - 0.04], [tx + lx + 0.04, H + 0.85, tz + lz + 0.04], { tint: hex(0x4a4a48) });
      M4.compose(V.set(tx, H + 1.5, tz), Q.identity(), SC.set(0.68, 1.3, 0.68));
      B.metal.geo(cylGeo, M4, tint);
    }
    // Her yüz: [dış normal (nx, nz), yüz düzlemi, boyunca hücreler]
    const faces = [];
    for (let c = c0; c < c1; c++) { faces.push({ nx: 0, nz: -1, c, r: r0 - 1, plane: b.min[2] }); faces.push({ nx: 0, nz: 1, c, r: r1, plane: b.max[2] }); }
    for (let r = r0; r < r1; r++) { faces.push({ nx: -1, nz: 0, c: c0 - 1, r, plane: b.min[0] }); faces.push({ nx: 1, nz: 0, c: c1, r, plane: b.max[0] }); }
    for (const f of faces) {
      if (!floorAt(f.c, f.r)) continue;
      const info = cellInfo(f.c, f.r);
      // Yüz üzerindeki parça merkezi: t boyunca (yüze paralel) ve n yönünde (dışarı) konum
      const along = f.nz !== 0 ? ox + (f.c + 0.5) * CELL : oz + (f.r + 0.5) * CELL;
      const at = (t, y, n, st, sy, sn) => {
        // t: yüze paralel kaydırma, n: dışarı çıkıntı (yüzden), st/sy/sn: ölçüler
        const cx = f.nz !== 0 ? along + t : f.plane + f.nx * n;
        const cz = f.nz !== 0 ? f.plane + f.nz * n : along + t;
        const hx = f.nz !== 0 ? st / 2 : sn / 2, hz = f.nz !== 0 ? sn / 2 : st / 2;
        return [[cx - hx, y - sy / 2, cz - hz], [cx + hx, y + sy / 2, cz + hz]];
      };
      const put = (batch, t, y, n, st, sy, sn, o) => { const [mn, mx] = at(t, y, n, st, sy, sn); batch.box(mn, mx, o); };
      // kaide (zemin hizasında koyu taş şerit)
      put(B.stone, 0, info.y + 0.17, 0.03, CELL + 0.002, 0.34, 0.06, { scale: 1.2, tint: [0.78, 0.74, 0.68] });
      const hv = rnd(f.c * 3 + f.nx, f.r * 3 + f.nz, 1);
      const wy = info.y + 3.6;
      if (H - info.y >= 5.4 && hv < 0.42 && info.roof > wy + 1) {
        // pencere: koyu boşluk, ahşap çerçeve, denizlik, iki yanında açık kepenk
        const sc = hex(SHUTTER_COLORS[Math.floor(rnd(f.c, f.r, 2) * SHUTTER_COLORS.length)]);
        put(B.dark, 0, wy, 0.01, 0.9, 1.2, 0.02);
        put(B.wood, 0, wy + 0.63, 0.05, 1.06, 0.08, 0.1, { tint: frame });
        put(B.wood, 0, wy - 0.63, 0.05, 1.06, 0.08, 0.1, { tint: frame });
        put(B.wood, -0.49, wy, 0.05, 0.08, 1.2, 0.1, { tint: frame });
        put(B.wood, 0.49, wy, 0.05, 0.08, 1.2, 0.1, { tint: frame });
        put(B.wood, 0, wy, 0.04, 0.04, 1.2, 0.06, { tint: frame });
        put(B.stone, 0, wy - 0.72, 0.09, 1.25, 0.08, 0.18, { scale: 1.2 });
        if (rnd(f.c, f.r, 3) < 0.7) {
          put(B.wood, -0.78, wy, 0.04, 0.46, 1.24, 0.04, { tint: sc, scale: 0.7 });
          put(B.wood, 0.78, wy, 0.04, 0.46, 1.24, 0.04, { tint: sc, scale: 0.7 });
        }
      } else if (hv < 0.55 && info.y < 0.05 && !info.busy) {
        // kapı: ahşap kanat, taş çerçeve, eşik
        const dc = hex(SHUTTER_COLORS[Math.floor(rnd(f.c, f.r, 4) * SHUTTER_COLORS.length)]);
        put(B.wood, 0, 1.1, 0.02, 1.15, 2.2, 0.04, { tint: dc.map((v) => v * 0.9), scale: 0.8 });
        put(B.stone, 0, 2.3, 0.05, 1.45, 0.2, 0.1, { scale: 1.2 });
        put(B.stone, -0.68, 1.1, 0.05, 0.12, 2.2, 0.1, { scale: 1.2 });
        put(B.stone, 0.68, 1.1, 0.05, 0.12, 2.2, 0.1, { scale: 1.2 });
        put(B.stone, 0, 0.06, 0.15, 1.4, 0.12, 0.3, { scale: 1.2 });
        put(B.metal, 0.4, 1.05, 0.06, 0.05, 0.05, 0.05, { tint: hex(0x2a2a2a) });
        if (rnd(f.c, f.r, 5) < 0.5 && info.roof > 3.2) {
          // kumaş tente: dışa doğru aşağı eğik
          const cx = f.nz !== 0 ? along : f.plane + f.nx * 0.45, cz = f.nz !== 0 ? f.plane + f.nz * 0.45 : along;
          Q.setFromAxisAngle(V.set(0, 1, 0), Math.atan2(f.nx, f.nz)).multiply(Q2.setFromAxisAngle(V2.set(1, 0, 0), 0.42));
          M4.compose(V.set(cx, 2.62, cz), Q, SC.set(1.7, 0.04, 0.95));
          B.fabric.geo(boxGeo1, M4, hex(AWNING_COLORS[Math.floor(rnd(f.c, f.r, 6) * AWNING_COLORS.length)]));
        }
      } else if (hv > 0.93 && H - info.y > 4 && info.roof > info.y + 3.2) {
        // klima ya da elektrik kutusu
        put(B.metal, (hv - 0.96) * 6, info.y + 2.7, 0.22, 0.8, 0.55, 0.44, { tint: hex(0xb8b6ae) });
        put(B.dark, (hv - 0.96) * 6, info.y + 2.7, 0.445, 0.6, 0.38, 0.01);
      }
    }
  }

  // ---------------------------------------------------------------- Malzemeler ve mesh'ler
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const mats = {
    paint: std({ roughness: 0.45, metalness: 0.35 }),
    glass: std({ color: 0x1a2228, roughness: 0.08, metalness: 0.6 }),
    rubber: std({ color: 0x1b1b1b, roughness: 0.9 }),
    metal: std({ roughness: 0.55, metalness: 0.5 }),
    chrome: std({ color: 0xb8bcc0, roughness: 0.2, metalness: 1 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true }),
    wood: std({ map: T.wood, roughness: 0.75 }),
    corr: std({ map: T.corr, roughness: 0.6, metalness: 0.3 }),
    fabric: std({ map: T.fabric, roughness: 0.95 }),
    bark: std({ map: T.bark, roughness: 0.9 }),
    leaf: std({ color: 0x4f7a32, roughness: 0.7, side: THREE.DoubleSide }),
    stone: std({ map: opts.stoneTex || null, color: opts.stoneTex ? 0xffffff : 0x9c8f78, roughness: 0.9 }),
    dark: std({ color: 0x0e0d0c, roughness: 0.35 }),
    plaster: std({ map: opts.plasterTex || null, color: opts.plasterTex ? 0xffffff : 0xd8c8a4, roughness: 0.9 }),
  };
  const group = new THREE.Group();
  for (const [k, batch] of Object.entries(B)) {
    const geo = batch.build();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mats[k]);
    mesh.castShadow = k !== 'light' && k !== 'dark';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  cylGeo.dispose(); cylGeoLo.dispose(); sphGeo.dispose(); boxGeo1.dispose();
  return {
    group,
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of Object.values(mats)) m.dispose();
      for (const t of Object.values(T)) t.dispose();
    },
  };
}
