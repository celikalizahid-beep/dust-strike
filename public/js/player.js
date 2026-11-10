// Oyuncu modeli: yuvarlak hatlı, eklemli asker (diz, dirsek, bel, boyun). Gövde tek bir SkinnedMesh'tir (oyuncu
// başına tek çizim çağrısı); geometri takım başına bir kez üretilip paylaşılır, her oyuncunun kendi iskeleti vardır.
// Duruş hesabı (yürüme, eğilme, silahı tutuş) rig.js içindedir; burada eklem konumları kemik dönüşlerine çevrilir.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RIG, SHOULDERS, poseBody, poseArms } from './rig.js';
import { createWeaponModel, mat, mergeGeometry, WORLD_MAT, METAL, MATTE } from './models.js';

// ---------------------------------------------------------------- İskelet
// Kemikler ve duruşsuz (bağlama) konumları: ayakta, kollar yanda aşağı sarkık. [ad, üst kemik, model uzayında konum]
const KNEE_Y = RIG.hipY - RIG.thigh, ELBOW_Y = RIG.shoulderY - RIG.upperArm, HAND_Y = ELBOW_Y - RIG.foreArm;
const SR = [SHOULDERS.right[0], RIG.shoulderY + SHOULDERS.right[1], SHOULDERS.right[2]];
const SL = [SHOULDERS.left[0], RIG.shoulderY + SHOULDERS.left[1], SHOULDERS.left[2]];
const BIND = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, RIG.hipY, 0]],
  ['spine', 'hips', [0, RIG.spineY, 0]],
  ['head', 'spine', [0, RIG.neckY, 0]],
  ['aim', 'spine', [0, RIG.shoulderY, 0]], // omuz hattı: kollar ve silah bakış açısıyla bu eksende döner
  ['armR', 'aim', SR],
  ['foreR', 'armR', [SR[0], SR[1] - RIG.upperArm, SR[2]]],
  ['armL', 'aim', SL],
  ['foreL', 'armL', [SL[0], SL[1] - RIG.upperArm, SL[2]]],
  ['thighL', 'hips', [-RIG.hipX, RIG.hipY, 0]],
  ['shinL', 'thighL', [-RIG.hipX, KNEE_Y, 0]],
  ['thighR', 'hips', [RIG.hipX, RIG.hipY, 0]],
  ['shinR', 'thighR', [RIG.hipX, KNEE_Y, 0]],
];
const B = Object.fromEntries(BIND.map(([name], i) => [name, i]));

function makeSkeleton() {
  const bones = {}, list = [];
  const abs = Object.fromEntries(BIND.map(([name, , p]) => [name, p]));
  for (const [name, parent, p] of BIND) {
    const bone = new THREE.Bone();
    bone.name = name;
    const pp = parent ? abs[parent] : [0, 0, 0];
    bone.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent) bones[parent].add(bone);
    bones[name] = bone;
    list.push(bone);
  }
  bones.root.updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(list) };
}

// ---------------------------------------------------------------- Gövde geometrisi (takım başına bir kez)
const PALETTE = {
  // Çöl milisi: toprak renkli ceket, koyu göğüs takımı, kar maskesi, boyunda kırmızı atkı
  T: { shirt: 0x7a6542, pants: 0x4f4a3a, vest: 0x3a3126, pouch: 0x4a3f2e, mask: 0x221f1b, accent: 0x7c2a22, cuff: 0x5a4a30, pack: 0x5b5136, boot: 0x2a2019, glove: 0x1e1b17, pad: 0x2f2a22 },
  // Özel tim: lacivert üniforma, siyah zırhlı yelek, miğfer ve gözlük
  CT: { shirt: 0x2f3d55, pants: 0x242e40, vest: 0x171c25, pouch: 0x222a36, mask: 0x15181d, accent: 0x1c232e, cuff: 0x222c40, pack: 0x1b212b, boot: 0x131313, glove: 0x15171a, pad: 0x11151b },
};
const SKIN = 0xc58f66;

// Döndürme yüzeyi (bacak, kol, gövde): profil alttan üste [yarıçap, y]. Üçgen yönü dışa bakacak şekilde düzeltilir.
function lathe(profile, segments = 14) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  // Yozlaşmamış ilk üçgenin yüz normali köşe normaliyle aynı yöne bakmalı
  for (let i = 0; i < ix.count; i += 3) {
    a.fromBufferAttribute(p, ix.getX(i)); b.fromBufferAttribute(p, ix.getX(i + 1)); c.fromBufferAttribute(p, ix.getX(i + 2));
    b.sub(a); c.sub(a); b.cross(c);
    if (b.lengthSq() < 1e-12) continue;
    nn.fromBufferAttribute(n, ix.getX(i));
    if (b.dot(nn) < 0) for (let k = 0; k < ix.count; k += 3) { const t = ix.getX(k + 1); ix.setX(k + 1, ix.getX(k + 2)); ix.setX(k + 2, t); }
    break;
  }
  return geo;
}

function buildBodyGeometry(team) {
  const isT = team === 'T';
  const P = PALETTE[team];
  const M = {
    shirt: mat(P.shirt, 0.92, 0), pants: mat(P.pants, 0.9, 0), vest: mat(P.vest, 0.78, 0.04), pouch: mat(P.pouch, 0.82, 0.02),
    mask: mat(P.mask, 0.95, 0), accent: mat(P.accent, 0.9, 0), cuff: mat(P.cuff, 0.9, 0), pack: mat(P.pack, 0.88, 0), boot: mat(P.boot, 0.6, 0.05),
    sole: mat(0x0f0f0f, 0.9, 0), glove: mat(P.glove, 0.7, 0.02), pad: mat(P.pad, 0.55, 0.1), skin: mat(SKIN, 0.75, 0),
    belt: mat(0x1c1a17, 0.6, 0.05), helmet: mat(0x232b38, 0.5, 0.15), glass: mat(0x0b141c, 0.08, 0.9, METAL),
    eye: mat(0x16110d, 0.4, 0), metal: mat(0x3a3d42, 0.4, 0.7, METAL),
  };
  const parts = [];
  // geo: bağlama duruşunda yerleştirilecek geometri; skin: kemik (sayı) ya da iki kemik arası geçiş
  const add = (geo, material, skin, x = 0, y = 0, z = 0, rot = null, scale = null) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.userData.skin = skin;
    parts.push(mesh);
  };
  // Parçalar az üçgenli tutulur (32 kişilik odada gövde başına ~5 bin üçgen): kutuların kenarı tek kademe yuvarlanır
  const sphere = (r, w = 10, h = 8, ...partial) => new THREE.SphereGeometry(r, w, h, ...partial);
  const rbox = (w, h, d, r = 0.012) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.45));
  const cyl = (r0, r1, h, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg);
  const PI = Math.PI;

  // ---- Bacaklar: kalçadan bot koncuna tek parça pantolon (dizde bükülür), bot; özel timde dizlik
  for (const s of [-1, 1]) {
    const x = s * RIG.hipX, thigh = s < 0 ? B.thighL : B.thighR, shin = s < 0 ? B.shinL : B.shinR;
    add(lathe([[0, 0.2], [0.05, 0.205], [0.058, 0.27], [0.074, 0.37], [0.075, 0.43], [0.069, KNEE_Y], [0.08, 0.58], [0.093, 0.72], [0.099, 0.84], [0.094, 0.93], [0.06, 0.985], [0, 1.0]], 12),
      M.pants, { a: thigh, b: shin, y0: KNEE_Y - 0.07, y1: KNEE_Y + 0.07 }, x, 0, 0, null, [1, 1, 1.06]);
    add(cyl(0.062, 0.057, 0.2), M.boot, shin, x, 0.16, 0);                                          // bot koncu (paça içinde)
    add(new THREE.CapsuleGeometry(0.052, 0.14, 3, 8), M.boot, shin, x, 0.058, -0.055, [PI / 2, 0, 0], [1, 1, 0.88]); // ayak
    add(rbox(0.104, 0.026, 0.25, 0.01), M.sole, shin, x, 0.013, -0.055);                            // taban
    if (!isT) add(sphere(0.058, 8, 6), M.pad, shin, x, KNEE_Y - 0.02, -0.048, null, [0.95, 1.15, 0.5]); // dizlik
  }
  // ---- Kalça, kemer ve keseler
  add(sphere(1, 12, 8), M.pants, B.hips, 0, 0.95, 0, null, [0.175, 0.115, 0.122]);
  add(cyl(1, 1, 0.055, 14), M.belt, B.hips, 0, 1.02, 0, null, [0.176, 1, 0.125]);
  add(rbox(0.06, 0.035, 0.02), M.metal, B.hips, 0, 1.02, -0.123);                                   // toka
  for (const s of [-1, 1]) add(rbox(0.07, 0.085, 0.04), M.pouch, B.hips, s * 0.115, 0.995, -0.1, [0, s * -0.5, 0]);
  add(rbox(0.15, 0.09, 0.045), M.pouch, B.hips, 0, 0.995, 0.125);
  add(rbox(0.05, 0.16, 0.085), M.vest, B.thighR, RIG.hipX + 0.09, 0.77, 0.005);                     // tabanca kılıfı
  add(rbox(0.03, 0.05, 0.05, 0.008), M.metal, B.thighR, RIG.hipX + 0.092, 0.86, -0.005);

  // ---- Gövde: belden eğilen tek parça üst, omuzlar
  add(lathe([[0, 0.97], [0.135, 0.985], [0.15, 1.02], [0.15, 1.1], [0.16, 1.2], [0.178, 1.3], [0.182, 1.37], [0.165, 1.43], [0.105, 1.465], [0.055, 1.49], [0, 1.495]], 16),
    M.shirt, { a: B.spine, b: B.hips, y0: 1.02, y1: 1.16 }, 0, 0, 0, null, [1, 1, 0.66]);
  for (const s of [-1, 1]) add(sphere(0.07, 10, 6), M.shirt, B.spine, s * 0.186, 1.412, s > 0 ? 0.015 : -0.03);
  // ---- Zırhlı yelek: ön ve arka plaka, yan kuşak, omuz askıları, şarjör keseleri
  add(rbox(0.29, 0.3, 0.055, 0.022), M.vest, B.spine, 0, 1.268, -0.113, [-0.06, 0, 0]);
  add(rbox(0.28, 0.3, 0.05, 0.022), M.vest, B.spine, 0, 1.268, 0.116, [0.05, 0, 0]);
  for (const s of [-1, 1]) {
    add(rbox(0.03, 0.15, 0.21), M.vest, B.spine, s * 0.166, 1.2, 0);
    add(rbox(0.055, 0.03, 0.23), M.vest, B.spine, s * 0.105, 1.447, 0.002);
  }
  for (const dx of [-0.088, 0, 0.088]) add(rbox(0.076, 0.125, 0.042), M.pouch, B.spine, dx, 1.19, -0.152, [-0.06, 0, 0]);
  add(rbox(0.13, 0.07, 0.03), M.pouch, B.spine, 0, 1.36, -0.146, [-0.06, 0, 0]);
  if (isT) {
    add(rbox(0.25, 0.3, 0.115, 0.04), M.pack, B.spine, 0, 1.25, 0.2);                               // sırt çantası
    add(rbox(0.19, 0.11, 0.03), M.pouch, B.spine, 0, 1.2, 0.262);
  } else {
    add(rbox(0.2, 0.24, 0.06, 0.02), M.pack, B.spine, 0, 1.28, 0.168);                              // telsiz kesesi ve anten
    add(cyl(0.004, 0.004, 0.3, 5), M.metal, B.spine, 0.085, 1.52, 0.17);
  }

  // ---- Kollar: omuzdan bileğe tek parça (dirsekte bükülür), eldiven
  for (const [sh, arm, fore] of [[SR, B.armR, B.foreR], [SL, B.armL, B.foreL]]) {
    const dy = sh[1] - RIG.shoulderY; // sol omuz birkaç mm aşağıda
    add(lathe([[0, 0.855], [0.036, 0.87], [0.04, 0.95], [0.047, 1.05], [0.045, ELBOW_Y], [0.05, 1.22], [0.057, 1.33], [0.058, 1.4], [0.045, 1.445], [0, 1.46]], 10),
      M.shirt, { a: arm, b: fore, y0: ELBOW_Y + dy - 0.05, y1: ELBOW_Y + dy + 0.05 }, sh[0], dy, sh[2]);
    add(cyl(0.043, 0.041, 0.035, 8), M.cuff, fore, sh[0], HAND_Y + dy + 0.062, sh[2]);               // kol ağzı
    add(sphere(0.047, 8, 6), M.glove, fore, sh[0], HAND_Y + dy, sh[2], null, [0.85, 1.25, 0.8]);     // el
    if (!isT) add(sphere(0.05, 8, 5), M.pad, fore, sh[0], ELBOW_Y + dy - 0.01, sh[2] + 0.035, null, [1, 1.15, 0.55]); // dirseklik
  }

  // ---- Boyun ve kafa
  const neck = { a: B.head, b: B.spine, y0: 1.46, y1: 1.52 };
  add(cyl(0.05, 0.057, 0.11, 10), isT ? M.mask : M.skin, neck, 0, 1.49, 0.005);
  if (isT) add(cyl(0.074, 0.088, 0.075, 12), M.accent, neck, 0, 1.478, 0.004);                       // atkı
  const hy = RIG.headY, hs = [0.95, 1.12, 1.03];
  add(sphere(0.105, 14, 10), M.skin, B.head, 0, hy, 0, null, hs);                                   // kafa
  add(sphere(0.016, 6, 5), M.skin, B.head, 0, hy - 0.017, -0.107, null, [0.8, 1.3, 1]);             // burun
  for (const s of [-1, 1]) add(sphere(0.012, 6, 5), M.eye, B.head, s * 0.036, hy + 0.012, -0.093);
  // SphereGeometry'de ön taraf (−z) phi = 3π/2 çevresidir
  const FRONT = PI * 1.5;
  if (isT) {
    // Kar maskesi: tepe, alt yüz ve göz hizasında arkadan dolanan bant (önde göz aralığı açık)
    add(sphere(0.113, 14, 5, 0, PI * 2, 0, PI * 0.4), M.mask, B.head, 0, hy, 0, null, hs);
    add(sphere(0.113, 14, 5, 0, PI * 2, PI * 0.56, PI * 0.44), M.mask, B.head, 0, hy, 0, null, hs);
    add(sphere(0.113, 12, 2, FRONT + 0.85, PI * 2 - 1.7, PI * 0.4, PI * 0.16), M.mask, B.head, 0, hy, 0, null, hs);
  } else {
    // Miğfer, kenarı, kulaklık, gözlük ve alt yüzü kapatan maske
    add(sphere(0.128, 14, 6, 0, PI * 2, 0, PI * 0.5), M.helmet, B.head, 0, hy + 0.012, 0.006, null, [1, 0.97, 1.1]);
    add(new THREE.TorusGeometry(0.127, 0.011, 5, 14), M.helmet, B.head, 0, hy + 0.012, 0.006, [PI / 2, 0, 0], [1, 1.1, 1]);
    for (const s of [-1, 1]) add(cyl(0.036, 0.036, 0.03, 8), M.pad, B.head, s * 0.108, hy - 0.005, 0.012, [0, 0, PI / 2]);
    add(sphere(0.112, 10, 3, FRONT - 1.05, 2.1, PI * 0.4, PI * 0.15), M.glass, B.head, 0, hy, 0, null, hs);
    add(sphere(0.111, 14, 5, 0, PI * 2, PI * 0.56, PI * 0.44), M.mask, B.head, 0, hy, 0, null, hs);
  }
  const geo = mergeGeometry(parts);
  for (const m of parts) m.geometry.dispose();
  return geo;
}

const bodyGeo = new Map();
const bodyGeometry = (team) => {
  if (!bodyGeo.has(team)) bodyGeo.set(team, buildBodyGeometry(team));
  return bodyGeo.get(team);
};

// ---------------------------------------------------------------- Duruşun kemiklere uygulanması
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
// İki parçalı uzvun kemiklerini eklem konumlarına göre döndürür (konumlar üst kemiğin ebeveyn uzayında).
// Bağlama duruşunda iki parça da −y'ye bakar.
function setLimb(upper, lower, root, mid, end) {
  _qa.setFromUnitVectors(DOWN, _d.set(mid[0] - root[0], mid[1] - root[1], mid[2] - root[2]).normalize());
  upper.quaternion.copy(_qa);
  _qb.setFromUnitVectors(DOWN, _d.set(end[0] - mid[0], end[1] - mid[1], end[2] - mid[2]).normalize());
  lower.quaternion.copy(_qa).invert().multiply(_qb);
}
const easeOut = (t) => 1 - (1 - t) ** 3;
// Ölünce kolların serbest düşmüş hâli (nişan kemiğinin uzayında)
const LIMP = {
  armR: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 1.15)),
  armL: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, -1.3)),
  foreR: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, 0, 0.2)),
  foreL: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, -0.3)),
};

export function createPlayerModel(team) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const { bones, skeleton } = makeSkeleton();
  const mesh = new THREE.SkinnedMesh(bodyGeometry(team), WORLD_MAT);
  mesh.castShadow = true;
  mesh.add(bones.root);
  mesh.bind(skeleton);
  // Görüş alanı testi için sabit küre (yere yatmış gövdeyi de kapsar); kemiklere göre her karede hesaplanmaz
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.1);
  group.add(mesh);
  const weaponSlot = new THREE.Group();
  bones.aim.add(weaponSlot);

  const hold = { armR: new THREE.Quaternion(), foreR: new THREE.Quaternion(), armL: new THREE.Quaternion(), foreL: new THREE.Quaternion() };
  function holdWeapon(kind, left) {
    const a = poseArms(kind, left ? [left.x, left.y, left.z] : null);
    setLimb(bones.armR, bones.foreR, a.right.shoulder, a.right.elbow, a.right.hand);
    setLimb(bones.armL, bones.foreL, a.left.shoulder, a.left.elbow, a.left.hand);
    for (const k of Object.keys(hold)) hold[k].copy(bones[k].quaternion);
    weaponSlot.position.set(a.grip[0], a.grip[1], a.grip[2]);
  }
  holdWeapon('knife', null);

  let death = null; // { dir: +1 sırtüstü / −1 yüzüstü, side }
  const model = {
    group, mesh, bones, weaponSlot, weapon: null,
    setWeapon(name, atts = []) {
      if (model.weapon) weaponSlot.remove(model.weapon);
      model.weapon = null;
      if (!name) { holdWeapon('knife', null); return; }
      const w = createWeaponModel(name, atts);
      w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      weaponSlot.add(w);
      model.weapon = w;
      holdWeapon(w.userData.kind, w.userData.left);
      w.visible = !death;
    },
    // Canlı oyuncunun duruşu. s: { crouch, pitch, speed, phase, moveX, moveZ, air, time } (bkz. rig.js poseBody)
    update(s) {
      const p = poseBody(s);
      bones.hips.position.set(p.hips[0], p.hips[1], p.hips[2]);
      bones.spine.rotation.set(p.spinePitch, p.twist, 0);
      bones.aim.rotation.set(p.aimPitch, -p.twist * 0.8, 0); // silah adımlarla savrulmasın
      bones.head.rotation.set(p.headPitch, -p.twist * 0.6, 0);
      setLimb(bones.thighL, bones.shinL, p.legs[0].hip, p.legs[0].knee, p.legs[0].ankle);
      setLimb(bones.thighR, bones.shinR, p.legs[1].hip, p.legs[1].knee, p.legs[1].ankle);
    },
    // Ölüm: f 0 → 1 (yaklaşık yarım saniye). Dizler çözülür, gövde yere devrilir, kollar iki yana düşer.
    die() {
      death = { dir: Math.random() < 0.6 ? 1 : -1, side: Math.random() < 0.5 ? 1 : -1 };
      if (model.weapon) model.weapon.visible = false;
    },
    updateDeath(f, crouch = 0) {
      if (!death) model.die();
      const e = easeOut(Math.min(1, f));
      const buckle = Math.sin(Math.min(1, f * 1.3) * Math.PI) * 0.45;
      const p = poseBody({ crouch: Math.min(1, crouch * (1 - e) + buckle), pitch: 0, speed: 0, phase: 0, moveX: 0, moveZ: -1, air: 0, time: 0 });
      bones.hips.position.set(0, p.hips[1] + (RIG.hipY - p.hips[1]) * e, 0);
      setLimb(bones.thighL, bones.shinL, p.legs[0].hip, p.legs[0].knee, p.legs[0].ankle);
      setLimb(bones.thighR, bones.shinR, p.legs[1].hip, p.legs[1].knee, p.legs[1].ankle);
      // Küçük bir sekmeyle yere yatış; yerdeyken gövde kalınlığı kadar yukarıda durur
      const fall = e + Math.sin(Math.min(1, f) * Math.PI) * 0.04 * (1 - e);
      bones.root.rotation.set(death.dir * (Math.PI / 2 - 0.06) * fall, 0, death.side * 0.08 * e);
      bones.root.position.y = (death.dir > 0 ? 0.13 : 0.16) * e;
      bones.spine.rotation.set(-death.dir * 0.12 * e, 0.15 * death.side * e, 0);
      bones.aim.rotation.set(0, 0, 0);
      bones.head.rotation.set(-death.dir * 0.2 * e, 0.5 * death.side * e, 0);
      for (const k of Object.keys(hold)) bones[k].quaternion.copy(hold[k]).slerp(LIMP[k], e);
    },
    // Yeniden doğunca ölüm duruşu sıfırlanır
    revive() {
      death = null;
      bones.root.rotation.set(0, 0, 0);
      bones.root.position.y = 0;
      for (const k of Object.keys(hold)) bones[k].quaternion.copy(hold[k]);
      if (model.weapon) model.weapon.visible = true;
    },
    get dead() { return !!death; },
  };
  model.update({ crouch: 0, pitch: 0, speed: 0, phase: 0, moveX: 0, moveZ: -1, air: 0, time: 0 });
  return model;
}
