// Oyuncu iskeleti (public/js/rig.js) ve isabet kutuları (public/shared/hitbox.js):
// görünen model ile vurulabilen kutular örtüşmeli, eklemler bozulmamalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIG, solveLimb, poseBody, poseArms } from '../public/js/rig.js';
import { playerHitboxes } from '../public/shared/hitbox.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
const inside = (p, box, margin = 0) => p.every((v, i) => v >= box.min[i] + margin && v <= box.max[i] - margin);
const zone = (boxes, name) => boxes.find((b) => b.zone === name);

test('playerHitboxes: kafa, gövde ve bacak kutuları; eğilince üst kutular 0,5 m iner', () => {
  const want = [
    { zone: 'head', min: [9.84, 3.47, -5.16], max: [10.16, 3.78, -4.84] },
    { zone: 'body', min: [9.73, 2.85, -5.27], max: [10.27, 3.47, -4.73] },
    { zone: 'legs', min: [9.78, 2, -5.22], max: [10.22, 2.85, -4.78] },
  ];
  const got = playerHitboxes(10, 2, -5, 0);
  assert.deepEqual(got.map((b) => b.zone), ['head', 'body', 'legs']);
  for (const [i, w] of want.entries()) {
    for (const k of ['min', 'max']) for (let a = 0; a < 3; a++) near(got[i][k][a], w[k][a], 1e-9, `${w.zone}.${k}[${a}]`);
  }
  const c = playerHitboxes(0, 0, 0, 1);
  near(zone(c, 'head').min[1], 0.97, 1e-9, 'eğik kafa altı');
  near(zone(c, 'head').max[1], 1.28, 1e-9, 'eğik kafa üstü');
  near(zone(c, 'body').min[1], 0.35, 1e-9, 'eğik gövde altı');
  near(zone(c, 'legs').max[1], 0.35, 1e-9, 'eğik bacak üstü');
  near(zone(c, 'legs').min[1], 0, 1e-9, 'bacak altı');
});

test('solveLimb: ulaşılabilir hedefte uç hedefe varır, parça boyları korunur', () => {
  const root = [0.1, 0.93, 0], target = [0.1, 0.3, -0.25];
  const { mid, end } = solveLimb(root, target, 0.44, 0.43, [0, 0, -1]);
  near(dist(root, mid), 0.44, 1e-9, 'üst parça boyu');
  near(dist(mid, end), 0.43, 1e-9, 'alt parça boyu');
  near(dist(end, target), 0, 1e-9, 'uç hedefte olmalı');
});

test('solveLimb: eklem kutup yönüne bükülür (diz öne)', () => {
  const { mid } = solveLimb([0, 0.9, 0], [0, 0.2, 0], 0.44, 0.43, [0, 0, -1]);
  assert.ok(mid[2] < -0.05, `diz öne (−z) çıkmalı: z=${mid[2]}`);
  near(mid[0], 0, 1e-9, 'diz yana kaymamalı');
});

test('solveLimb: hedef çok uzakta ya da kökün üstündeyken de geçerli sonuç verir', () => {
  const far = solveLimb([0, 1, 0], [0, 1, -5], 0.3, 0.3, [0, -1, 0]);
  near(dist([0, 1, 0], far.mid), 0.3, 1e-9, 'üst parça');
  near(dist(far.mid, far.end), 0.3, 1e-9, 'alt parça');
  assert.ok(far.end[2] < -0.55 && far.end[2] > -0.6 - 1e-9, `kol hedefe doğru uzanmalı: z=${far.end[2]}`);
  const zero = solveLimb([0, 1, 0], [0, 1, 0], 0.3, 0.3, [0, -1, 0]);
  for (const v of [...zero.mid, ...zero.end]) assert.ok(Number.isFinite(v), 'NaN / sonsuz olmamalı');
  near(dist([0, 1, 0], zero.mid), 0.3, 1e-9, 'üst parça (hedef kökte)');
});

const STATES = [];
for (const crouch of [0, 0.5, 1]) for (const pitch of [-1.55, -0.4, 0, 0.4, 1.55]) for (const speed of [0, 2.2, 6.35]) for (const phase of [0, 1, 2, 3, 4, 5, 6]) {
  STATES.push({ crouch, pitch, speed, phase, moveX: 0, moveZ: -1, air: 0, time: phase * 0.37 });
}

test('poseBody: kafa ve gövde her duruşta kendi isabet kutusunun içinde', () => {
  for (const s of STATES) {
    const p = poseBody(s);
    const boxes = playerHitboxes(0, 0, 0, s.crouch);
    const tag = JSON.stringify(s);
    assert.ok(inside(p.head, zone(boxes, 'head'), 0.02), `kafa merkezi kutunun dışında ${JSON.stringify(p.head)} ${tag}`);
    assert.ok(inside(p.chest, zone(boxes, 'body'), 0.02), `göğüs kutunun dışında ${JSON.stringify(p.chest)} ${tag}`);
    assert.ok(inside(p.hips, zone(boxes, 'body'), 0), `kalça gövde kutusunun dışında ${JSON.stringify(p.hips)} ${tag}`);
  }
});

test('poseBody: kafanın tepesi ve yanları kutudan taşmaz (görünen kafa vurulabilir)', () => {
  for (const s of STATES) {
    const p = poseBody(s);
    const box = zone(playerHitboxes(0, 0, 0, s.crouch), 'head');
    assert.ok(p.head[1] + RIG.headR <= box.max[1] + 0.03, `kafa tepesi kutunun üstünde: ${p.head[1] + RIG.headR} > ${box.max[1]}`);
    assert.ok(Math.abs(p.head[2]) + RIG.headR <= 0.16 + 0.11, `kafa öne/arkaya fazla taşıyor: z=${p.head[2]}`);
  }
});

test('poseBody: eğilince kalça isabet kutusuyla aynı miktarda iner', () => {
  const stand = poseBody({ crouch: 0, pitch: 0, speed: 0, phase: 0, moveX: 0, moveZ: -1, air: 0, time: 0 });
  const down = poseBody({ crouch: 1, pitch: 0, speed: 0, phase: 0, moveX: 0, moveZ: -1, air: 0, time: 0 });
  near(stand.hips[1] - down.hips[1], 0.5, 1e-9, 'kalça alçalması');
  near(stand.head[1] - down.head[1], 0.5, 0.03, 'kafa alçalması');
});

test('poseBody: bacaklar her adımda geçerli (boy sabit, ayak yerin üstünde, diz öne bükülü)', () => {
  const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0], [0.7071, -0.7071]];
  for (const crouch of [0, 0.5, 1]) for (const speed of [0, 1.5, 4, 6.35]) for (const [moveX, moveZ] of dirs) for (const air of [0, 1]) {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.21) {
      const p = poseBody({ crouch, pitch: 0, speed, phase, moveX, moveZ, air, time: 1 });
      assert.equal(p.legs.length, 2, 'iki bacak olmalı');
      assert.ok(p.legs[0].hip[0] < 0 && p.legs[1].hip[0] > 0, 'ilk bacak sol, ikincisi sağ');
      for (const leg of p.legs) {
        const tag = `crouch=${crouch} speed=${speed} dir=${moveX},${moveZ} air=${air} phase=${phase.toFixed(2)}`;
        near(dist(leg.hip, leg.knee), RIG.thigh, 1e-9, `uyluk boyu (${tag})`);
        near(dist(leg.knee, leg.ankle), RIG.shin, 1e-9, `baldır boyu (${tag})`);
        assert.ok(leg.ankle[1] >= RIG.ankle - 1e-9, `ayak yerin altında: ${leg.ankle[1]} (${tag})`);
        // Diz ekleminin merkezi en az diz yarıçapı (~6 cm) kadar yukarıda olmalı: çöken diz yere değer ama içine girmez
        assert.ok(leg.knee[1] >= 0.06, `diz yerin içinde: ${leg.knee[1]} (${tag})`);
        // Diz, kalça-bilek doğrusunun arkasına (＋z) geçmemeli
        const t = Math.max(0, Math.min(1, (leg.knee[1] - leg.ankle[1]) / Math.max(1e-6, leg.hip[1] - leg.ankle[1])));
        const lineZ = leg.ankle[2] + (leg.hip[2] - leg.ankle[2]) * t;
        assert.ok(leg.knee[2] <= lineZ + 1e-6, `diz arkaya bükülmüş: diz z=${leg.knee[2]} doğru z=${lineZ} (${tag})`);
      }
    }
  }
});

test('poseBody: yürürken ayaklar hareket yönünde adım atar; dururken yerinde kalır', () => {
  const at = (phase, speed, moveX, moveZ) => poseBody({ crouch: 0, pitch: 0, speed, phase, moveX, moveZ, air: 0, time: 0 }).legs[0].ankle;
  // İleri (−z) koşarken ayağın ön-arka salınımı belirgin olmalı
  const zs = [], xs = [];
  for (let ph = 0; ph < Math.PI * 2; ph += 0.2) { const a = at(ph, 5.5, 0, -1); zs.push(a[2]); xs.push(a[0]); }
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.4, 'ileri koşuda adım boyu çok kısa');
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.02, 'ileri koşuda ayak yana savrulmamalı');
  // Yana (＋x) giderken salınım yana olmalı
  const sx = [], sz = [];
  for (let ph = 0; ph < Math.PI * 2; ph += 0.2) { const a = at(ph, 5.5, 1, 0); sx.push(a[0]); sz.push(a[2]); }
  assert.ok(Math.max(...sx) - Math.min(...sx) > 0.25, 'yana giderken ayak yana adım atmalı');
  // Dururken evre değişse de ayak oynamaz
  assert.deepEqual(at(0, 0, 0, -1), at(2.5, 0, 0, -1));
});

test('poseArms: tüfekte iki el de silahı tutar, tabancada eller birleşir; kol boyları korunur', () => {
  for (const kind of ['rifle', 'pistol', 'knife', 'nade', 'bomb']) {
    const a = poseArms(kind, kind === 'rifle' ? [0, 0, -0.4] : null);
    for (const side of ['right', 'left']) {
      const arm = a[side];
      near(dist(arm.shoulder, arm.elbow), RIG.upperArm, 1e-9, `${kind} ${side} üst kol`);
      near(dist(arm.elbow, arm.hand), RIG.foreArm, 1e-9, `${kind} ${side} ön kol`);
      for (const v of [...arm.elbow, ...arm.hand]) assert.ok(Number.isFinite(v));
    }
    assert.ok(a.right.shoulder[0] > 0 && a.left.shoulder[0] < 0, 'sağ omuz sağda, sol omuz solda');
  }
  const rifle = poseArms('rifle', [0, 0, -0.4]);
  near(dist(rifle.right.hand, rifle.grip), 0, 0.02, 'sağ el kabzada');
  assert.ok(rifle.left.hand[2] < rifle.grip[2] - 0.15, 'sol el kabzanın önünde, el kundağında olmalı');
  assert.ok(rifle.right.elbow[1] < rifle.right.shoulder[1], 'sağ dirsek aşağı bakmalı');
  const pistol = poseArms('pistol', null);
  assert.ok(dist(pistol.left.hand, pistol.right.hand) < 0.1, 'tabancada iki el yan yana');
});
