// Paylaşılan fizik: oyuncu hareketi, ışın testleri ve bomba (el bombası) simülasyonu.
// Haritadaki her şey eksene hizalı kutu olduğu için çarpışma basit AABB testleriyle yapılıyor.

export const GRAVITY = 20;
export const JUMP_V = 6.8;
export const PLAYER_HW = 0.4;
export const STAND_H = 1.8;
export const CROUCH_H = 1.25;
export const STAND_EYE = 1.65;
export const CROUCH_EYE = 1.1;
export const STEP_H = 0.45;
export const NADE_DT = 1 / 60;
export const NADE_FUSE = { he: 1.6, flash: 1.4, smoke: 1.8 };

export function boxHit(boxes, x, y, z, hw, h) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + hw > b.min[0] && x - hw < b.max[0] &&
        z + hw > b.min[2] && z - hw < b.max[2] &&
        y + h > b.min[1] && y < b.max[1]) return b;
  }
  return null;
}

// p ve v {x,y,z} nesneleri (THREE.Vector3 de olur). Yerde mi bilgisini döndürür.
export function movePlayer(boxes, p, v, dt, h) {
  const hw = PLAYER_HW;
  const stuck = boxHit(boxes, p.x, p.y, p.z, hw, h);

  for (const axis of ['x', 'z']) {
    if (v[axis] === 0) continue;
    const old = p[axis];
    p[axis] = old + v[axis] * dt;
    if (stuck) continue;
    const b = boxHit(boxes, p.x, p.y, p.z, hw, h);
    if (!b) continue;
    // Basamak çıkma: alçak engelin üstüne otomatik çık
    if (b.max[1] - p.y <= STEP_H && !boxHit(boxes, p.x, b.max[1] + 0.001, p.z, hw, h)) {
      p.y = b.max[1] + 0.001;
    } else {
      p[axis] = old;
      v[axis] = 0;
    }
  }

  v.y = Math.max(-30, v.y - GRAVITY * dt);
  let ny = p.y + v.y * dt;
  let grounded = false;
  if (ny <= 0) { ny = 0; if (v.y < 0) v.y = 0; grounded = true; }
  const b = boxHit(boxes, p.x, ny, p.z, hw, h);
  if (b && !stuck) {
    if (v.y <= 0) { ny = b.max[1]; grounded = true; } else { ny = b.min[1] - h; }
    v.y = 0;
  }
  p.y = ny;
  return grounded;
}

// Işın - kutu kesişimi. {t, axis, sign} ya da null döner.
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = 0, tmax = Infinity, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let t1 = (min[a] - o[a]) / d[a];
      let t2 = (max[a] - o[a]) / d[a];
      let s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { t: tmin, axis, sign };
}

export function raycastWorld(boxes, o, d, maxDist) {
  let best = maxDist, normal = null;
  if (d[1] < -1e-9) {
    const t = -o[1] / d[1];
    if (t >= 0 && t < best) { best = t; normal = [0, 1, 0]; }
  }
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const h = rayAABB(o[0], o[1], o[2], d[0], d[1], d[2], b.min, b.max);
    if (h && h.t < best) {
      best = h.t;
      normal = [0, 0, 0];
      if (h.axis >= 0) normal[h.axis] = h.sign; else normal[1] = 1;
    }
  }
  return {
    t: best, hit: !!normal, normal: normal || [0, 1, 0],
    point: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best],
  };
}

// Verilen noktanın altındaki zemin yüksekliği (sandık üstü ya da 0)
export function groundAt(boxes, x, z, maxY) {
  let g = 0;
  for (const b of boxes) {
    if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= maxY + 0.05 && b.max[1] > g) g = b.max[1];
  }
  return g;
}

// El bombası için sabit adımlı simülasyon. n = {p:[x,y,z], v:[x,y,z], steps}
// Sekme hızını döndürür (ses için).
export function stepNade(boxes, n) {
  const dt = NADE_DT, r = 0.07;
  n.v[1] -= GRAVITY * dt;
  let bounced = 0;
  for (let a = 0; a < 3; a++) {
    const old = n.p[a];
    n.p[a] += n.v[a] * dt;
    let hit = false;
    if (a === 1 && n.p[1] < r) { n.p[1] = r; hit = true; }
    else if (boxHit(boxes, n.p[0], n.p[1] - r, n.p[2], r, 2 * r)) { n.p[a] = old; hit = true; }
    if (hit) {
      const sp = Math.abs(n.v[a]);
      if (sp > bounced) bounced = sp;
      n.v[a] = -n.v[a] * 0.45;
      const fr = a === 1 && sp < 2 ? 0.94 : 0.75;
      n.v[(a + 1) % 3] *= fr;
      n.v[(a + 2) % 3] *= fr;
      if (a === 1 && Math.abs(n.v[1]) < 0.8) n.v[1] = 0;
    }
  }
  n.steps = (n.steps || 0) + 1;
  return bounced;
}
