// Parçalardan kurulan modeller: silahlar, oyuncular ve birinci şahıs silah görünümü (viewmodel).
// Parçalar tek mesh'e birleştirilir (az çizim çağrısı). Her parçanın malzemesi (metal, ahşap, plastik) köşe verisi
// olarak saklanır; ortak gölgelendirici metal parlaklığını, ahşap damarını ve ince yüzey dokusunu çizer.
// Birinci şahıs silahta kenarlar yuvarlatılır ve küçük ayrıntılar eklenir; diğer oyuncuların silahları sade kalır.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Yüzey türleri: metal (çizik, parlaklık farkı), ahşap (damar), mat (plastik, kumaş, deri)
const METAL = 0, WOOD = 1, MATTE = 2;
const matCache = new Map();
function mat(color, rough = 0.7, metal = 0.1, kind = MATTE) {
  const key = `${color}|${rough}|${metal}|${kind}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m.userData.kind = kind;
    matCache.set(key, m);
  }
  return m;
}
const geoCache = new Map();
const cachedGeo = (key, make) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const boxGeo = (w, h, d) => cachedGeo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0) {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  return mesh;
}
function limb(from, to, w, m) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const mesh = new THREE.Mesh(boxGeo(w, w, a.distanceTo(b)), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  return mesh;
}

// Parça yapıcıları. fp (birinci şahıs) iken kutuların kenarları yuvarlatılır, silindirler daha pürüzsüz olur.
function kit(fp) {
  const place = (mesh, x, y, z, rx, ry, rz) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };
  return {
    fp,
    bx(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const r = fp && Math.min(w, h, d) >= 0.01 ? Math.min(0.004, Math.min(w, h, d) * 0.22) : 0;
      const g = r > 0.0008 ? cachedGeo(`r${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r)) : boxGeo(w, h, d);
      return place(new THREE.Mesh(g, m), x, y, z, rx, ry, rz);
    },
    // Silindir: ekseni varsayılan olarak z (namlu yönü), 'x' ya da 'y' olabilir. r: arka/üst, rEnd: ön/alt yarıçap
    cy(r, len, m, x = 0, y = 0, z = 0, axis = 'z', rEnd = r) {
      const seg = fp ? 20 : 8;
      const g = cachedGeo(`c${r}|${rEnd}|${len}|${seg}`, () => new THREE.CylinderGeometry(r, rEnd, len, seg));
      const mesh = new THREE.Mesh(g, m);
      return axis === 'z' ? place(mesh, x, y, z, Math.PI / 2, 0, 0) : axis === 'x' ? place(mesh, x, y, z, 0, 0, -Math.PI / 2) : place(mesh, x, y, z, 0, 0, 0);
    },
    sph(r, m, x = 0, y = 0, z = 0, sy = 1) {
      const g = cachedGeo(`s${r}|${fp}`, () => new THREE.SphereGeometry(r, fp ? 16 : 8, fp ? 12 : 6));
      const mesh = place(new THREE.Mesh(g, m), x, y, z, 0, 0, 0);
      mesh.scale.y = sy;
      return mesh;
    },
    tor(R, t, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const g = cachedGeo(`t${R}|${t}|${fp}`, () => new THREE.TorusGeometry(R, t, 6, fp ? 18 : 8));
      return place(new THREE.Mesh(g, m), x, y, z, rx, ry, rz);
    },
    // İki nokta arasında yuvarlak uçlu silindir (kollar)
    capsule(from, to, r, m) {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const len = a.distanceTo(b);
      const g = cachedGeo(`k${r}|${len.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, len, 4, 14));
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      return mesh;
    },
  };
}
// Şarjör parçalarını işaretler
function mag(m) { m.userData.mag = true; return m; }
// Üstten aşağı inen ve her parçada biraz daha öne kıvrılan şarjör (uzun şarjörde daha fazla parça)
function curvedMag(add, K, m, { y, z, w, d, len, n, tilt, bend }) {
  let a = tilt, py = y, pz = z;
  for (let i = 0; i < n; i++) {
    const dy = -Math.cos(a) * len, dz = -Math.sin(a) * len;
    add(mag(K.bx(w, len + 0.004, d, m, 0, py + dy / 2, pz + dz / 2, a)));
    py += dy; pz += dz;
    a += bend;
  }
  add(mag(K.bx(w + 0.004, 0.008, d + 0.006, m, 0, py, pz, a - bend))); // şarjör tabanı
}

// ---------------------------------------------------------------- Ortak malzeme (gölgelendirici)
// Ayrıntı dokusu: R ince doku (pürüzlülük ve kabartma), G leke (aşınma), B ahşap damarı. Kendini tekrarlayan desen.
function makeDetailTex() {
  const S = 256, data = new Uint8Array(S * S * 4);
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lattice = (n) => Float32Array.from({ length: n * n }, rnd);
  const noise = (lat, n, u, v) => {
    const fx = u * n, fy = v * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (i, j) => lat[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), e = g(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
  };
  const L4 = lattice(4), L8 = lattice(8), L16 = lattice(16), L32 = lattice(32), L64 = lattice(64);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S, k = (j * S + i) * 4;
      const fine = noise(L64, 64, u, v) * 0.55 + noise(L32, 32, u, v) * 0.45;
      const blot = noise(L8, 8, u, v) * 0.6 + noise(L16, 16, u, v) * 0.4;
      const warp = noise(L4, 4, u, v) * 1.6 + noise(L16, 16, u, v) * 0.35;
      const ring = 0.5 + 0.5 * Math.sin((v * 12 + warp) * Math.PI * 2);
      const grain = Math.pow(ring, 2.5) * 0.7 + noise(L64, 64, u * 0.25, v) * 0.3;
      data[k] = fine * 255; data[k + 1] = blot * 255; data[k + 2] = grain * 255; data[k + 3] = 255;
    }
  }
  // İnce çizikler: R kanalında parlak çizgiler (metalde daha parlak, hafif çökük)
  for (let s = 0; s < 70; s++) {
    let x = rnd() * S, y = rnd() * S;
    const ang = rnd() * Math.PI, dx = Math.cos(ang), dy = Math.sin(ang), len = 10 + rnd() * 40;
    for (let t = 0; t < len; t++) {
      const k = ((((y | 0) % S) + S) % S * S + ((((x | 0) % S) + S) % S)) * 4;
      data[k] = Math.min(255, data[k] * 0.4 + 150);
      x += dx; y += dy;
    }
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
const DETAIL_TEX = makeDetailTex();
const DETAIL_SCALE = 4; // doku her 25 cm'de bir tekrarlar

// Köşe başına pürüzlülük/metallik/yüzey türü okuyan standart malzeme. metalScale: ortam yansıması yokken
// (düşük kalite) metaller simsiyah görünmesin diye metalliği azaltır.
function makePbrMaterial() {
  const metalScale = { value: 1 };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, bumpMap: DETAIL_TEX, bumpScale: 0.12 });
  m.userData.metalScale = metalScale;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.metalScale = metalScale;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;\nuniform float metalScale;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 detail = texture2D( bumpMap, vBumpMapUv );
        float woodK = clamp( 1.0 - abs( vPbr.z - 1.0 ), 0.0, 1.0 );
        diffuseColor.rgb *= mix( 0.9 + 0.2 * detail.g, 0.6 + 0.65 * detail.b, woodK );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( vPbr.x * ( 0.75 + 0.5 * detail.r ), 0.05, 1.0 );')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y * metalScale;');
  };
  m.customProgramCacheKey = () => 'dust-pbr';
  return m;
}
const WORLD_MAT = makePbrMaterial(); // dünyadaki modeller (oyuncular, yerdeki silahlar)
const VM_MAT = makePbrMaterial();    // birinci şahıs silah ve eller (her zaman ortam yansıması olur)
export function setWorldReflections(on) { WORLD_MAT.userData.metalScale.value = on ? 1 : 0.4; }

// Bir grubun doğrudan çocuk mesh'lerini tek mesh'e birleştirir; renk, pürüzlülük, metallik ve yüzey türü köşe
// verisine yazılır. Ayrıntı dokusu için yüzey yönüne göre düzlemsel UV üretilir (ahşap damarı uzun eksen boyunca).
function mergeChildren(group, material = WORLD_MAT) {
  const meshes = group.children.filter((c) => c.isMesh && !c.userData.keep && c.material.isMeshStandardMaterial);
  if (!meshes.length) return;
  const pos = [], nor = [], col = [], uv = [], pbr = [], idx = [];
  let base = 0;
  for (const m of meshes) {
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    const p = geo.attributes.position, n = geo.attributes.normal;
    const c = m.material.color, kind = m.material.userData.kind ?? MATTE;
    const rough = m.material.roughness, metal = m.material.metalness;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      pos.push(x, y, z);
      nor.push(nx, ny, nz);
      col.push(c.r, c.g, c.b);
      pbr.push(rough, metal, kind);
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ax >= ay && ax >= az) uv.push(z * DETAIL_SCALE, y * DETAIL_SCALE);
      else if (ay >= az) uv.push(z * DETAIL_SCALE, x * DETAIL_SCALE);
      else uv.push(x * DETAIL_SCALE, y * DETAIL_SCALE);
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
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setAttribute('pbr', new THREE.Float32BufferAttribute(pbr, 3));
  merged.setIndex(idx);
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.userData.merged = true;
  group.add(mesh);
}

// ---------------------------------------------------------------- Malzemeler
const COL = {
  steel: mat(0x4a4e55, 0.36, 0.72, METAL),   // mavileştirilmiş çelik
  steel2: mat(0x6a6e74, 0.42, 0.7, METAL),   // fosfatlı gri çelik
  dark: mat(0x2a2c2f, 0.45, 0.6, METAL),     // namlu ağzı, tetik, pimler
  alu: mat(0x37393d, 0.5, 0.45, METAL),      // eloksallı alüminyum
  chrome: mat(0xc6cbd1, 0.16, 1.0, METAL),   // parlak çelik (Deagle)
  blade: mat(0xd6dbe0, 0.12, 1.0, METAL),
  grey: mat(0x8d9196, 0.42, 0.65, METAL),
  glass: mat(0x0c1720, 0.04, 0.9, METAL),    // dürbün camı
  poly: mat(0x2a2b2e, 0.66, 0.0, MATTE),     // siyah plastik
  poly2: mat(0x3a3d40, 0.6, 0.0, MATTE),
  p90: mat(0x3d443f, 0.58, 0.0, MATTE),
  green: mat(0x4b5836, 0.62, 0.0, MATTE),    // AWP yeşili
  olive: mat(0x5c6838, 0.55, 0.1, MATTE),
  tan: mat(0xb39c66, 0.8, 0, MATTE),
  white: mat(0xb9bbb5, 0.5, 0.05, MATTE),
  paint: mat(0x7d8288, 0.5, 0.2, MATTE),
  red: mat(0xa02020, 0.5, 0.1, MATTE),
  rubber: mat(0x141414, 0.9, 0, MATTE),
  wood: mat(0x8a4f24, 0.5, 0, WOOD),
  bakelite: mat(0x5e2a17, 0.38, 0, WOOD),
  screen: new THREE.MeshBasicMaterial({ color: 0x55ff66 }),
};
const ATT_MAT = mat(0x2c2e31, 0.42, 0.55, METAL);
// Kırmızı noktanın oturduğu ray yüksekliği (gövde üstü); nişan alınca nokta ekran merkezine bu değere göre hizalanır
const RAIL = { ak47: 0.099, galil: 0.099, m4a1: 0.109, famas: 0.172, mp5: 0.095, p90: 0.108 };

// ---------------------------------------------------------------- Silah modelleri
// Kabza (sağ el) orijinde, namlu -Z yönünde
export function createWeaponModel(name, atts = [], opts = {}) {
  const K = kit(!!opts.fp);
  const { bx, cy, sph, tor, fp } = K;
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  let left = null, kind = 'rifle';
  const add = (...m) => m.forEach((x) => g.add(x));
  const long = (atts || []).includes('mag');
  switch (name) {
    case 'ak47':
    case 'galil': {
      const ak = name === 'ak47';
      const metal = ak ? COL.steel : COL.steel2;
      const furn = ak ? COL.wood : COL.poly;
      add(bx(0.052, 0.068, 0.36, metal, 0, 0.044, -0.115),            // gövde
        bx(0.05, 0.022, 0.31, metal, 0, 0.088, -0.095),               // üst kapak
        bx(0.034, 0.024, 0.06, metal, 0, 0.085, -0.285),              // gez bloğu
        bx(0.018, 0.006, 0.05, metal, 0, 0.1, -0.262, 0.06),          // gez
        bx(0.056, 0.048, 0.19, furn, 0, 0.034, -0.395),               // alt el kundağı
        bx(0.042, 0.03, 0.15, furn, 0, 0.085, -0.385),                // üst el kundağı
        cy(0.0105, 0.13, metal, 0, 0.088, -0.525),                    // gaz borusu
        bx(0.032, 0.042, 0.032, metal, 0, 0.072, -0.6),               // gaz bloğu
        cy(0.0105, 0.27, metal, 0, 0.055, -0.62),                     // namlu
        bx(0.024, 0.03, 0.028, metal, 0, 0.074, -0.695),              // arpacık tabanı
        bx(0.005, 0.03, 0.005, metal, 0, 0.1, -0.695),                // arpacık
        cy(0.0145, 0.05, COL.dark, 0, 0.055, -0.77),                  // namlu freni
        bx(0.032, 0.1, 0.044, ak ? COL.bakelite : COL.poly, 0, -0.038, 0.028, -0.32), // kabza
        bx(0.01, 0.006, 0.07, metal, 0, -0.012, -0.03),               // tetik korkuluğu
        bx(0.01, 0.03, 0.006, metal, 0, 0.0, -0.066),
        bx(0.005, 0.02, 0.005, COL.dark, 0, 0.0, -0.034, 0.25),       // tetik
        cy(0.0055, 0.03, metal, 0.035, 0.064, -0.215, 'x'),           // kurma kolu
        bx(0.004, 0.012, 0.11, metal, 0.028, 0.05, -0.075),           // emniyet mandalı
        cy(0.003, 0.2, metal, 0, 0.032, -0.62),                       // temizleme çubuğu
        bx(0.042, 0.07, 0.14, furn, 0, 0.022, 0.12, 0.22),            // dipçik boynu (aşağı eğik)
        bx(0.046, 0.12, 0.17, furn, 0, -0.03, 0.27, 0.22));           // dipçik (birinci şahısta görünmez)
      if (fp) for (let i = 0; i < 5; i++) add(bx(0.051, 0.004, 0.004, COL.dark, 0, 0.099, -0.02 - i * 0.05)); // kapak kabartmaları
      curvedMag(add, K, ak ? COL.steel : COL.poly2, { y: 0.012, z: -0.17, w: 0.034, d: 0.072, len: 0.058, n: long ? 5 : 3, tilt: 0.12, bend: 0.2 });
      muzzle.position.set(0, 0.055, -0.8);
      left = [0, 0.0, -0.4];
      break;
    }
    case 'm4a1': {
      add(bx(0.05, 0.05, 0.25, COL.alu, 0, 0.07, -0.09),              // üst gövde
        bx(0.046, 0.045, 0.17, COL.alu, 0, 0.026, -0.06),             // alt gövde
        bx(0.044, 0.028, 0.075, COL.alu, 0, -0.005, -0.155),          // şarjör yuvası
        bx(0.024, 0.01, 0.24, COL.alu, 0, 0.1, -0.09),                // ray
        cy(0.025, 0.22, COL.poly, 0, 0.068, -0.33),                   // el kundağı
        cy(0.028, 0.014, COL.alu, 0, 0.068, -0.222),                  // kundak halkası
        cy(0.0095, 0.2, COL.steel, 0, 0.068, -0.53),                  // namlu
        bx(0.02, 0.012, 0.03, COL.steel, 0, 0.083, -0.5),             // arpacık tabanı
        bx(0.005, 0.05, 0.012, COL.steel, -0.009, 0.108, -0.5, 0, 0, -0.18), // arpacık çerçevesi
        bx(0.005, 0.05, 0.012, COL.steel, 0.009, 0.108, -0.5, 0, 0, 0.18),
        bx(0.004, 0.018, 0.004, COL.steel, 0, 0.115, -0.5),           // arpacık
        cy(0.012, 0.05, COL.dark, 0, 0.068, -0.655),                  // alev gizleyici
        bx(0.03, 0.1, 0.042, COL.poly, 0, -0.03, 0.03, -0.3),         // kabza
        bx(0.01, 0.006, 0.06, COL.alu, 0, -0.008, -0.025),            // tetik korkuluğu
        bx(0.005, 0.02, 0.005, COL.dark, 0, 0.002, -0.03, 0.25),      // tetik
        bx(0.04, 0.008, 0.02, COL.alu, 0, 0.098, 0.04),               // kurma kolu
        bx(0.003, 0.02, 0.05, COL.dark, 0.026, 0.072, -0.07),         // kovan atma kapağı
        cy(0.007, 0.018, COL.alu, 0.03, 0.082, 0, 'x'),               // ileri itme düğmesi
        bx(0.02, 0.026, 0.014, COL.alu, 0, 0.118, 0.01),              // gez
        cy(0.015, 0.08, COL.alu, 0, 0.06, 0.075),                     // tampon borusu
        bx(0.04, 0.1, 0.13, COL.poly, 0, 0.04, 0.27));                // dipçik (birinci şahısta görünmez)
      if (fp) {
        for (let i = 0; i < 11; i++) add(bx(0.027, 0.004, 0.008, COL.alu, 0, 0.107, 0.02 - i * 0.021)); // ray dişleri
        for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) add(bx(0.004, 0.009, 0.03, COL.dark, sx * 0.0235, 0.068, -0.27 - i * 0.045)); // kundak delikleri
      }
      curvedMag(add, K, COL.steel2, { y: -0.015, z: -0.155, w: 0.028, d: 0.062, len: 0.05, n: long ? 5 : 3, tilt: 0.05, bend: 0.07 });
      muzzle.position.set(0, 0.068, -0.69);
      left = [0, 0.02, -0.34];
      break;
    }
    case 'famas': {
      add(bx(0.062, 0.1, 0.38, COL.poly2, 0, 0.04, -0.14),            // gövde (bullpup)
        bx(0.058, 0.09, 0.15, COL.poly2, 0, 0.028, 0.105, 0.24),      // arka gövde / dipçik (aşağı eğik)
        bx(0.022, 0.014, 0.38, COL.poly, 0, 0.165, -0.14),            // taşıma kolu
        bx(0.024, 0.06, 0.03, COL.poly, 0, 0.125, 0.035),
        bx(0.024, 0.06, 0.03, COL.poly, 0, 0.125, -0.31),
        bx(0.05, 0.05, 0.16, COL.poly, 0, 0.03, -0.39),               // ön kundak
        cy(0.009, 0.16, COL.steel, 0, 0.05, -0.52),                   // namlu
        cy(0.013, 0.05, COL.dark, 0, 0.05, -0.61),                    // namlu ağzı
        bx(0.03, 0.1, 0.042, COL.poly, 0, -0.05, -0.08, -0.3),        // kabza
        bx(0.03, 0.006, 0.12, COL.poly, 0, -0.012, -0.12),            // tetik korkuluğu
        bx(0.005, 0.02, 0.005, COL.dark, 0, 0.0, -0.11, 0.25),        // tetik
        cy(0.004, 0.2, COL.steel2, -0.018, 0.004, -0.42),             // katlanmış çatal ayak
        cy(0.004, 0.2, COL.steel2, 0.018, 0.004, -0.42));
      curvedMag(add, K, COL.steel2, { y: -0.005, z: 0.04, w: 0.028, d: 0.058, len: 0.05, n: long ? 4 : 3, tilt: 0.04, bend: 0.06 });
      muzzle.position.set(0, 0.05, -0.64);
      left = [0, -0.02, -0.33];
      break;
    }
    case 'mp5': {
      add(bx(0.05, 0.066, 0.3, COL.steel, 0, 0.05, -0.08),            // gövde
        cy(0.013, 0.2, COL.steel, 0, 0.088, -0.22),                   // kurma borusu
        bx(0.06, 0.056, 0.15, COL.poly, 0, 0.033, -0.3),              // el kundağı
        cy(0.01, 0.09, COL.steel, 0, 0.05, -0.41),                    // namlu
        bx(0.02, 0.03, 0.02, COL.steel, 0, 0.096, -0.33),             // arpacık ayağı
        tor(0.014, 0.003, COL.steel, 0, 0.122, -0.33),                // arpacık halkası
        bx(0.004, 0.02, 0.004, COL.steel, 0, 0.115, -0.33),           // arpacık
        cy(0.013, 0.024, COL.steel, 0, 0.096, 0.05, 'x'),             // döner gez
        bx(0.036, 0.03, 0.12, COL.poly, 0, 0.005, 0.0),               // tetik grubu
        bx(0.032, 0.1, 0.044, COL.poly, 0, -0.035, 0.03, -0.3),       // kabza
        bx(0.005, 0.02, 0.005, COL.dark, 0, -0.012, -0.03, 0.25),     // tetik
        cy(0.006, 0.03, COL.steel, -0.03, 0.09, -0.2, 'x'),           // kurma kolu
        bx(0.04, 0.05, 0.2, COL.poly, 0, 0.04, 0.2));                 // dipçik (birinci şahısta görünmez)
      curvedMag(add, K, COL.steel2, { y: 0.018, z: -0.165, w: 0.026, d: 0.05, len: 0.055, n: long ? 5 : 3, tilt: 0.1, bend: 0.17 });
      muzzle.position.set(0, 0.05, -0.46);
      left = [0, 0.0, -0.3];
      break;
    }
    case 'p90': {
      add(bx(0.066, 0.1, 0.32, COL.p90, 0, 0.03, -0.18),              // gövde
        bx(0.062, 0.092, 0.13, COL.p90, 0, 0.02, 0.03, 0.2),          // dipçik (aşağı eğik)
        mag(bx(0.05, 0.028, long ? 0.42 : 0.34, COL.poly2, 0, 0.094, long ? -0.19 : -0.15)), // üst şarjör
        cy(0.01, 0.06, COL.steel, 0, 0.04, -0.37),                    // namlu
        cy(0.014, 0.03, COL.dark, 0, 0.04, -0.4),
        bx(0.04, 0.09, 0.05, COL.p90, 0, -0.04, -0.02, -0.2),         // kabza
        bx(0.05, 0.03, 0.09, COL.p90, 0, -0.045, -0.24),              // ön tutamak
        bx(0.005, 0.02, 0.005, COL.dark, 0, -0.012, -0.065, 0.25));   // tetik
      muzzle.position.set(0, 0.04, -0.415);
      left = [0, -0.03, -0.26];
      break;
    }
    case 'awp':
    case 'scout': {
      const awp = name === 'awp';
      const body = awp ? COL.green : COL.poly;
      const bl = awp ? 0.52 : 0.46, br = awp ? 0.015 : 0.011;
      add(bx(0.066, 0.08, 0.42, body, 0, 0.03, -0.06),                // kundak
        bx(0.056, 0.055, 0.24, body, 0, 0.028, -0.38),                // ön kundak
        cy(0.017, 0.22, COL.steel, 0, 0.065, -0.12),                  // mekanizma
        cy(br + 0.004, bl, COL.steel, 0, 0.062, -0.27 - bl / 2, 'z', br), // konik namlu
        cy(0.019, 0.26, COL.alu, 0, 0.135, -0.09),                    // dürbün gövdesi
        cy(0.019, 0.06, COL.alu, 0, 0.135, -0.25, 'z', 0.03),         // objektif çanı
        cy(0.027, 0.004, COL.glass, 0, 0.135, -0.281),                // objektif camı
        cy(0.024, 0.05, COL.alu, 0, 0.135, 0.06, 'z', 0.019),         // göz merceği
        cy(0.02, 0.004, COL.glass, 0, 0.135, 0.086),
        cy(0.011, 0.024, COL.alu, 0, 0.162, -0.09, 'y'),              // ayar topuzları
        cy(0.011, 0.024, COL.alu, 0.03, 0.135, -0.09, 'x'),
        bx(0.024, 0.032, 0.016, COL.alu, 0, 0.103, -0.18),            // dürbün halkaları
        bx(0.024, 0.032, 0.016, COL.alu, 0, 0.103, 0.0),
        cy(0.004, 0.05, COL.steel, 0.04, 0.065, 0.0, 'x'),            // sürgü kolu
        sph(0.009, COL.steel, 0.066, 0.065, 0.0),
        bx(0.038, 0.1, 0.05, body, 0, -0.04, 0.035, -0.3),            // kabza
        bx(0.01, 0.006, 0.06, COL.steel, 0, -0.012, -0.02),           // tetik korkuluğu
        bx(0.005, 0.02, 0.005, COL.dark, 0, 0.0, -0.025, 0.25),       // tetik
        mag(bx(0.046, long ? 0.1 : 0.065, 0.075, COL.steel2, 0, long ? -0.043 : -0.025, -0.15)),
        bx(0.048, 0.075, 0.12, body, 0, 0.0, 0.1, 0.3),               // dipçik boynu (aşağı eğik)
        bx(0.05, 0.13, 0.28, body, 0, 0.0, 0.3));                     // dipçik (birinci şahısta görünmez)
      if (awp) add(cy(0.019, 0.05, COL.dark, 0, 0.062, -0.27 - bl - 0.02)); // namlu freni
      muzzle.position.set(0, 0.062, awp ? -0.27 - bl - 0.05 : -0.27 - bl);
      left = [0, -0.01, -0.38];
      break;
    }
    case 'glock':
    case 'usp':
    case 'deagle': {
      kind = 'pistol';
      const de = name === 'deagle', usp = name === 'usp';
      const len = de ? 0.24 : usp ? 0.21 : 0.18;
      const sh = de ? 0.052 : 0.038, sw = de ? 0.036 : 0.03, sy = 0.045;
      const slide = de ? COL.chrome : COL.steel;
      const frame = de ? COL.steel2 : COL.poly;
      const top = sy + sh / 2;
      add(bx(sw, sh, len, slide, 0, sy, -len / 2 + 0.04),             // kızak
        bx(sw - 0.004, 0.026, len - 0.04, frame, 0, sy - sh / 2 - 0.011, -len / 2 + 0.06), // gövde
        bx(0.031, 0.115, 0.052, de ? COL.rubber : frame, 0, -0.036, 0.012, -0.22), // kabza
        bx(0.008, 0.006, 0.05, frame, 0, -0.005, -0.04),              // tetik korkuluğu
        bx(0.008, 0.026, 0.006, frame, 0, 0.006, -0.064),
        bx(0.005, 0.018, 0.005, COL.dark, 0, 0.004, -0.032, 0.25),    // tetik
        bx(0.004, 0.008, 0.006, COL.dark, 0, top + 0.004, -len + 0.055), // arpacık
        bx(0.022, 0.008, 0.008, COL.dark, 0, top + 0.004, 0.032),     // gez
        cy(de ? 0.0095 : 0.0068, 0.008, COL.dark, 0, sy + 0.004, -len + 0.037), // namlu ucu
        mag(bx(0.033, long ? 0.04 : 0.01, 0.055, frame, 0, long ? -0.106 : -0.093, long ? 0.03 : 0.025, -0.22)));
      if (de) add(bx(0.012, 0.01, len - 0.03, COL.chrome, 0, top + 0.005, -len / 2 + 0.035)); // Deagle üst rayı
      if (fp) for (let i = 0; i < 6; i++) add(bx(sw + 0.0012, sh * 0.7, 0.0024, COL.dark, 0, sy - sh * 0.1, 0.03 - i * 0.007)); // kızak tırtılları
      muzzle.position.set(0, sy, -len + 0.03);
      left = [-0.02, -0.04, 0.02];
      break;
    }
    case 'knife': {
      kind = 'knife';
      // Bıçak ağzı: sırtı düz, ağzı uca doğru kıvrılan profil (kenarları pahlı)
      const s = new THREE.Shape();
      s.moveTo(0, -0.012);
      s.lineTo(0.12, -0.012);
      s.quadraticCurveTo(0.19, -0.01, 0.208, 0.006);
      s.lineTo(0.17, 0.013);
      s.lineTo(0, 0.013);
      s.closePath();
      const bg = cachedGeo(`knife${fp}`, () => {
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0014, bevelSegments: 1, curveSegments: fp ? 10 : 4 });
        geo.translate(0, 0, -0.0015);
        return geo;
      });
      const blade = new THREE.Mesh(bg, COL.blade);
      blade.rotation.y = Math.PI / 2;
      blade.position.set(0, 0.004, -0.045);
      add(blade,
        bx(0.024, 0.03, 0.11, COL.rubber, 0, 0, 0.02),                // sap
        bx(0.05, 0.012, 0.012, COL.grey, 0, 0.002, -0.04),            // siper
        bx(0.026, 0.032, 0.012, COL.grey, 0, 0, 0.078));              // sap sonu
      if (fp) for (let i = 0; i < 4; i++) add(bx(0.0255, 0.031, 0.004, COL.poly, 0, 0, -0.012 + i * 0.02)); // sap oyukları
      muzzle.position.set(0, 0, -0.25);
      break;
    }
    case 'he':
    case 'flash':
    case 'smoke': {
      kind = 'nade';
      if (name === 'he') {
        add(sph(0.036, COL.olive, 0, 0.03, -0.03, 1.2));              // gövde (yumurta biçimi)
        if (fp) for (const y of [0.012, 0.048]) add(tor(0.0326, 0.0022, COL.olive, 0, y, -0.03, Math.PI / 2)); // gövde çizgileri
      } else {
        add(cy(0.032, 0.1, name === 'flash' ? COL.white : COL.paint, 0, 0.03, -0.03, 'y'));
        if (name === 'smoke') add(cy(0.0325, 0.016, COL.red, 0, 0.05, -0.03, 'y'));
        if (name === 'flash') add(cy(0.0325, 0.008, COL.dark, 0, 0.0, -0.03, 'y'), cy(0.0325, 0.008, COL.dark, 0, 0.06, -0.03, 'y'));
      }
      add(cy(0.013, 0.022, COL.steel2, 0, name === 'he' ? 0.083 : 0.088, -0.03, 'y'), // tapa
        bx(0.005, 0.08, 0.014, COL.steel2, 0.035, 0.05, -0.03, 0, 0, 0.12), // kaşık
        tor(0.011, 0.0018, COL.steel2, -0.019, 0.096, -0.03, 0, Math.PI / 2)); // pim halkası
      muzzle.position.set(0, 0.05, -0.05);
      break;
    }
    case 'bomb': {
      kind = 'bomb';
      const brick = mat(0x6b5536, 0.85, 0, MATTE);
      add(bx(0.24, 0.07, 0.15, COL.tan, 0, 0, 0),
        bx(0.07, 0.075, 0.14, brick, -0.06, 0.005, 0),
        bx(0.07, 0.075, 0.14, brick, 0.06, 0.005, 0),
        bx(0.1, 0.02, 0.06, COL.poly, 0, 0.045, 0.02),
        box(0.06, 0.005, 0.02, COL.screen, 0, 0.056, -0.0));
      if (fp) for (let i = 0; i < 9; i++) add(bx(0.012, 0.004, 0.009, COL.grey, -0.016 + (i % 3) * 0.016, 0.057, 0.025 + Math.floor(i / 3) * 0.012)); // tuş takımı
      muzzle.position.set(0, 0.06, 0);
      break;
    }
    default:
      add(bx(0.05, 0.08, 0.4, COL.steel, 0, 0.04, -0.15));
      muzzle.position.set(0, 0.04, -0.36);
  }
  const leftV = left ? new THREE.Vector3(...left) : null;
  applyAttachments(K, g, name, kind, atts, muzzle, leftV);
  // Birinci şahısta dipçik kameraya çok yakın kalıp ekranı kapatıyor; çıkar
  if (fp && kind === 'rifle') for (const c of [...g.children]) if (c.isMesh && c.position.z > 0.12) g.remove(c);
  mergeChildren(g, fp ? VM_MAT : WORLD_MAT);
  g.userData = { muzzle, left: leftV, kind, name };
  return g;
}

// ---------------------------------------------------------------- Eklentiler
function applyAttachments(K, g, name, kind, atts, muzzle, left) {
  if (!atts || !atts.length) return;
  const { bx, cy } = K;
  if (atts.includes('sil')) {
    const pistol = kind === 'pistol';
    const r = pistol ? 0.017 : 0.024, len = pistol ? 0.12 : 0.2;
    const { x, y, z } = muzzle.position;
    g.add(cy(r, len, ATT_MAT, x, y, z - len / 2 + 0.01));
    if (K.fp) g.add(cy(r + 0.0015, 0.012, COL.dark, x, y, z + 0.004), cy(r + 0.0015, 0.012, COL.dark, x, y, z - len + 0.016)); // uç halkaları
    muzzle.position.z -= len;
  }
  if (atts.includes('dot') && RAIL[name] !== undefined) {
    const y = RAIL[name];
    g.add(bx(0.03, 0.016, 0.07, ATT_MAT, 0, y + 0.008, -0.1));      // ray tabanı
    g.add(bx(0.036, 0.006, 0.012, ATT_MAT, 0, y + 0.05, -0.12));    // çerçeve üst
    g.add(bx(0.006, 0.034, 0.012, ATT_MAT, -0.015, y + 0.033, -0.12));
    g.add(bx(0.006, 0.034, 0.012, ATT_MAT, 0.015, y + 0.033, -0.12));
    if (K.fp) g.add(bx(0.008, 0.006, 0.01, COL.dark, 0, y + 0.019, -0.1)); // nokta yayıcı
  }
  if (atts.includes('grip') && left) g.add(cy(0.014, 0.075, ATT_MAT, 0, left.y - 0.06, left.z + 0.02, 'y'));
}

// ---------------------------------------------------------------- Birinci şahıs kollar
function createArms(kind, team, left) {
  const K = kit(true);
  const g = new THREE.Group();
  const sleeve = mat(team === 'T' ? 0x5e4a30 : 0x2f3c52, 0.92, 0, MATTE);
  const cuff = mat(team === 'T' ? 0x4a3a25 : 0x243043, 0.95, 0, MATTE);
  const glove = mat(team === 'T' ? 0x2b2620 : 0x1a1a1a, 0.72, 0, MATTE);
  const arm = (hand, elbow) => {
    g.add(K.capsule(hand, elbow, 0.04, sleeve));
    const d = new THREE.Vector3(...elbow).sub(new THREE.Vector3(...hand)).normalize().multiplyScalar(0.05);
    g.add(K.capsule(hand, [hand[0] + d.x, hand[1] + d.y, hand[2] + d.z], 0.043, cuff)); // kol ağzı
  };
  if (kind === 'bomb') {
    g.add(K.bx(0.08, 0.06, 0.1, glove, -0.14, 0, 0), K.bx(0.08, 0.06, 0.1, glove, 0.14, 0, 0));
    arm([-0.14, -0.01, 0.06], [-0.24, -0.2, 0.35]);
    arm([0.14, -0.01, 0.06], [0.24, -0.2, 0.35]);
    mergeChildren(g, VM_MAT);
    return g;
  }
  // Sağ el: kabzayı kavrayan avuç ve öne dolanan parmaklar
  g.add(K.bx(0.058, 0.07, 0.08, glove, 0.006, -0.04, 0.04, -0.3),
    K.bx(0.046, 0.05, 0.03, glove, -0.006, -0.032, -0.004, -0.3));
  arm([0.008, -0.07, 0.085], [0.09, -0.24, 0.44]);
  if (kind === 'rifle' && left) {
    g.add(K.bx(0.07, 0.055, 0.1, glove, left.x - 0.01, left.y - 0.03, left.z),
      K.bx(0.02, 0.04, 0.08, glove, left.x + 0.03, left.y - 0.005, left.z)); // başparmak yanı
    arm([left.x - 0.02, left.y - 0.05, left.z + 0.045], [-0.2, -0.24, 0.12]);
  } else if (kind === 'pistol') {
    g.add(K.bx(0.056, 0.056, 0.085, glove, -0.036, -0.05, 0.04, -0.3));
    arm([-0.04, -0.07, 0.08], [-0.17, -0.25, 0.4]);
  }
  mergeChildren(g, VM_MAT);
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
  rifle: { pos: [0.16, -0.17, -0.48], rot: [0.02, 0.2, -0.04] },
  pistol: { pos: [0.15, -0.15, -0.41], rot: [0.03, 0.16, -0.03] },
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
