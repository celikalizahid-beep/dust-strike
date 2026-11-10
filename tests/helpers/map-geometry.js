// Harita testleri için geometri yardımcıları (yalnızca testlerde kullanılır).
// Görüş testi kuş bakışı ızgarada yapılır ve yalnızca tam boy duvar hücrelerini ('#') engel sayar:
// sandık, kapı kanadı, pencere pervazı gibi alçak ya da ince engeller görmezden gelinir. Böylece test
// zıplayan ya da sandık üstüne çıkan oyuncuları da kapsar (sonuç gerçekte olduğundan daha katıdır).
import { CELL } from '../../public/shared/map.js';
import { boxHit, PLAYER_HW, STAND_H, STEP_H } from '../../public/shared/physics.js';

const EPS = 0.01;

// İki nokta arasındaki doğru (hücre biriminde) bir duvar hücresinin içinden geçiyor mu?
export function clearLine(map, ax, az, bx, bz) {
  const g = map.grid;
  let c = Math.floor(ax), r = Math.floor(az);
  const cEnd = Math.floor(bx), rEnd = Math.floor(bz);
  const dx = bx - ax, dz = bz - az;
  const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDeltaR = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tC = dx !== 0 ? ((dx > 0 ? c + 1 : c) - ax) / dx : Infinity;
  let tR = dz !== 0 ? ((dz > 0 ? r + 1 : r) - az) / dz : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    if (r < 0 || c < 0 || r >= map.h || c >= map.w || g[r][c] === '#') return false;
    if (c === cEnd && r === rEnd) return true;
    if (Math.min(tC, tR) > 1) return true; // doğru bu hücrede bitti
    // Tam köşeden geçen doğru çapraz ilerler (iki duvarın arasındaki sıfır genişlikli aralık görüş sayılır: katı taraf)
    if (Math.abs(tC - tR) < 1e-12) { c += stepC; r += stepR; tC += tDeltaC; tR += tDeltaR; }
    else if (tC < tR) { c += stepC; tC += tDeltaC; }
    else { r += stepR; tR += tDeltaR; }
  }
  throw new Error('clearLine: döngü bitmedi');
}

// Kare bir alanın çevresindeki örnek noktalar (alanın içindeki her nokta için görüş, çevreden geçer)
function perimeter(x0, z0, x1, z1, perSide) {
  const pts = [];
  for (let k = 0; k <= perSide; k++) {
    const f = k / perSide;
    pts.push([x0 + (x1 - x0) * f, z0], [x0 + (x1 - x0) * f, z1], [x0, z0 + (z1 - z0) * f], [x1, z0 + (z1 - z0) * f]);
  }
  return pts;
}
export const cellPoints = (c, r) => perimeter(c + EPS, r + EPS, c + 1 - EPS, r + 1 - EPS, 8);

// Doğuş noktasındaki oyuncunun kapladığı alan (gövde yarı genişliği 0,4 m + 0,1 m pay), hücre biriminde
export function spawnPoints(map, s) {
  const x = (s[0] - map.ox) / CELL, z = (s[2] - map.oz) / CELL, hw = (PLAYER_HW + 0.1) / CELL;
  return perimeter(x - hw, z - hw, x + hw, z + hw, 4);
}

export function anyLine(map, from, to) {
  for (const a of from) for (const b of to) if (clearLine(map, a[0], a[1], b[0], b[1])) return true;
  return false;
}

// Bir bölgenin (hücre dikdörtgenleri) duvar olmayan hücreleri
export function zoneCells(map, rects) {
  const out = [];
  const seen = new Set();
  for (const [c1, r1, c2, r2] of rects) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (map.grid[r][c] === '#' || seen.has(r * 1000 + c)) continue;
      seen.add(r * 1000 + c);
      out.push([c, r]);
    }
  }
  return out;
}

export const cellOf = (map, x, z) => [Math.floor((x - map.ox) / CELL), Math.floor((z - map.oz) / CELL)];
export const cellCenter = (map, c, r) => [map.ox + (c + 0.5) * CELL, map.oz + (r + 0.5) * CELL];

// Yürüyerek (zıplamadan) ulaşılabilen yerler: oyuncu gövdesinin sığdığı 0,5 m aralıklı noktalar üzerinde
// genişlik öncelikli arama. Basamaklar (en çok STEP_H) çıkılır, her yükseklikten aşağı inilir.
// Dönen küme, ulaşılan ızgara hücrelerinin "c,r" anahtarlarıdır.
export function walkableCells(map, start) {
  const STEP = 0.5;
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
  const key = (x, z) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
  const snap = (v) => Math.round(v / STEP) * STEP;
  const sx = snap(start[0]), sz = snap(start[2]);
  const sy = floorUnder(sx, sz, start[1]);
  if (!fits(sx, sz, sy)) throw new Error(`walkableCells: başlangıç noktası dolu (${start})`);
  const seen = new Map([[key(sx, sz), sy]]);
  const queue = [[sx, sz, sy]];
  const cells = new Set();
  while (queue.length) {
    const [x, z, y] = queue.pop();
    cells.add(cellOf(map, x, z).join(','));
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx, nz = z + dz;
      if (nx <= map.bounds.x0 || nx >= map.bounds.x1 || nz <= map.bounds.z0 || nz >= map.bounds.z1) continue;
      const ny = floorUnder(nx, nz, y);
      if (!fits(nx, nz, ny)) continue;
      const k = key(nx, nz);
      // Aynı noktaya daha yüksekten de gelinebilir (platform kenarı); en yüksek zemin yeterli
      if (seen.has(k) && seen.get(k) >= ny) continue;
      seen.set(k, ny);
      queue.push([nx, nz, ny]);
    }
  }
  return cells;
}
