// Harita görselleri: temaya göre kodla çizilen dokular, birleştirilmiş duvar geometrisi, gökyüzü, ışıklar
// ve ortam yansıması (IBL). Her harita kendi teması ile kurulur; harita değişince eski dünya temizlenir.
import * as THREE from 'three';
import { CELL } from '../shared/map.js';

// ---------------------------------------------------------------- Doku yardımcıları
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}
let maxAniso = 8;
function pixelNoise(g, size, amount) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
// Kenardan taşan lekeleri karşı kenara da çiz: doku dikişsiz tekrarlar
function blot(g, size, x, y, r, color) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
}
const rgb = (hex, l = 1) => {
  const c = new THREE.Color(hex);
  return `rgb(${Math.min(255, c.r * 255 * l) | 0},${Math.min(255, c.g * 255 * l) | 0},${Math.min(255, c.b * 255 * l) | 0})`;
};
function stains(g, s, n, color) { for (let i = 0; i < n; i++) blot(g, s, Math.random() * s, Math.random() * s, 20 + Math.random() * 70, color); }

// ---------------------------------------------------------------- Doku türleri
const TEX = {
  bricks: (base, mortar) => canvasTex(512, (g, s) => {
    g.fillStyle = mortar; g.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, bh = s / rows, bw = s / cols;
    for (let r = 0; r < rows; r++) {
      const tints = Array.from({ length: cols }, () => 0.86 + Math.random() * 0.22);
      const off = (r % 2) * bw / 2;
      for (let c = -1; c <= cols; c++) {
        g.fillStyle = rgb(base, tints[(c + cols) % cols]);
        g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, 3);
      }
    }
    stains(g, s, 16, 'rgba(70,45,20,0.16)');
    pixelNoise(g, s, 26);
  }),
  plaster: (base) => canvasTex(512, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) blot(g, s, Math.random() * s, Math.random() * s, 30 + Math.random() * 90, Math.random() < 0.5 ? 'rgba(90,65,35,0.14)' : 'rgba(255,245,220,0.16)');
    g.strokeStyle = 'rgba(70,50,30,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; g.lineTo(x, y); }
      g.stroke();
    }
    pixelNoise(g, s, 18);
  }),
  panels: (base) => canvasTex(512, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    stains(g, s, 20, 'rgba(30,30,30,0.18)');
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(i * s / 2 + 2, j * s / 2 + 2, s / 2 - 4, s / 2 - 4);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(i * s / 2 + 6, j * s / 2 + 6, s / 2 - 12, s / 2 - 12);
      g.fillStyle = 'rgba(20,20,20,0.6)';
      for (const [x, y] of [[14, 14], [s / 2 - 14, 14], [14, s / 2 - 14], [s / 2 - 14, s / 2 - 14]]) { g.beginPath(); g.arc(i * s / 2 + x, j * s / 2 + y, 4, 0, 7); g.fill(); }
    }
    for (let i = 0; i < 8; i++) { const x = Math.random() * s; const gr = g.createLinearGradient(x, 0, x, s); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(1, 'rgba(60,40,20,0.25)'); g.fillStyle = gr; g.fillRect(x, s * 0.4, 6, s * 0.6); }
    pixelNoise(g, s, 22);
  }),
  corrugated: (base) => canvasTex(512, (g, s) => {
    for (let x = 0; x < s; x++) {
      const l = 0.78 + 0.3 * (0.5 + 0.5 * Math.sin(x / s * Math.PI * 2 * 16));
      g.fillStyle = rgb(base, l); g.fillRect(x, 0, 1, s);
    }
    stains(g, s, 14, 'rgba(90,50,20,0.22)');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, s / 2 - 2, s, 4);
    pixelNoise(g, s, 16);
  }),
  stone: (base) => canvasTex(512, (g, s) => {
    g.fillStyle = 'rgb(60,62,66)'; g.fillRect(0, 0, s, s);
    const rows = 6, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * 60;
      while (x < s) {
        const w = 60 + Math.random() * 90;
        g.fillStyle = rgb(base, 0.82 + Math.random() * 0.3);
        g.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
        if (x + w > s) { g.fillRect(x + 3 - s, r * rh + 3, w - 6, rh - 6); }
        x += w;
      }
    }
    stains(g, s, 12, 'rgba(20,25,30,0.2)');
    pixelNoise(g, s, 24);
  }),
  planks: (base) => canvasTex(512, (g, s) => {
    const n = 8, pw = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = rgb(base, 0.8 + Math.random() * 0.35); g.fillRect(i * pw, 0, pw, s);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(i * pw, 0, 3, s);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const x = i * pw + 6 + Math.random() * (pw - 12); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, s * 0.3, x - 6, s * 0.6, x + 3, s); g.stroke(); }
    }
    pixelNoise(g, s, 20);
  }),
  tech: (base, accent) => canvasTex(512, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(2, i * s / 4 + 2, s - 4, s / 4 - 4); }
    g.fillStyle = accent; g.fillRect(0, s * 0.62, s, 10);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, s * 0.62, s, 2);
    stains(g, s, 10, 'rgba(0,0,0,0.2)');
    pixelNoise(g, s, 14);
  }),
  ground: (base, kind) => canvasTex(512, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    const n = kind === 'snow' ? 30 : 40;
    for (let i = 0; i < n; i++) blot(g, s, Math.random() * s, Math.random() * s, 25 + Math.random() * 80, Math.random() < 0.5 ? 'rgba(80,70,60,0.10)' : 'rgba(255,255,255,0.12)');
    if (kind === 'concrete') {
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
      g.strokeStyle = 'rgba(30,30,30,0.3)'; g.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) { let x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    } else if (kind === 'grid') {
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    } else if (kind === 'snow') {
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(150,170,200,0.18)'; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 6, 10, Math.random() * 3, 0, 7); g.fill(); }
    }
    pixelNoise(g, s, kind === 'snow' ? 10 : 24);
    if (kind === 'sand') for (let i = 0; i < 400; i++) { const v = Math.random() < 0.6 ? 90 : 220; g.fillStyle = `rgba(${v},${v - 20},${v - 50},0.5)`; const r = 1 + Math.random() * 2; g.fillRect(Math.random() * s, Math.random() * s, r, r); }
  }),
  tiles: (base, grout) => canvasTex(512, (g, s) => {
    g.fillStyle = grout; g.fillRect(0, 0, s, s);
    const n = 4, ts = s / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { g.fillStyle = rgb(base, 0.88 + Math.random() * 0.18); g.fillRect(c * ts + 3, r * ts + 3, ts - 6, ts - 6); }
    stains(g, s, 10, 'rgba(60,40,20,0.15)');
    pixelNoise(g, s, 16);
  }),
  woodCrate: (base) => canvasTex(256, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { g.fillStyle = rgb(base, 0.85 + Math.random() * 0.3); g.fillRect(0, i * s / 6 + 1, s, s / 6 - 2); }
    g.strokeStyle = rgb(base, 0.6); g.lineWidth = 26; g.strokeRect(13, 13, s - 26, s - 26);
    g.lineWidth = 22; g.beginPath(); g.moveTo(20, 20); g.lineTo(s - 20, s - 20); g.stroke();
    g.strokeStyle = 'rgba(255,220,160,0.18)'; g.lineWidth = 2; g.strokeRect(26, 26, s - 52, s - 52);
    g.fillStyle = '#2b2116';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12], [s / 2, 12], [s / 2, s - 12]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    pixelNoise(g, s, 22);
  }),
  container: (base) => canvasTex(256, (g, s) => {
    for (let x = 0; x < s; x++) { g.fillStyle = rgb(base, 0.8 + 0.25 * (0.5 + 0.5 * Math.sin(x / s * Math.PI * 2 * 10))); g.fillRect(x, 0, 1, s); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 12; g.strokeRect(6, 6, s - 12, s - 12);
    stains(g, s, 10, 'rgba(90,50,20,0.3)');
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = 'bold 22px Verdana'; g.fillText('DST-' + (100 + (Math.random() * 899 | 0)), 24, 46);
    pixelNoise(g, s, 18);
  }),
  metalBox: (base) => canvasTex(256, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d9a520'; g.lineWidth = 14; g.strokeRect(7, 7, s - 14, s - 14);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(22, 22, s - 44, s - 44);
    stains(g, s, 8, 'rgba(0,0,0,0.25)');
    pixelNoise(g, s, 16);
  }),
  trim: (base, kind) => canvasTex(256, (g, s) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, s, s);
    if (kind === 'hazard') {
      g.fillStyle = '#1d1d1d';
      for (let i = -s; i < s * 2; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 + s, s); g.lineTo(i + s, s); g.fill(); }
    } else if (kind === 'snow') {
      stains(g, s, 10, 'rgba(160,180,210,0.2)');
    } else {
      g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(0, s * 0.7, s, s * 0.3);
    }
    pixelNoise(g, s, kind === 'snow' ? 8 : 20);
  }),
};

// ---------------------------------------------------------------- Temalar
const THEMES = {
  desert: {
    sky: [0x3d7fc4, 0xa6c8e6, 0xe2d3b4], clouds: 0.55, fog: 0xd9ccb0, fogNear: 70, fogFar: 230,
    sun: [0xfff0d6, 2.7, [38, 70, 22]], hemi: [0xd6e6ff, 0x9a8a70, 1.15], envGround: 0x9c9384,
    grade: { tint: [1.05, 1.0, 0.92], sat: 1.1 },
    make: () => ({
      wallA: TEX.bricks(0xc9a66e, '#8f7449'), wallB: TEX.plaster(0xd4bc8e), trim: TEX.trim(0xa68756),
      ground: TEX.ground(0xc3a272, 'sand'), site: TEX.tiles(0xbaa27c, '#7d6a4c'), crate: TEX.woodCrate(0x8f6236),
    }),
  },
  industrial: {
    sky: [0x51667a, 0x9eabb6, 0x8d9296], clouds: 0.9, fog: 0x939ba2, fogNear: 45, fogFar: 170,
    sun: [0xeef2f7, 2.3, [-30, 60, 40]], hemi: [0xd0dbe6, 0x6a6a68, 1.6], envGround: 0x7b7d7e,
    grade: { tint: [0.97, 1.0, 1.03], sat: 1.0 },
    make: () => ({
      wallA: TEX.panels(0x8e9090), wallB: TEX.corrugated(0x5d7186), trim: TEX.trim(0xd2a62a, 'hazard'),
      ground: TEX.ground(0x8a8c8e, 'concrete'), site: TEX.tiles(0xb8a050, '#555'), crate: TEX.container(0xb5532a), crate2: TEX.container(0x2f5e8a),
    }),
  },
  snow: {
    sky: [0x6f95c0, 0xc9d9e8, 0xeef3f7], clouds: 0.7, fog: 0xdfe8ef, fogNear: 45, fogFar: 180,
    sun: [0xf3f7ff, 2.3, [30, 45, -35]], hemi: [0xdde8ff, 0xb8c4d0, 1.25], envGround: 0xe6edf3, snowfall: true,
    grade: { tint: [0.96, 1.0, 1.05], sat: 1.02 },
    make: () => ({
      wallA: TEX.stone(0x8d939b), wallB: TEX.planks(0x93714f), trim: TEX.trim(0xf2f6fa, 'snow'),
      ground: TEX.ground(0xe6ecf2, 'snow'), site: TEX.tiles(0xb8c3cc, '#6d7680'), crate: TEX.woodCrate(0x6e7b4d),
    }),
  },
  arena: {
    sky: [0x2a2346, 0xd0745a, 0x3a2f45], clouds: 0.35, fog: 0x4a3a50, fogNear: 40, fogFar: 150,
    sun: [0xffd8b4, 2.9, [-25, 35, 30]], hemi: [0xd2c4f2, 0x76666c, 1.7], envGround: 0x7a7e86, glowTrim: 0xff7a2a,
    grade: { tint: [1.03, 0.97, 1.05], sat: 1.15 },
    make: () => ({
      wallA: TEX.tech(0x646b78, '#ff8a3a'), wallB: TEX.tech(0x5c6370, '#3aa8ff'), trim: TEX.trim(0x3a3d44),
      ground: TEX.ground(0x767a82, 'grid'), site: TEX.tiles(0x666a70, '#333'), crate: TEX.metalBox(0x7a808a),
    }),
  },
};

function letterTex(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(150,25,18,0.85)'; g.lineWidth = 14;
  g.shadowColor = 'rgba(150,25,18,0.9)'; g.shadowBlur = 10;
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(160,28,20,0.9)';
  g.font = 'bold 170px Impact, Arial Black, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- Geometri
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, n, uvs, cols) {
    const i = this.pos.length / 3;
    for (const v of [a, b, c, d]) this.pos.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.nor.push(n[0], n[1], n[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    for (const c2 of cols) this.col.push(c2, c2, c2);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // Dünya koordinatlı UV (doku esnemesin) ya da yüz başına 0..1 UV (sandıklar)
  box(min, max, o) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const s = o.faceUV ? 1 : 1 / o.scale;
    const shade = (y) => (o.faceUV ? 1 : Math.min(1, o.bottom + (1 - o.bottom) * (y / o.gradH)));
    const c0 = shade(y0), c1 = shade(y1);
    const side = [c0, c0, c1, c1];
    const F = o.faceUV;
    const uvSide = (u0, u1) => (F ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[u0, y0 * s], [u1, y0 * s], [u1, y1 * s], [u0, y1 * s]]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvSide(-z1 * s, -z0 * s), side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvSide(z0 * s, z1 * s), side);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvSide(x0 * s, x1 * s), side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvSide(-x1 * s, -x0 * s), side);
    const uvTop = F ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[x0 * s, -z1 * s], [x1 * s, -z1 * s], [x1 * s, -z0 * s], [x0 * s, -z0 * s]];
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvTop, [c1, c1, c1, c1]);
  }
  build() {
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

const SKY_VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float cloud; uniform float time;
  varying vec3 vP;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec3 d = normalize(vP); float h = d.y;
    vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, min(1.0, -h * 5.0));
    float s = max(dot(d, sunDir), 0.0);
    c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.22);
    if (h > 0.02 && cloud > 0.0) {
      vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(time * 0.004, time * 0.002);
      float n = fbm(uv);
      float cl = smoothstep(0.48, 0.82, n) * cloud * smoothstep(0.02, 0.25, h);
      c = mix(c, mix(vec3(0.82), vec3(1.0), s), cl);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makeSky(theme, radius) {
  const sunDir = new THREE.Vector3(...theme.sun[2]).normalize();
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(theme.sky[0]) }, mid: { value: new THREE.Color(theme.sky[1]) }, bottom: { value: new THREE.Color(theme.sky[2]) },
        sunDir: { value: sunDir }, sunColor: { value: new THREE.Color(theme.sun[0]) }, cloud: { value: theme.clouds }, time: { value: 0 },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    }),
  );
}

// Ortam yansıması: gökyüzü + zemin renginden küçük bir IBL haritası üretir
function makeEnvironment(renderer, theme) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = makeSky({ ...theme, clouds: 0 }, 50);
  envScene.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: theme.envGround }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const rt = pm.fromScene(envScene, 0.04);
  pm.dispose();
  sky.geometry.dispose(); sky.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
  return rt;
}

// Duvar ve sandık diplerine yumuşak ortam gölgesi: haritadan bir kez hesaplanan doku, zemine çarpılarak
// uygulanır (her kalitede çalışır, maliyeti yok denecek kadar az). Uzakta sise karışıp kaybolur.
const AO_PPM = 4; // metre başına piksel
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
function makeFloorAO(map, theme) {
  const W = map.w * CELL * AO_PPM, H = map.h * CELL * AO_PPM;
  const occ = new Float32Array(W * H);
  for (const b of map.boxes) {
    const x0 = Math.max(0, Math.round((b.min[0] - map.ox) * AO_PPM)), x1 = Math.min(W, Math.round((b.max[0] - map.ox) * AO_PPM));
    const z0 = Math.max(0, Math.round((b.min[2] - map.oz) * AO_PPM)), z1 = Math.min(H, Math.round((b.max[2] - map.oz) * AO_PPM));
    const v = b.type === 'wall' ? 1 : b.big ? 0.85 : 0.7;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) occ[z * W + x] = Math.max(occ[z * W + x], v);
  }
  let ao = boxBlur(occ, W, H, 3);
  ao = boxBlur(ao, W, H, 2);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = Math.round(255 * (1 - 0.62 * Math.min(1, ao[i] * 1.15)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  const fade = theme.fogNear + (theme.fogFar - theme.fogNear) * 0.35;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, fade: { value: fade } },
    vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform sampler2D map; uniform float fade; varying vec2 vUv; varying float vD;
      void main(){ float a = texture2D(map, vUv).r; a = mix(a, 1.0, smoothstep(fade * 0.5, fade, vD)); gl_FragColor = vec4(vec3(a), 1.0);
      #include <colorspace_fragment>
      }`,
    blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(map.w * CELL, map.h * CELL), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1; // zeminden ve site karolarından sonra çizilsin
  mesh.userData.noAO = true;
  return { mesh, tex };
}

function makeSnow(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- Dünya
export function buildWorld(scene, map, opts = {}) {
  if (opts.renderer) maxAniso = Math.min(16, opts.renderer.capabilities.getMaxAnisotropy());
  const theme = THEMES[map.theme] || THEMES.desert;
  const T = theme.make();
  const group = new THREE.Group();
  const bump = opts.bump !== false;
  const std = (tex, extra = {}) => new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.92, ...(bump ? { bumpMap: tex, bumpScale: extra.bumpScale ?? 1.2 } : {}), ...extra.mat });
  const mats = {
    wallA: std(T.wallA, { bumpScale: 0.7 }), wallB: std(T.wallB, { bumpScale: 0.35 }),
    trim: std(T.trim, { bumpScale: 0.5, mat: theme.glowTrim ? { emissive: new THREE.Color(theme.glowTrim), emissiveIntensity: 0.0 } : {} }),
    crate: std(T.crate, { bumpScale: 1 }), crate2: T.crate2 ? std(T.crate2, { bumpScale: 1 }) : null,
    site: std(T.site, { bumpScale: 0.6 }),
  };
  const gb = { wallA: new GeoBuilder(), wallB: new GeoBuilder(), trim: new GeoBuilder(), crate: new GeoBuilder(), crate2: new GeoBuilder(), site: new GeoBuilder(), glow: new GeoBuilder() };

  let n = 0;
  for (const b of map.boxes) {
    if (b.type === 'wall') {
      gb[b.v ? 'wallB' : 'wallA'].box(b.min, b.max, { scale: 4, bottom: 0.55, gradH: 6.5 });
      gb.trim.box([b.min[0] - 0.12, b.max[1] - 0.02, b.min[2] - 0.12], [b.max[0] + 0.12, b.max[1] + (map.theme === 'snow' ? 0.35 : 0.25), b.max[2] + 0.12], { scale: 2, bottom: 0.92, gradH: 100 });
      if (theme.glowTrim && !b.border) gb.glow.box([b.min[0] - 0.02, 1.2, b.min[2] - 0.02], [b.max[0] + 0.02, 1.32, b.max[2] + 0.02], { scale: 1, bottom: 1, gradH: 1 });
    } else if (b.type === 'crate') {
      (T.crate2 && n++ % 2 ? gb.crate2 : gb.crate).box(b.min, b.max, { faceUV: true });
    }
  }
  for (const s of Object.values(map.sites)) gb.site.box([s.x0, 0, s.z0], [s.x1, 0.015, s.z1], { scale: 4, bottom: 1, gradH: 1 });
  // Işık parlaması açıkken (Yüksek / Ultra) neon şeritler parlasın diye renk HDR olarak güçlendirilir
  if (theme.glowTrim) mats.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.glowTrim).multiplyScalar(opts.hdr || 1) });

  for (const [k, builder] of Object.entries(gb)) {
    if (!builder.pos.length || !mats[k]) continue;
    const mesh = new THREE.Mesh(builder.build(), mats[k]);
    mesh.castShadow = k !== 'site' && k !== 'glow';
    mesh.receiveShadow = k !== 'glow';
    group.add(mesh);
  }

  // Zemin
  const W = map.w * CELL, H = map.h * CELL;
  T.ground.repeat.set(W / 8, H / 8);
  const floorMat = new THREE.MeshStandardMaterial({ map: T.ground, roughness: map.theme === 'snow' ? 0.75 : 1, ...(bump ? { bumpMap: T.ground, bumpScale: 0.3 } : {}) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const floorAO = makeFloorAO(map, theme);
  group.add(floorAO.mesh);

  for (const [k, s] of Object.entries(map.sites)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: letterTex(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((s.x0 + s.x1) / 2, 0.03, (s.z0 + s.z1) / 2);
    group.add(m);
  }

  const sky = makeSky(theme, 400);
  sky.renderOrder = -1;
  group.add(sky);

  // Işıklar
  const env = opts.renderer && opts.env !== false ? makeEnvironment(opts.renderer, theme) : null;
  scene.environment = env ? env.texture : null;
  scene.environmentIntensity = 0.8;
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2] * (env ? 0.85 : 1.1));
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
  sun.position.set(...theme.sun[2]);
  sun.castShadow = opts.shadows !== false;
  const ss = opts.shadowSize || 2048;
  sun.shadow.mapSize.set(ss, ss);
  const half = Math.max(W, H) / 2 + 6;
  const sc = sun.shadow.camera;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = opts.shadowRadius || 1;
  group.add(sun);
  group.add(sun.target);

  const snow = theme.snowfall ? makeSnow(opts.lowSpec ? 400 : 900) : null;
  if (snow) group.add(snow);

  scene.add(group);
  let time = 0;

  return {
    map, sun, env, grade: theme.grade,
    setShadows(on) { sun.castShadow = on; },
    update(camera, dt = 0.016) {
      time += dt;
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = time;
      if (snow) {
        snow.position.set(camera.position.x, 0, camera.position.z);
        const p = snow.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) - dt * 1.6;
          if (y < 0) y += 20;
          p.setY(i, y);
          p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.3);
        }
        p.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const k of ['map', 'bumpMap']) if (o.material[k]) o.material[k].dispose();
          o.material.dispose();
        }
      });
      for (const t of Object.values(T)) t.dispose();
      floorAO.tex.dispose();
      if (env) env.dispose();
      if (scene.environment === env?.texture) scene.environment = null;
    },
  };
}
