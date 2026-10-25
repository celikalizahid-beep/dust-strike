// Dokunmatik kontroller (Android / iOS): solda sanal joystick, sağda kaydırarak bakış ve ekran butonları.
// Düzenleme modunda butonlar sürüklenip taşınabilir ve boyutları ayarlanabilir; düzen telefonda saklanır.

export const IS_TOUCH = (() => {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const iPadDesktop = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  return coarse || (navigator.maxTouchPoints > 0 && mobileUA) || iPadDesktop;
})();

const BUTTONS = [
  ['fire', 'ATEŞ'], ['alt', 'DÜRBÜN'], ['jump', 'ZIPLA'], ['crouch', 'EĞİL'], ['reload', 'ŞARJÖR'],
  ['switch', 'SİLAH'], ['use', 'KUR'], ['menu', '☰'], ['score', 'SKOR'], ['chat', 'SOHBET'], ['buy', '$'],
];
const LAYOUT_KEY = 'dust-touch-layout';
const JOY_R = 55;

function loadLayout() {
  try { const l = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); return { global: 1, items: {}, ...l }; } catch { return { global: 1, items: {} }; }
}

export class TouchControls {
  // h.look(dx, dy): bakış; h.press(act, down): buton basıldı / bırakıldı
  constructor(h) {
    this.h = h;
    this.move = { x: 0, y: 0 };
    this.joy = null;
    this.look = null;
    this.btn = new Map();
    this.cache = {};
    this.editing = false;
    this.drag = null;
    this.sel = null;
    this.layout = loadLayout();
    this.layer = document.getElementById('touch');
    this.base = document.createElement('div');
    this.base.className = 'joyBase';
    this.base.dataset.edit = 'joy';
    this.knob = document.createElement('div');
    this.knob.className = 'joyKnob';
    this.base.appendChild(this.knob);
    this.layer.appendChild(this.base);
    this.els = { joy: this.base };
    for (const [act, label] of BUTTONS) {
      const b = document.createElement('div');
      b.className = 'tbtn t-' + act;
      b.dataset.act = act;
      b.dataset.edit = act;
      b.textContent = label;
      this.layer.appendChild(b);
      this.els[act] = b;
    }
    // CSS'teki varsayılan boyutlar (ölçekleme bunlara göre yapılır)
    this.baseSize = {};
    for (const [k, el] of Object.entries(this.els)) {
      const cs = getComputedStyle(el);
      this.baseSize[k] = { w: parseFloat(cs.width) || 56, h: parseFloat(cs.height) || 56, f: parseFloat(cs.fontSize) || 10 };
    }
    const opt = { passive: false };
    this.layer.addEventListener('touchstart', (e) => this.onStart(e), opt);
    this.layer.addEventListener('touchmove', (e) => this.onMove(e), opt);
    this.layer.addEventListener('touchend', (e) => this.onEnd(e), opt);
    this.layer.addEventListener('touchcancel', (e) => this.onEnd(e), opt);
    window.addEventListener('resize', () => this.applyLayout());
    this.setupEditor();
    this.applyLayout();
  }

  // ---------------- Düzen
  scaleOf(k) { return (this.layout.items[k]?.s ?? 1) * this.layout.global; }
  applyLayout() {
    for (const [k, el] of Object.entries(this.els)) {
      const b = this.baseSize[k], s = this.scaleOf(k), L = this.layout.items[k];
      el.style.width = b.w * s + 'px';
      el.style.height = b.h * s + 'px';
      if (k !== 'joy') el.style.fontSize = b.f * Math.min(1.6, s) + 'px';
      if (L && L.x !== undefined) {
        el.style.left = (k === 'joy' ? L.x * innerWidth : L.x * innerWidth - (b.w * s) / 2) + 'px';
        el.style.top = (k === 'joy' ? L.y * innerHeight : L.y * innerHeight - (b.h * s) / 2) + 'px';
        if (k !== 'joy') { el.style.right = 'auto'; el.style.bottom = 'auto'; }
      } else {
        el.style.left = el.style.top = el.style.right = el.style.bottom = '';
      }
      if (k === 'joy') { el.style.marginLeft = -(b.w * s) / 2 + 'px'; el.style.marginTop = -(b.h * s) / 2 + 'px'; }
    }
    this.joyR = JOY_R * this.scaleOf('joy');
  }
  saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch { /* yok say */ } }

  setupEditor() {
    const bar = document.getElementById('touchEdit');
    this.bar = bar;
    this.selSlider = document.getElementById('teSel');
    this.allSlider = document.getElementById('teAll');
    this.selSlider.addEventListener('input', () => {
      if (!this.sel) return;
      const item = this.layout.items[this.sel] || (this.layout.items[this.sel] = {});
      item.s = Number(this.selSlider.value);
      this.applyLayout();
    });
    this.allSlider.addEventListener('input', () => { this.layout.global = Number(this.allSlider.value); this.applyLayout(); });
    document.getElementById('teReset').addEventListener('click', () => {
      this.layout = { global: 1, items: {} };
      this.allSlider.value = 1;
      this.select(null);
      this.applyLayout();
    });
    document.getElementById('teDone').addEventListener('click', () => this.stopEdit());
  }

  startEdit() {
    this.releaseAll();
    this.editing = true;
    this.layer.classList.remove('hidden');
    this.layer.classList.add('editing');
    this.bar.classList.remove('hidden');
    this.allSlider.value = this.layout.global;
    // Düzenlerken gizli butonlar da görünsün ki yerleştirilebilsin
    for (const el of Object.values(this.els)) el.classList.remove('hidden');
    this.cache = {};
    this.select(null);
  }
  stopEdit() {
    this.editing = false;
    this.layer.classList.remove('editing');
    this.bar.classList.add('hidden');
    this.select(null);
    this.saveLayout();
    if (this.onEditDone) this.onEditDone();
  }
  select(k) {
    if (this.sel) this.els[this.sel].classList.remove('sel');
    this.sel = k;
    document.getElementById('teSelLbl').textContent = k ? (k === 'joy' ? 'Joystick' : this.els[k].textContent) : 'bir buton seç';
    this.selSlider.disabled = !k;
    if (k) { this.els[k].classList.add('sel'); this.selSlider.value = this.layout.items[k]?.s ?? 1; }
  }

  // ---------------- Dokunma olayları
  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.editing) {
        const el = t.target.closest && t.target.closest('[data-edit]');
        if (!el) continue;
        const k = el.dataset.edit;
        this.select(k);
        const r = el.getBoundingClientRect();
        this.drag = { id: t.identifier, k, dx: t.clientX - (r.left + r.width / 2), dy: t.clientY - (r.top + r.height / 2) };
        continue;
      }
      const b = t.target.closest && t.target.closest('[data-act]');
      if (b) {
        this.btn.set(t.identifier, { act: b.dataset.act, x: t.clientX, y: t.clientY });
        b.classList.add('down');
        this.h.press(b.dataset.act, true);
      } else if (t.clientX < window.innerWidth * 0.42 && !this.joy) {
        this.joy = { id: t.identifier, cx: t.clientX, cy: t.clientY };
        this.base.style.left = t.clientX + 'px';
        this.base.style.top = t.clientY + 'px';
        this.base.classList.add('active');
      } else if (!this.look) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.drag && t.identifier === this.drag.id) {
        const x = Math.max(10, Math.min(innerWidth - 10, t.clientX - this.drag.dx));
        const y = Math.max(10, Math.min(innerHeight - 10, t.clientY - this.drag.dy));
        const item = this.layout.items[this.drag.k] || (this.layout.items[this.drag.k] = {});
        item.x = x / innerWidth;
        item.y = y / innerHeight;
        this.applyLayout();
        continue;
      }
      if (this.joy && t.identifier === this.joy.id) {
        const R = this.joyR || JOY_R;
        let dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this.move.x = dx / R;
        this.move.y = dy / R;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (this.look && t.identifier === this.look.id) {
        this.h.look(t.clientX - this.look.x, t.clientY - this.look.y);
        this.look.x = t.clientX;
        this.look.y = t.clientY;
      } else {
        // Ateş butonuna basılıyken parmağı kaydırmak da nişan aldırır
        const b = this.btn.get(t.identifier);
        if (b && b.act === 'fire') {
          this.h.look(t.clientX - b.x, t.clientY - b.y);
          b.x = t.clientX;
          b.y = t.clientY;
        }
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.drag && t.identifier === this.drag.id) { this.drag = null; continue; }
      if (this.joy && t.identifier === this.joy.id) this.resetJoy();
      else if (this.look && t.identifier === this.look.id) this.look = null;
      else {
        const b = this.btn.get(t.identifier);
        if (!b) continue;
        this.btn.delete(t.identifier);
        this.els[b.act].classList.remove('down');
        this.h.press(b.act, false);
      }
    }
  }

  resetJoy() {
    this.joy = null;
    this.move.x = 0;
    this.move.y = 0;
    this.knob.style.transform = '';
    this.base.classList.remove('active');
    this.applyLayout();
  }

  releaseAll() {
    for (const b of this.btn.values()) {
      this.els[b.act].classList.remove('down');
      this.h.press(b.act, false);
    }
    this.btn.clear();
    this.look = null;
    this.drag = null;
    this.resetJoy();
  }

  setVisible(v) {
    this.layer.classList.toggle('hidden', !v);
    if (!v) this.releaseAll();
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn();
  }

  // st: { alive, alt: etiket|null, use: etiket|null, buy, crouch }
  update(st) {
    if (this.editing) return;
    this.set('alive', st.alive, () => this.layer.classList.toggle('dead', !st.alive));
    this.set('alt', st.alt, () => { this.els.alt.classList.toggle('hidden', !st.alt); if (st.alt) this.els.alt.textContent = st.alt; });
    this.set('use', st.use, () => { this.els.use.classList.toggle('hidden', !st.use); if (st.use) this.els.use.textContent = st.use; });
    this.set('buy', st.buy, () => this.els.buy.classList.toggle('hidden', !st.buy));
    this.set('crouch', st.crouch, () => this.els.crouch.classList.toggle('on', st.crouch));
  }
}

export function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    const lock = () => { try { const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (q && q.catch) q.catch(() => {}); } catch { /* yok say */ } };
    if (p && p.then) p.then(lock).catch(() => {}); else lock();
  } catch { /* iPhone Safari tam ekranı desteklemez */ }
}

// ---------------- Jiroskop ile nişan
// Telefonun dönüş hızı (derece/sn) bakış açısına çevrilir. Telefonun nasıl tutulduğu (yatay/dikey)
// ekran açısından değil yerçekimi yönünden bulunur: bazı tarayıcılar ve uygulama içi WebView ekran
// açısını yanlış bildirdiği için yatayda yukarı-aşağı hareket sağa-sola dönüşüyordu.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export class Gyro {
  constructor(onTurn) {
    this.onTurn = onTurn;
    this.enabled = false;
    this.last = 0;
    this.gx = 0; this.gy = 0; this.axis = null;
    this.handler = (e) => this.onMotion(e);
  }
  async enable() {
    const DME = window.DeviceMotionEvent;
    if (!DME) return 'unsupported';
    if (typeof DME.requestPermission === 'function') {
      // iOS 13+: kullanıcı dokunuşu içinde izin istenmeli
      try { if ((await DME.requestPermission()) !== 'granted') return 'denied'; } catch { return 'denied'; }
    }
    window.addEventListener('devicemotion', this.handler);
    this.gInit = false; this.axis = null;
    this.enabled = true;
    this.last = 0;
    return 'ok';
  }
  disable() {
    window.removeEventListener('devicemotion', this.handler);
    this.enabled = false;
  }
  onMotion(e) {
    const r = e.rotationRate;
    if (!r || r.alpha === null) return;
    const now = performance.now();
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!dt) return;
    // Ekranın "yukarı" yönü (u): yerçekimi okumasından, aynı olaydaki dönüş verisiyle aynı eksen sisteminde
    const g = e.accelerationIncludingGravity;
    if (g && g.x !== null && g.x !== undefined) {
      const s = IS_IOS ? -1 : 1; // iOS yerçekimini ters işaretle bildirir
      if (!this.gInit) { this.gx = g.x * s; this.gy = g.y * s; this.gInit = true; }
      this.gx += (g.x * s - this.gx) * 0.15;
      this.gy += (g.y * s - this.gy) * 0.15;
    }
    let ux, uy;
    const ax = Math.abs(this.gx), ay = Math.abs(this.gy);
    if (Math.max(ax, ay) > 3) {
      // Hangi eksen dikeyse onu kullan; titremeyi önlemek için diğeri belirgin büyük olunca değiştir
      if (!this.axis) this.axis = ax > ay ? 'x' : 'y';
      else if (this.axis === 'x' && ay > ax * 1.4) this.axis = 'y';
      else if (this.axis === 'y' && ax > ay * 1.4) this.axis = 'x';
      ux = this.axis === 'x' ? Math.sign(this.gx) : 0;
      uy = this.axis === 'y' ? Math.sign(this.gy) : 0;
    } else {
      // Telefon düz tutuluyorsa ekran açısına dön
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      const a = ((angle % 360) + 360) % 360;
      [ux, uy] = a === 90 ? [1, 0] : a === 270 ? [-1, 0] : a === 180 ? [0, -1] : [0, 1];
    }
    // Sağa-sola dönüş = "yukarı" eksen etrafında, yukarı-aşağı bakış = ekranın yatay ekseni etrafında
    const beta = r.beta || 0, gamma = r.gamma || 0; // beta: x ekseni, gamma: y ekseni (derece/sn)
    const yawRate = beta * ux + gamma * uy;
    const pitchRate = beta * uy - gamma * ux;
    const k = Math.PI / 180 * dt;
    this.onTurn(yawRate * k, pitchRate * k);
  }
  get orientation() { return this.axis === 'x' ? 'yatay' : this.axis === 'y' ? 'dikey' : '?'; }
}
