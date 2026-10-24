// Dokunmatik kontroller (Android / iOS): solda sanal joystick, sağda kaydırarak bakış ve ekran butonları.

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
const JOY_R = 55;

export class TouchControls {
  // h.look(dx, dy): bakış; h.press(act, down): buton basıldı / bırakıldı
  constructor(h) {
    this.h = h;
    this.move = { x: 0, y: 0 };
    this.joy = null;
    this.look = null;
    this.btn = new Map();
    this.cache = {};
    this.layer = document.getElementById('touch');
    this.base = document.createElement('div');
    this.base.className = 'joyBase';
    this.knob = document.createElement('div');
    this.knob.className = 'joyKnob';
    this.base.appendChild(this.knob);
    this.layer.appendChild(this.base);
    this.els = {};
    for (const [act, label] of BUTTONS) {
      const b = document.createElement('div');
      b.className = 'tbtn t-' + act;
      b.dataset.act = act;
      b.textContent = label;
      this.layer.appendChild(b);
      this.els[act] = b;
    }
    const opt = { passive: false };
    this.layer.addEventListener('touchstart', (e) => this.onStart(e), opt);
    this.layer.addEventListener('touchmove', (e) => this.onMove(e), opt);
    this.layer.addEventListener('touchend', (e) => this.onEnd(e), opt);
    this.layer.addEventListener('touchcancel', (e) => this.onEnd(e), opt);
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
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
      if (this.joy && t.identifier === this.joy.id) {
        let dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
        this.move.x = dx / JOY_R;
        this.move.y = dy / JOY_R;
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
    this.base.style.left = '';
    this.base.style.top = '';
  }

  releaseAll() {
    for (const b of this.btn.values()) {
      this.els[b.act].classList.remove('down');
      this.h.press(b.act, false);
    }
    this.btn.clear();
    this.look = null;
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
