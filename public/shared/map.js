// Paylaşılan harita tanımları (sunucu + istemci aynı veriyi kullanır).
// Her harita 2 metrelik hücrelerden oluşan bir ızgara: önce her yer duvar, sonra koridorlar oyulur.
// '#' duvar, '.' zemin, 'C' büyük sandık (2.1 m), 'c' küçük sandık (1.1 m, üstüne zıplanabilir).

export const CELL = 2;

function grid(w, h) {
  const g = Array.from({ length: h }, () => new Array(w).fill('#'));
  const carve = (c1, r1, c2, r2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = '.'; };
  const put = (ch, list) => { for (const [c, r] of list) g[r][c] = ch; };
  const line = (ch, c1, r1, c2, r2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = ch; };
  return { g, carve, put, line };
}

// ---------------------------------------------------------------- de_kum: çöl kasabası, 3 koridor
function kum() {
  const { g, carve, put } = grid(48, 40);
  carve(1, 1, 13, 12);   // B bölgesi
  carve(16, 1, 31, 11);  // CT doğuş
  carve(34, 1, 46, 12);  // A bölgesi
  carve(14, 4, 15, 6);   // B <-> CT kapısı
  carve(32, 5, 33, 7);   // A <-> CT geçidi
  carve(4, 13, 7, 31);   // B tünelleri
  carve(22, 12, 25, 31); // orta koridor
  carve(40, 13, 44, 31); // uzun A
  carve(8, 21, 21, 22);  // ortadan B'ye geçit
  carve(26, 16, 39, 17); // ortadan A'ya (catwalk)
  carve(4, 30, 44, 32);  // güney geçidi
  carve(15, 33, 32, 38); // T doğuş
  put('#', [[22, 14], [25, 14]]);
  put('C', [[3, 3], [4, 3], [9, 6], [11, 10], [12, 10], [36, 3], [41, 6], [42, 6], [45, 11], [29, 3],
    [24, 25], [43, 20], [7, 26], [10, 31], [36, 30], [29, 36]]);
  put('c', [[5, 3], [9, 7], [10, 6], [6, 9], [37, 3], [41, 7], [45, 10], [38, 10], [18, 8], [28, 3],
    [23, 25], [43, 21], [41, 27], [5, 17], [32, 16], [14, 22], [11, 31], [37, 30], [18, 35], [28, 36], [23, 34]]);
  return {
    w: 48, h: 40, g,
    sites: { A: [36, 2, 45, 11], B: [2, 2, 12, 11] },
    spawnT: [16, 34, 30, 38], spawnCT: [17, 2, 29, 6],
    buyT: [15, 33, 32, 38], buyCT: [16, 1, 31, 11],
    yawT: 0, yawCT: Math.PI,
  };
}

// ---------------------------------------------------------------- de_depo: endüstriyel depo, raflı ana salon
function depo() {
  const { g, carve, put } = grid(40, 32);
  carve(1, 12, 6, 19);   // T doğuş (batı)
  carve(33, 12, 38, 19); // CT doğuş (doğu)
  carve(12, 8, 27, 23);  // ana salon
  carve(1, 2, 38, 5);    // kuzey koridoru
  carve(1, 26, 38, 29);  // güney koridoru
  carve(28, 1, 37, 7);   // A: yükleme rampası
  carve(28, 24, 37, 30); // B: konteyner sahası
  carve(7, 14, 11, 17);  // T -> salon
  carve(2, 6, 5, 11);    // T -> kuzey
  carve(2, 20, 5, 25);   // T -> güney
  carve(18, 6, 21, 7);   // salon -> kuzey
  carve(18, 24, 21, 25); // salon -> güney
  carve(34, 8, 37, 11);  // CT -> A
  carve(34, 20, 37, 23); // CT -> B
  carve(28, 14, 32, 17); // salon -> CT
  // Salondaki raf sıraları (ortada ve kenarlarda geçit bırakılır)
  for (const r of [11, 14, 17, 20]) for (const c of [14, 15, 16, 17, 22, 23, 24, 25]) put('C', [[c, r]]);
  put('C', [[9, 2], [9, 3], [30, 3], [31, 3], [35, 6], [30, 27], [31, 27], [35, 25], [9, 28], [9, 29], [5, 18], [34, 18]]);
  put('c', [[24, 5], [32, 3], [29, 6], [32, 27], [29, 25], [24, 26], [3, 14], [36, 14], [10, 15], [29, 16], [19, 9], [20, 22]]);
  return {
    w: 40, h: 32, g,
    sites: { A: [29, 1, 37, 7], B: [29, 24, 37, 30] },
    spawnT: [2, 13, 6, 19], spawnCT: [33, 13, 37, 19],
    buyT: [1, 12, 6, 19], buyCT: [33, 12, 38, 19],
    yawT: -Math.PI / 2, yawCT: Math.PI / 2,
  };
}

// ---------------------------------------------------------------- de_kar: karlı kış üssü, geniş orta avlu
function kar() {
  const { g, carve, put } = grid(44, 36);
  carve(17, 1, 26, 6);   // CT doğuş (kuzey)
  carve(17, 29, 26, 34); // T doğuş (güney)
  carve(31, 3, 42, 12);  // A bölgesi
  carve(1, 3, 12, 12);   // B bölgesi
  carve(15, 12, 28, 23); // orta avlu
  carve(4, 13, 7, 28);   // batı yolu (B)
  carve(36, 13, 39, 28); // doğu yolu (A)
  carve(4, 25, 39, 28);  // güney caddesi
  carve(18, 24, 25, 24); // avlu -> cadde
  carve(20, 7, 23, 11);  // avlu -> CT
  carve(27, 3, 30, 5);   // CT -> A
  carve(13, 3, 16, 5);   // CT -> B
  carve(29, 15, 35, 17); // avlu -> doğu yolu
  carve(8, 18, 14, 20);  // batı yolu -> avlu
  put('C', [[18, 15], [19, 15], [25, 19], [25, 20], [16, 21], [33, 6], [34, 6], [40, 10], [3, 6], [4, 6], [10, 10],
    [12, 26], [30, 27], [22, 17]]);
  put('c', [[20, 15], [22, 18], [24, 20], [35, 6], [39, 10], [5, 6], [9, 10], [13, 26], [31, 27], [5, 17], [38, 21], [19, 3], [24, 31], [21, 13]]);
  return {
    w: 44, h: 36, g,
    sites: { A: [32, 4, 41, 11], B: [2, 4, 11, 11] },
    spawnT: [18, 30, 26, 34], spawnCT: [18, 1, 26, 5],
    buyT: [17, 29, 26, 34], buyCT: [17, 1, 26, 6],
    yawT: 0, yawCT: Math.PI,
  };
}

// ---------------------------------------------------------------- dm_arena: küçük simetrik arena (sadece ölüm maçı)
function arena() {
  const { g, carve, put, line } = grid(28, 28);
  carve(1, 1, 26, 26);
  for (const [c, r] of [[6, 6], [19, 6], [6, 19], [19, 19]]) line('#', c, r, c + 2, r + 2);
  line('#', 13, 13, 14, 14);
  for (const r of [4, 23]) { line('#', 10, r, 12, r); line('#', 15, r, 17, r); }
  for (const c of [4, 23]) { line('#', c, 10, c, 12); line('#', c, 15, c, 17); }
  put('C', [[2, 2], [25, 25], [2, 25], [25, 2], [13, 9], [14, 18], [9, 14], [18, 13]]);
  put('c', [[3, 13], [24, 14], [13, 3], [14, 24], [9, 9], [18, 18], [9, 18], [18, 9], [12, 9], [15, 18], [9, 15], [18, 12]]);
  return {
    w: 28, h: 28, g,
    sites: null,
    spawnT: [2, 22, 4, 26], spawnCT: [23, 1, 25, 5],
    buyT: [1, 21, 5, 26], buyCT: [22, 1, 26, 6],
    yawT: -Math.PI / 4, yawCT: Math.PI / 4 * 3,
    wallH: () => 3.6,
  };
}

export const MAPS = {
  kum: { title: 'de_kum', desc: 'Çöl kasabası · 3 koridor', theme: 'desert', modes: ['classic', 'tdm', 'ffa'], def: kum },
  depo: { title: 'de_depo', desc: 'Endüstriyel depo · raflar', theme: 'industrial', modes: ['classic', 'tdm', 'ffa'], def: depo },
  kar: { title: 'de_kar', desc: 'Kış üssü · geniş avlu', theme: 'snow', modes: ['classic', 'tdm', 'ffa'], def: kar },
  arena: { title: 'dm_arena', desc: 'Küçük arena · hızlı çatışma', theme: 'arena', modes: ['tdm', 'ffa'], def: arena },
};
export const MAP_IDS = Object.keys(MAPS);

const cache = new Map();

export function buildMap(id = 'kum') {
  if (!MAPS[id]) id = 'kum';
  if (cache.has(id)) return cache.get(id);
  const info = MAPS[id];
  const def = info.def();
  const { w, h, g } = def;
  const ox = -w * CELL / 2, oz = -h * CELL / 2;
  const cx = (c) => ox + (c + 0.5) * CELL;
  const cz = (r) => oz + (r + 0.5) * CELL;
  const rect = ([c1, r1, c2, r2]) => ({ x0: ox + c1 * CELL, z0: oz + r1 * CELL, x1: ox + (c2 + 1) * CELL, z1: oz + (r2 + 1) * CELL });
  const boxes = [];
  const used = g.map((row) => row.map(() => false));

  // Duvar hücrelerini büyük dikdörtgenlere birleştir (daha az kutu = daha hızlı çarpışma ve çizim)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (g[r][c] !== '#' || used[r][c]) continue;
      let ww = 1;
      while (c + ww < w && g[r][c + ww] === '#' && !used[r][c + ww]) ww++;
      let hh = 1;
      outer: while (r + hh < h) {
        for (let k = 0; k < ww; k++) if (g[r + hh][c + k] !== '#' || used[r + hh][c + k]) break outer;
        hh++;
      }
      for (let rr = r; rr < r + hh; rr++) for (let cc = c; cc < c + ww; cc++) used[rr][cc] = true;
      const border = c === 0 || r === 0 || c + ww === w || r + hh === h;
      const height = border ? 9 : def.wallH ? def.wallH(c, r) : 6.5 + ((c * 7 + r * 3) % 3) * 1.25;
      boxes.push({ min: [ox + c * CELL, 0, oz + r * CELL], max: [ox + (c + ww) * CELL, height, oz + (r + hh) * CELL], type: 'wall', v: (c + r) % 2, border });
    }
  }
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = g[r][c];
      if (ch !== 'c' && ch !== 'C') continue;
      const inset = ch === 'c' ? 0.15 : 0.05;
      const ht = ch === 'c' ? 1.1 : 2.1;
      boxes.push({ min: [ox + c * CELL + inset, 0, oz + r * CELL + inset], max: [ox + (c + 1) * CELL - inset, ht, oz + (r + 1) * CELL - inset], type: 'crate', big: ch === 'C' });
    }
  }

  const spawnList = ([c1, r1, c2, r2]) => {
    const out = [];
    for (let r = r1; r <= r2; r += 2) for (let c = c1; c <= c2; c += 2) if (g[r][c] === '.') out.push([cx(c), 0, cz(r)]);
    return out;
  };
  const dmSpawns = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (g[r][c] === '.') dmSpawns.push([cx(c), 0, cz(r)]);
  const zone = (cells) => { const R = rect(cells); return { x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, r: Math.hypot(R.x1 - R.x0, R.z1 - R.z0) / 2 }; };
  const sites = {};
  if (def.sites) for (const k of Object.keys(def.sites)) sites[k] = rect(def.sites[k]);

  const map = {
    id, title: info.title, desc: info.desc, theme: info.theme, modes: info.modes,
    w, h, ox, oz, grid: g, boxes, dmSpawns,
    spawns: { T: spawnList(def.spawnT), CT: spawnList(def.spawnCT) },
    yaw: { T: def.yawT, CT: def.yawCT },
    sites,
    buyZones: { T: zone(def.buyT), CT: zone(def.buyCT) },
    bounds: { x0: ox, z0: oz, x1: ox + w * CELL, z1: oz + h * CELL },
    siteAt(x, z) {
      for (const k of Object.keys(sites)) {
        const s = sites[k];
        if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return k;
      }
      return null;
    },
    inBuyZone(team, x, z) {
      const b = map.buyZones[team];
      return !!b && Math.hypot(x - b.x, z - b.z) <= b.r;
    },
  };
  cache.set(id, map);
  return map;
}
