// Harita görselleri: prosedürel (kodla çizilen) dokular, birleştirilmiş duvar geometrisi, gökyüzü ve ışıklar.
import * as THREE from 'three';
import { MAP_W, MAP_H, CELL, SITES } from '../shared/map.js';

// ---------------------------------------------------------------- Dokular
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function pixelNoise(g, size, amount) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Kenarlardan taşan lekeleri karşı kenara da çizer, böylece doku dikişsiz tekrarlar
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

function makeTextures() {
  const brick = canvasTex(512, (g, s) => {
    g.fillStyle = '#8f7449';
    g.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, bh = s / rows, bw = s / cols;
    for (let r = 0; r < rows; r++) {
      const tints = Array.from({ length: cols }, () => 0.86 + Math.random() * 0.22);
      const off = (r % 2) * bw / 2;
      for (let c = -1; c <= cols; c++) {
        const l = tints[(c + cols) % cols];
        g.fillStyle = `rgb(${(201 * l) | 0},${(166 * l) | 0},${(110 * l) | 0})`;
        g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
      }
    }
    for (let i = 0; i < 16; i++) blot(g, s, Math.random() * s, Math.random() * s, 20 + Math.random() * 70, 'rgba(95,62,30,0.16)');
    pixelNoise(g, s, 26);
  });

  const plaster = canvasTex(512, (g, s) => {
    g.fillStyle = '#d4bc8e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) blot(g, s, Math.random() * s, Math.random() * s, 30 + Math.random() * 90, Math.random() < 0.5 ? 'rgba(120,85,45,0.14)' : 'rgba(255,240,210,0.16)');
    g.strokeStyle = 'rgba(80,55,30,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; g.lineTo(x, y); }
      g.stroke();
    }
    pixelNoise(g, s, 18);
  });

  const sand = canvasTex(512, (g, s) => {
    g.fillStyle = '#c3a272';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) blot(g, s, Math.random() * s, Math.random() * s, 25 + Math.random() * 80, Math.random() < 0.5 ? 'rgba(130,95,55,0.12)' : 'rgba(240,220,180,0.14)');
    pixelNoise(g, s, 24);
    for (let i = 0; i < 400; i++) {
      const v = Math.random() < 0.6 ? 90 : 220;
      g.fillStyle = `rgba(${v},${v - 20},${v - 50},0.5)`;
      const r = 1 + Math.random() * 2;
      g.fillRect(Math.random() * s, Math.random() * s, r, r);
    }
  });

  const tiles = canvasTex(512, (g, s) => {
    g.fillStyle = '#7d6a4c';
    g.fillRect(0, 0, s, s);
    const n = 4, ts = s / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const l = 0.88 + Math.random() * 0.18;
        g.fillStyle = `rgb(${(186 * l) | 0},${(162 * l) | 0},${(122 * l) | 0})`;
        g.fillRect(c * ts + 3, r * ts + 3, ts - 6, ts - 6);
      }
    }
    for (let i = 0; i < 10; i++) blot(g, s, Math.random() * s, Math.random() * s, 30 + Math.random() * 60, 'rgba(90,60,30,0.15)');
    pixelNoise(g, s, 16);
  });

  const crate = canvasTex(256, (g, s) => {
    g.fillStyle = '#8f6236';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      const l = 0.85 + Math.random() * 0.25;
      g.fillStyle = `rgb(${(150 * l) | 0},${(104 * l) | 0},${(58 * l) | 0})`;
      g.fillRect(0, i * s / 6 + 1, s, s / 6 - 2);
    }
    g.strokeStyle = '#5b3d1d';
    g.lineWidth = 26;
    g.strokeRect(13, 13, s - 26, s - 26);
    g.lineWidth = 22;
    g.beginPath(); g.moveTo(20, 20); g.lineTo(s - 20, s - 20); g.stroke();
    g.strokeStyle = 'rgba(255,220,160,0.18)';
    g.lineWidth = 2;
    g.strokeRect(26, 26, s - 52, s - 52);
    g.fillStyle = '#2b2116';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12], [s / 2, 12], [s / 2, s - 12]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    pixelNoise(g, s, 22);
  });

  const trim = canvasTex(256, (g, s) => {
    g.fillStyle = '#a68756';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(60,40,20,0.25)';
    g.fillRect(0, s * 0.7, s, s * 0.3);
    pixelNoise(g, s, 22);
  });

  return { brick, plaster, sand, tiles, crate, trim };
}

function letterTex(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(150,25,18,0.85)';
  g.lineWidth = 14;
  g.shadowColor = 'rgba(150,25,18,0.9)';
  g.shadowBlur = 10;
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(160,28,20,0.9)';
  g.font = 'bold 170px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
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

// ---------------------------------------------------------------- Dünya
export function buildWorld(scene, map) {
  const T = makeTextures();
  const mats = {
    brick: new THREE.MeshStandardMaterial({ map: T.brick, vertexColors: true, roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ map: T.plaster, vertexColors: true, roughness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ map: T.trim, vertexColors: true, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ map: T.crate, vertexColors: true, roughness: 0.85 }),
    tiles: new THREE.MeshStandardMaterial({ map: T.tiles, vertexColors: true, roughness: 0.9 }),
  };
  const gb = { brick: new GeoBuilder(), plaster: new GeoBuilder(), trim: new GeoBuilder(), crate: new GeoBuilder(), tiles: new GeoBuilder() };

  for (const b of map.boxes) {
    if (b.type === 'wall') {
      gb[b.v ? 'plaster' : 'brick'].box(b.min, b.max, { scale: 4, bottom: 0.58, gradH: 6.5 });
      gb.trim.box([b.min[0] - 0.12, b.max[1] - 0.02, b.min[2] - 0.12], [b.max[0] + 0.12, b.max[1] + 0.25, b.max[2] + 0.12], { scale: 2, bottom: 0.9, gradH: 100 });
    } else if (b.type === 'crate') {
      gb.crate.box(b.min, b.max, { faceUV: true });
    }
  }
  for (const s of Object.values(SITES)) {
    gb.tiles.box([s.x0, 0, s.z0], [s.x1, 0.015, s.z1], { scale: 4, bottom: 1, gradH: 1 });
  }

  for (const [k, builder] of Object.entries(gb)) {
    const mesh = new THREE.Mesh(builder.build(), mats[k]);
    mesh.castShadow = k !== 'tiles';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Zemin
  const W = MAP_W * CELL, H = MAP_H * CELL;
  T.sand.repeat.set(W / 8, H / 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: T.sand, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Bomba bölgesi harfleri
  for (const [k, s] of Object.entries(SITES)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: letterTex(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((s.x0 + s.x1) / 2, 0.03, (s.z0 + s.z1) / 2);
    scene.add(m);
  }

  // Gökyüzü
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d7fc4) },
        mid: { value: new THREE.Color(0xa6c8e6) },
        bottom: { value: new THREE.Color(0xe2d3b4) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, min(1.0, -h * 5.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  scene.fog = new THREE.Fog(0xd9ccb0, 70, 230);
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x9a7a50, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
  sun.position.set(38, 70, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  return {
    update(camera) { sky.position.copy(camera.position); },
  };
}
