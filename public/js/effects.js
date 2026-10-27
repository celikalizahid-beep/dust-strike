// Görsel efektler: mermi izleri, duvar delikleri, kan, namlu alevi, patlama, sis ve havada uçan bombalar.
import * as THREE from 'three';
import { stepNade, raycastWorld, NADE_DT } from '../shared/physics.js';
import { createWeaponModel, FLASH_TEX } from './models.js';

function radialTex(stops, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTex() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.4;
    const y = s / 2 + (Math.random() - 0.5) * s * 0.4;
    const r = s * (0.18 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class Effects {
  constructor(scene, boxes) {
    this.scene = scene;
    this.boxes = boxes;
    this.parts = [];
    this.tex = {
      soft: radialTex([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]),
      hole: radialTex([[0, 'rgba(10,8,6,1)'], [0.35, 'rgba(25,20,14,0.9)'], [0.6, 'rgba(60,45,30,0.4)'], [1, 'rgba(60,45,30,0)']]),
      fire: radialTex([[0, 'rgba(255,250,220,1)'], [0.3, 'rgba(255,170,60,0.95)'], [0.7, 'rgba(200,60,10,0.45)'], [1, 'rgba(80,20,0,0)']]),
      smoke: smokeTex(),
    };
    this.decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
    this.decalMat = new THREE.MeshBasicMaterial({ map: this.tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decals = [];
    this.decalIdx = 0;
    this.tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.75 });
    this.light = new THREE.PointLight(0xffb060, 0, 16, 2);
    scene.add(this.light);
    this.lightT = 0; this.lightLife = 1; this.lightMax = 0;
    this.nades = [];
    this.tmp = new THREE.Vector3();
    this.hdr = 1;
  }

  // Işık parlaması (bloom) açıkken alev, kıvılcım ve mermi izleri daha parlak çizilir ki parlasınlar
  setHDR(k) {
    this.hdr = k;
    this.tracerMat.color.setHex(0xffe9a0).multiplyScalar(k);
  }
  glow(s, k = 1) { s.material.color.multiplyScalar(1 + (this.hdr - 1) * k); return s; }

  sprite(tex, color, pos, scale, opacity = 1, additive = false) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(scale);
    this.scene.add(s);
    return s;
  }

  add(obj, life, update, ownMat = true) { this.parts.push({ obj, life, t: 0, update, ownMat }); }

  pulse(pos, color, intensity, life) {
    if (this.lightT < this.lightLife && intensity < this.lightMax * (1 - this.lightT / this.lightLife)) return;
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.lightMax = intensity;
    this.lightT = 0;
    this.lightLife = life;
  }

  tracer(a, b) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 2) return;
    dir.divideScalar(len);
    const seg = Math.min(len * 0.5, 5);
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.scale.set(1, 1, seg);
    m.position.copy(a);
    m.lookAt(b);
    this.scene.add(m);
    const start = a.clone();
    this.add(m, Math.max(0.03, len / 450), (f) => { m.position.copy(start).addScaledVector(dir, seg / 2 + f * (len - seg)); }, false);
  }

  impact(p, n) {
    let d = this.decals[this.decalIdx];
    if (!d) { d = new THREE.Mesh(this.decalGeo, this.decalMat); this.decals.push(d); this.scene.add(d); }
    this.decalIdx = (this.decalIdx + 1) % 120;
    d.position.copy(p).addScaledVector(n, 0.012);
    d.lookAt(this.tmp.copy(d.position).add(n));
    d.rotateZ(Math.random() * Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const s = this.sprite(this.tex.soft, 0xc8b08a, p, 0.12, 0.7);
      const vel = n.clone().multiplyScalar(1.2 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
      this.add(s, 0.5, (f, dt) => { s.position.addScaledVector(vel, dt); vel.y -= 2 * dt; s.scale.setScalar(0.12 + f * 0.4); s.material.opacity = 0.7 * (1 - f); });
    }
    const sp = this.glow(this.sprite(this.tex.soft, 0xffd080, this.tmp.copy(p).addScaledVector(n, 0.03), 0.18, 1, true), 0.6);
    this.add(sp, 0.06, (f) => { sp.material.opacity = 1 - f; });
  }

  blood(p) {
    for (let i = 0; i < 7; i++) {
      const s = this.sprite(this.tex.soft, 0x8a0808, p, 0.1, 0.9);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.8, (Math.random() - 0.5) * 2.4);
      this.add(s, 0.45, (f, dt) => { s.position.addScaledVector(vel, dt); vel.y -= 6 * dt; s.scale.setScalar(0.08 + f * 0.25); s.material.opacity = 0.9 * (1 - f); });
    }
  }

  muzzle(pos) {
    const s = this.glow(this.sprite(FLASH_TEX, 0xffffff, pos, 0.45 + Math.random() * 0.2, 1, true));
    s.material.rotation = Math.random() * Math.PI;
    this.add(s, 0.05, null);
    this.pulse(pos, 0xffb060, 22, 0.06);
  }

  explosion(pos, big = false) {
    const k = big ? 2.2 : 1;
    const fire = this.glow(this.sprite(this.tex.fire, 0xffffff, this.tmp.copy(pos).setY(pos.y + 0.6 * k), 1, 1, true));
    this.add(fire, 0.55 * k, (f) => { fire.scale.setScalar((1 + f * 7) * k); fire.material.opacity = 1 - f; });
    for (let i = 0; i < 10 * k; i++) {
      const s = this.sprite(this.tex.smoke, 0x3a3530, pos, 1.5, 0.0);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3).multiplyScalar(k);
      s.material.rotation = Math.random() * 6;
      this.add(s, 2.6 * k, (f, dt) => {
        s.position.addScaledVector(vel, dt);
        vel.multiplyScalar(Math.exp(-dt * 1.5));
        s.scale.setScalar((1.5 + f * 4) * k);
        s.material.opacity = Math.min(1, f * 10) * 0.75 * (1 - f);
      });
    }
    this.pulse(this.tmp.copy(pos).setY(pos.y + 1), 0xff9a40, big ? 2500 : 600, big ? 0.6 : 0.3);
  }

  flashPop(pos) {
    const s = this.glow(this.sprite(this.tex.soft, 0xffffff, pos, 0.5, 1, true));
    this.add(s, 0.3, (f) => { s.scale.setScalar(0.5 + f * 6); s.material.opacity = 1 - f; });
    this.pulse(pos, 0xffffff, 800, 0.2);
  }

  smoke(pos) {
    const center = new THREE.Vector3(pos.x, pos.y + 0.3, pos.z);
    for (let i = 0; i < 38; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 0.9 + 0.1, (Math.random() - 0.5) * 2).normalize();
      let len = 1 + Math.random() * 3.2;
      const hit = raycastWorld(this.boxes, [center.x, center.y, center.z], [dir.x, dir.y, dir.z], len + 1);
      if (hit.hit) len = Math.max(0.3, Math.min(len, hit.t - 1));
      const target = center.clone().addScaledVector(dir, len);
      const shade = 0xa8 + Math.floor(Math.random() * 0x20);
      const s = this.sprite(this.tex.smoke, (shade << 16) | (shade << 8) | shade, center, 0.2, 0);
      s.material.rotation = Math.random() * 6.28;
      const size = 3.2 + Math.random() * 2;
      const rot = (Math.random() - 0.5) * 0.1;
      this.add(s, 20, (f, dt) => {
        const t = f * 20;
        const grow = easeOut(Math.min(1, t / 2));
        s.position.lerpVectors(center, target, grow);
        s.scale.setScalar(size * (0.25 + 0.75 * grow));
        s.material.opacity = Math.min(1, t * 2) * (t < 17 ? 0.95 : 0.95 * (1 - (t - 17) / 3));
        s.material.rotation += rot * dt;
      });
    }
  }

  // Havada uçan bomba (sunucu ile aynı fizik kodu kullanılır)
  addNade(n) {
    const mesh = createWeaponModel(n.type);
    mesh.scale.setScalar(1.3);
    mesh.position.set(...n.o);
    this.scene.add(mesh);
    this.nades.push({ sid: n.sid || 0, cid: n.cid || 0, owner: n.owner, type: n.type, st: { p: [...n.o], v: [...n.v], steps: 0 }, mesh, acc: 0 });
  }

  removeNade(pred) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      if (pred(this.nades[i])) { this.scene.remove(this.nades[i].mesh); this.nades.splice(i, 1); }
    }
  }

  clearRound() {
    for (const p of this.parts) { this.scene.remove(p.obj); if (p.ownMat) p.obj.material?.dispose(); }
    this.parts.length = 0;
    this.removeNade(() => true);
  }

  update(dt, onBounce) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      const f = p.t / p.life;
      if (f >= 1) {
        this.scene.remove(p.obj);
        if (p.ownMat) p.obj.material?.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      if (p.update) p.update(f, dt, p);
    }
    if (this.lightT < this.lightLife) {
      this.lightT += dt;
      this.light.intensity = this.lightMax * Math.max(0, 1 - this.lightT / this.lightLife);
    } else this.light.intensity = 0;

    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.acc += dt;
      while (n.acc >= NADE_DT) {
        n.acc -= NADE_DT;
        const b = stepNade(this.boxes, n.st);
        if (b > 2.5 && onBounce) onBounce(new THREE.Vector3(...n.st.p));
      }
      n.mesh.position.set(n.st.p[0], n.st.p[1], n.st.p[2]);
      const sp = Math.hypot(n.st.v[0], n.st.v[2]);
      n.mesh.rotation.x -= sp * dt * 3;
      if (n.st.steps > 60 * 6) { this.scene.remove(n.mesh); this.nades.splice(i, 1); }
    }
  }
}
