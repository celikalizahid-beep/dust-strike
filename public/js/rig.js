// Oyuncu iskeleti: ölçüler ve duruş hesabı. three.js'e bağlı değildir (testlerde de çalışır); models.js buradaki
// eklem konumlarını kemik dönüşlerine çevirir. Model uzayı: x sağ, y yukarı, ileri −z (namlu −z'ye bakar). Metre.
// Ölçüler isabet kutularıyla (public/shared/hitbox.js) örtüşür: kafa 1,47–1,78, gövde 0,85–1,47, bacak 0–0,85.
import { CROUCH_DROP } from '../shared/hitbox.js';

export const RIG = {
  hipY: 0.93, hipX: 0.095,            // kalça eklemi yüksekliği ve yana açıklığı
  thigh: 0.44, shin: 0.43, ankle: 0.08, // uyluk, baldır, bileğin yerden yüksekliği
  stanceX: 0.11,                      // ayakların yana açıklığı
  spineY: 1.10,                       // bel: gövdenin öne / arkaya eğildiği eklem
  shoulderY: 1.42, shoulderX: 0.19,
  neckY: 1.50, headY: 1.63, headR: 0.118,
  upperArm: 0.29, foreArm: 0.30,
  crouchDrop: CROUCH_DROP,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// İki parçalı uzuv (uyluk + baldır, üst kol + ön kol) için ters kinematik. root: kök eklem, target: ucun hedefi,
// a / b: parça boyları, pole: orta eklemin (diz, dirsek) büküleceği yön. Parça boyları her zaman korunur;
// hedef erişilemeyecek kadar uzaksa uzuv hedefe doğru dümdüz uzanır.
export function solveLimb(root, target, a, b, pole) {
  let dx = target[0] - root[0], dy = target[1] - root[1], dz = target[2] - root[2];
  const d = Math.hypot(dx, dy, dz);
  if (d > 1e-9) { dx /= d; dy /= d; dz /= d; } else { dx = 0; dy = -1; dz = 0; }
  const reach = clamp(d, Math.abs(a - b), a + b);
  // Kutup yönünün uzuv eksenine dik bileşeni
  let k = pole[0] * dx + pole[1] * dy + pole[2] * dz;
  let px = pole[0] - dx * k, py = pole[1] - dy * k, pz = pole[2] - dz * k;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-6) {
    // Kutup eksenle aynı doğrultuda: herhangi bir dik yön seç
    const ax = Math.abs(dx) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    k = ax[0] * dx + ax[1] * dy + ax[2] * dz;
    px = ax[0] - dx * k; py = ax[1] - dy * k; pz = ax[2] - dz * k;
    pl = Math.hypot(px, py, pz);
  }
  px /= pl; py /= pl; pz /= pl;
  // Kökteki açı (kosinüs teoremi)
  const cos = reach > 1e-9 ? clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1) : 0;
  const sin = Math.sqrt(1 - cos * cos);
  return {
    mid: [root[0] + dx * a * cos + px * a * sin, root[1] + dy * a * cos + py * a * sin, root[2] + dz * a * cos + pz * a * sin],
    end: [root[0] + dx * reach, root[1] + dy * reach, root[2] + dz * reach],
  };
}

// Gövde ve bacak duruşu.
//   crouch 0..1, pitch: bakış açısı (yukarı +), speed: yatay hız (m/s), phase: adım evresi (radyan),
//   moveX / moveZ: model uzayında hareket yönü (birim vektör; ileri 0,−1), air: 0 yerde … 1 havada
// Dönen konumlar model uzayındadır (kök: ayakların ortası, yer y=0).
export function poseBody({ crouch = 0, pitch = 0, speed = 0, phase = 0, moveX = 0, moveZ = -1, air = 0, time = 0 }) {
  const c = clamp(crouch, 0, 1);
  const k = clamp(speed / 5.5, 0, 1);    // 0 duruyor … 1 koşuyor
  const run = k * (1 - 0.6 * c);         // eğilerek yürürken adımlar kısalır
  // Dururken tek diz yerde; yürürken ve havada iki ayak üstünde çömelme
  const kneel = c * (1 - clamp(speed / 1.5, 0, 1)) * (1 - clamp(air, 0, 1));
  // Kalça: eğilince iner; iki ayak da en uzaktayken (çift destek) hafifçe alçalır ki bacaklar yere yetişsin
  const hipY = RIG.hipY - RIG.crouchDrop * c - 0.05 * run * Math.cos(phase) ** 2;
  const hips = [0, hipY, 0];

  // Üst gövde belden eğilir: bakışın küçük bir kısmı, koşarken ve eğilirken öne yatma. Kafa isabet kutusundan
  // çıkmasın diye toplam eğim sınırlıdır; bakışın kalanını kollar (aimPitch) ve baş (headPitch) tamamlar.
  const breathe = Math.sin(time * 1.7) * 0.006 * (1 - k);
  const spinePitch = clamp(pitch * 0.25, -0.14, 0.14) - 0.06 * run - 0.05 * c + breathe;
  const twist = Math.sin(phase) * 0.09 * run; // omuzlar adımlara karşı döner
  const spine = [0, hipY + (RIG.spineY - RIG.hipY), 0];
  const up = (len) => [0, spine[1] + Math.cos(spinePitch) * len, Math.sin(spinePitch) * len];
  const head = up(RIG.headY - RIG.spineY);
  const chest = up(0.22);

  const legs = [];
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1; // 0: sol, 1: sağ
    const hip = [s * RIG.hipX, hipY, 0];
    let fx = s * RIG.stanceX, fy = RIG.ankle, fz = 0.02;
    // Diz çökme: sol ayak öne basar, sağ diz yere iner (bilek geride, parmak ucu yerde)
    if (i === 0) fz -= 0.38 * kneel;
    else { fz += 0.15 * kneel; fy += 0.04 * kneel; }
    // Çömelerek yürüme: kalça ayakların gerisinde kalır (dizler öne-yukarı bükülür, yere değmez)
    fz -= 0.12 * (c - kneel);
    // Adım: destek evresinde ayak gövdeye göre geriye kayar, salınım evresinde kalkıp öne gelir
    const u = phase + (i ? Math.PI : 0);
    const along = Math.cos(u) * 0.3 * run;
    fx += moveX * along; fz += moveZ * along;
    fy += Math.max(0, -Math.sin(u)) * 0.16 * run;
    // Havada bacaklar toplanır. Eğilerek zıplarken ayaklar kalkamaz (gövde zaten alçakta): dizler öne-yukarı çekilir
    fy += 0.16 * air * (1 - c);
    fz += (i ? 0.07 : -0.07) * air * (1 - c) - 0.12 * air * c;
    const { mid, end } = solveLimb(hip, [fx, fy, fz], RIG.thigh, RIG.shin, [s * 0.12, 0, -1]);
    legs.push({ hip, knee: mid, ankle: end });
  }
  return { hips, spine, spinePitch, twist, aimPitch: pitch - spinePitch, headPitch: pitch * 0.6 - spinePitch, head, chest, legs };
}

// Kolların silahı tutuşu, nişan kemiğinin uzayında (köken: iki omzun ortası, ileri −z). kind: silah türü
// (rifle, pistol, knife, nade, bomb); leftGrip: tüfekte sol elin tutacağı yer (kabzaya göre, silah modelinden).
export const SHOULDERS = {
  right: [RIG.shoulderX, 0, 0.02],
  left: [-RIG.shoulderX + 0.01, -0.005, -0.05], // destek eli öne uzandığı için omuz hafif önde
};
const HOLD = {
  rifle: { grip: [0.1, -0.11, -0.27] },
  pistol: { grip: [0.03, -0.07, -0.5], left: [-0.045, -0.015, 0.012] },
  knife: { grip: [0.21, -0.24, -0.36], left: [-0.41, -0.02, 0.12] },
  nade: { grip: [0.23, -0.05, -0.3], left: [-0.39, -0.17, 0] },
  bomb: { grip: [0, -0.3, -0.36], right: [0.13, 0, 0], left: [-0.13, 0, 0] },
};
export function poseArms(kind, leftGrip = null) {
  const hold = HOLD[kind] || HOLD.rifle;
  const g = hold.grip;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const rightTarget = hold.right ? add(g, hold.right) : g;
  let leftTarget;
  if (hold.left) leftTarget = add(g, hold.left);
  else {
    // Tüfek: sol el el kundağının altında; kolun yetişebileceği kadar öne
    const l = leftGrip || [0, 0, -0.35];
    leftTarget = [g[0] + l[0] * 0.62, g[1] + l[1] * 0.62 - 0.03, g[2] + l[2] * 0.62];
  }
  const arm = (shoulder, target, pole) => {
    const { mid, end } = solveLimb(shoulder, target, RIG.upperArm, RIG.foreArm, pole);
    return { shoulder, elbow: mid, hand: end };
  };
  return {
    grip: g,
    right: arm(SHOULDERS.right, rightTarget, [0.7, -0.7, 0.15]), // dirsek aşağı ve dışa
    left: arm(SHOULDERS.left, leftTarget, [-0.45, -0.9, 0]),
  };
}
