// Paylaşılan harita tanımı: sunucu ve istemci aynı veriyi kullanır.
// Harita 2 metrelik hücrelerden oluşan bir ızgara. Önce her yer duvar, sonra koridorlar oyulur.

export const CELL = 2;
export const MAP_W = 48;
export const MAP_H = 40;
export const OX = -MAP_W * CELL / 2;
export const OZ = -MAP_H * CELL / 2;

const cx = (c) => OX + (c + 0.5) * CELL;
const cz = (r) => OZ + (r + 0.5) * CELL;
const rect = (c1, r1, c2, r2) => ({
  x0: OX + c1 * CELL, z0: OZ + r1 * CELL,
  x1: OX + (c2 + 1) * CELL, z1: OZ + (r2 + 1) * CELL,
});

export const SITES = { A: rect(36, 2, 45, 11), B: rect(2, 2, 12, 11) };
export const BUY_ZONES = { T: { x: 0, z: 32, r: 19 }, CT: { x: 0, z: -27, r: 19 } };

function makeGrid() {
  const g = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill('#'));
  const carve = (c1, r1, c2, r2) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = '.';
  };
  const put = (ch, list) => { for (const [c, r] of list) g[r][c] = ch; };

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

  put('#', [[22, 14], [25, 14]]); // orta kapı
  // C = büyük sandık (2.1 m), c = küçük sandık (1.1 m, üstüne zıplanabilir)
  put('C', [[3, 3], [4, 3], [9, 6], [11, 10], [12, 10], [36, 3], [41, 6], [42, 6], [45, 11], [29, 3],
    [24, 25], [43, 20], [7, 26], [10, 31], [36, 30], [29, 36]]);
  put('c', [[5, 3], [9, 7], [10, 6], [6, 9], [37, 3], [41, 7], [45, 10], [38, 10], [18, 8], [28, 3],
    [23, 25], [43, 21], [41, 27], [5, 17], [32, 16], [14, 22], [11, 31], [37, 30], [18, 35], [28, 36], [23, 34]]);
  return g;
}

function spawnList(g, cols, rows) {
  const out = [];
  for (const r of rows) for (const c of cols) if (g[r][c] === '.') out.push([cx(c), 0, cz(r)]);
  return out;
}

export function buildMap() {
  const grid = makeGrid();
  const boxes = [];
  const used = grid.map((row) => row.map(() => false));

  // Duvar hücrelerini büyük dikdörtgenlere birleştir (daha az kutu = daha hızlı çarpışma)
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      if (grid[r][c] !== '#' || used[r][c]) continue;
      let w = 1;
      while (c + w < MAP_W && grid[r][c + w] === '#' && !used[r][c + w]) w++;
      let h = 1;
      outer: while (r + h < MAP_H) {
        for (let k = 0; k < w; k++) if (grid[r + h][c + k] !== '#' || used[r + h][c + k]) break outer;
        h++;
      }
      for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used[rr][cc] = true;
      const border = c === 0 || r === 0 || c + w === MAP_W || r + h === MAP_H;
      const height = border ? 9 : 6.5 + ((c * 7 + r * 3) % 3) * 1.25;
      boxes.push({
        min: [OX + c * CELL, 0, OZ + r * CELL],
        max: [OX + (c + w) * CELL, height, OZ + (r + h) * CELL],
        type: 'wall', v: (c + r) % 2,
      });
    }
  }
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const ch = grid[r][c];
      if (ch !== 'c' && ch !== 'C') continue;
      const inset = ch === 'c' ? 0.15 : 0.05;
      const h = ch === 'c' ? 1.1 : 2.1;
      boxes.push({
        min: [OX + c * CELL + inset, 0, OZ + r * CELL + inset],
        max: [OX + (c + 1) * CELL - inset, h, OZ + (r + 1) * CELL - inset],
        type: 'crate', big: ch === 'C',
      });
    }
  }

  // Ölüm maçı modları için haritanın her yerindeki boş hücreler doğuş noktası olabilir
  const dmSpawns = [];
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) if (grid[r][c] === '.') dmSpawns.push([cx(c), 0, cz(r)]);

  return {
    grid, boxes, dmSpawns,
    spawns: {
      T: spawnList(grid, [16, 18, 20, 22, 24, 26, 28, 30], [34, 36, 38]),
      CT: spawnList(grid, [17, 19, 21, 23, 25, 27, 29], [2, 4, 6]),
    },
    sites: SITES,
    buyZones: BUY_ZONES,
    bounds: { x0: OX, z0: OZ, x1: OX + MAP_W * CELL, z1: OZ + MAP_H * CELL },
  };
}

export function siteAt(x, z) {
  for (const k of Object.keys(SITES)) {
    const s = SITES[k];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return k;
  }
  return null;
}

export function inBuyZone(team, x, z) {
  const b = BUY_ZONES[team];
  return !!b && Math.hypot(x - b.x, z - b.z) <= b.r;
}
