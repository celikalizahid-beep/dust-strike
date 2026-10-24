// Tüm sesler WebAudio ile anında sentezleniyor (ses dosyası yok). Uzaktaki sesler 3D konumlu (HRTF).
let ctx = null, master = null, wet = null, noise = null;
let volume = 0.6;

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 6;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(comp);
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(1.4, 2.6);
  wet = ctx.createGain();
  wet.gain.value = 0.2;
  wet.connect(conv);
  conv.connect(master);
  noise = makeNoise(2);
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function makeNoise(sec) {
  const b = ctx.createBuffer(1, Math.floor(sec * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function makeImpulse(sec, decay) {
  const len = Math.floor(sec * ctx.sampleRate);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

// Sesi ana çıkışa (konum verildiyse 3D panner üzerinden) bağlayan giriş düğümü
function out(pos, vol = 1, reverb = 1) {
  const g = ctx.createGain();
  g.gain.value = vol;
  if (pos) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 0.9;
    p.maxDistance = 300;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p);
    p.connect(master);
    const s = ctx.createGain();
    s.gain.value = reverb;
    p.connect(s);
    s.connect(wet);
  } else {
    g.connect(master);
    const s = ctx.createGain();
    s.gain.value = 0.5 * reverb;
    g.connect(s);
    s.connect(wet);
  }
  return g;
}

function burst(dst, t, dur, type, freq, q, vol, attack = 0.002) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dst);
  src.start(t, Math.random() * 1.4, dur + 0.05);
  return f;
}

function tone(dst, t, dur, type, f0, f1, vol, attack = 0.002) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dst);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// [çatlama frekansı, süre, ses] [gövde frekansı, süre, ses] [gümleme f0, f1, süre, ses]
const GUN = {
  glock: [[3500, 0.05, 0.5], [2200, 0.14, 0.7], [220, 60, 0.1, 0.5]],
  usp: [[3000, 0.05, 0.45], [1800, 0.16, 0.75], [180, 55, 0.12, 0.55]],
  deagle: [[2500, 0.07, 0.8], [1300, 0.32, 1.0], [130, 40, 0.25, 0.9]],
  mp5: [[3800, 0.04, 0.4], [2600, 0.11, 0.6], [200, 70, 0.08, 0.4]],
  p90: [[4200, 0.04, 0.35], [3000, 0.1, 0.55], [240, 80, 0.07, 0.35]],
  galil: [[3200, 0.05, 0.55], [1700, 0.2, 0.8], [150, 50, 0.15, 0.7]],
  famas: [[3300, 0.05, 0.55], [1800, 0.19, 0.8], [155, 50, 0.14, 0.7]],
  ak47: [[2800, 0.06, 0.65], [1200, 0.27, 1.0], [120, 42, 0.2, 0.9]],
  m4a1: [[3400, 0.05, 0.55], [1600, 0.2, 0.85], [140, 48, 0.15, 0.75]],
  scout: [[3000, 0.07, 0.7], [1300, 0.35, 0.9], [110, 40, 0.25, 0.8]],
  awp: [[2400, 0.09, 1.0], [800, 0.6, 1.2], [80, 30, 0.45, 1.2]],
};

export function gun(name, pos) {
  if (!ctx) return;
  const p = GUN[name] || GUN.m4a1;
  const t = ctx.currentTime;
  const o = out(pos, pos ? 1.4 : 0.9, 1.2);
  const v = 0.9 + Math.random() * 0.2;
  burst(o, t, p[0][1], 'highpass', p[0][0] * v, 0.7, p[0][2]);
  burst(o, t, p[1][1], 'lowpass', p[1][0] * v, 0.8, p[1][2], 0.003);
  tone(o, t, p[2][2], 'sine', p[2][0] * v, p[2][1], p[2][3], 0.003);
}

export function step(pos, vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, vol, 0.4);
  burst(o, t, 0.08, 'bandpass', 380 + Math.random() * 300, 1.2, 0.6, 0.004);
  tone(o, t, 0.06, 'sine', 95, 55, 0.35, 0.003);
}

export function land(vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, vol, 0.3);
  burst(o, t, 0.12, 'lowpass', 500, 1, 0.8, 0.003);
}

export function dry() {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(out(null, 0.5, 0.2), t, 0.03, 'highpass', 3000, 1, 0.6);
}

export function deploy() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.35, 0.2);
  burst(o, t, 0.04, 'bandpass', 2400, 2, 0.6);
  burst(o, t + 0.12, 0.05, 'bandpass', 1600, 2, 0.6);
}

export function reload(name, dur) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.45, 0.2);
  burst(o, t + 0.12, 0.05, 'bandpass', 1800, 2, 0.7);
  burst(o, t + dur * 0.55, 0.06, 'bandpass', 1300, 2, 0.9);
  burst(o, t + dur * 0.82, 0.04, 'highpass', 2600, 1, 0.7);
  burst(o, t + dur * 0.88, 0.05, 'bandpass', 1500, 2, 0.8);
}

export function knifeSwing(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = burst(out(pos, 0.5, 0.2), t, 0.18, 'bandpass', 2400, 1.5, 0.5, 0.03);
  f.frequency.exponentialRampToValueAtTime(600, t + 0.18);
}
export function knifeHit(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 0.7, 0.3);
  burst(o, t, 0.12, 'lowpass', 900, 1, 0.9);
  tone(o, t, 0.08, 'triangle', 300, 120, 0.4);
}
export function knifeWall() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.5, 0.3);
  burst(o, t, 0.05, 'highpass', 3500, 1, 0.7);
  tone(o, t, 0.12, 'triangle', 2200, 1800, 0.15);
}

export function hitBody() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.45, 0.1);
  burst(o, t, 0.06, 'lowpass', 700, 1, 0.8);
}
export function headshot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.5, 0.4);
  tone(o, t, 0.3, 'sine', 1900, 1700, 0.35);
  tone(o, t, 0.22, 'sine', 2850, 2600, 0.2);
  burst(o, t, 0.05, 'highpass', 4000, 1, 0.4);
}
export function hurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.6, 0.2);
  burst(o, t, 0.12, 'lowpass', 400, 1, 0.9);
  tone(o, t, 0.1, 'sine', 120, 60, 0.5);
}
export function death() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.6, 0.5);
  tone(o, t, 0.5, 'sawtooth', 220, 70, 0.15, 0.01);
  burst(o, t, 0.3, 'lowpass', 500, 1, 0.6);
}

export function nadeThrow() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = burst(out(null, 0.4, 0.2), t, 0.2, 'bandpass', 900, 1.2, 0.5, 0.05);
  f.frequency.exponentialRampToValueAtTime(400, t + 0.2);
}
export function nadeBounce(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 0.7, 0.4);
  tone(o, t, 0.12, 'triangle', 1500 + Math.random() * 500, 900, 0.25);
  burst(o, t, 0.04, 'highpass', 3000, 1, 0.3);
}
export function explosion(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 2.2, 1.6);
  burst(o, t, 1.6, 'lowpass', 700, 0.7, 1.2, 0.005);
  burst(o, t, 0.25, 'highpass', 2000, 0.7, 0.6);
  tone(o, t, 0.9, 'sine', 70, 25, 1.2, 0.005);
}
export function flashPop(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 1.6, 1.2);
  burst(o, t, 0.35, 'highpass', 1500, 0.7, 1.0);
  tone(o, t, 0.2, 'sine', 160, 50, 0.6);
}
export function smokeHiss(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 1.0, 0.5);
  burst(o, t, 0.15, 'lowpass', 600, 1, 0.6);
  burst(o, t + 0.05, 3.5, 'highpass', 2500, 0.5, 0.35, 0.3);
}
export function ringing(k, dur) {
  if (!ctx || k < 0.25) return;
  const t = ctx.currentTime;
  tone(out(null, 0.25 * k, 0), t, dur, 'sine', 3600, 3500, 0.5, 0.05);
}

export function beep(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(out(pos, 1.0, 0.6), t, 0.09, 'square', 2600, 2600, 0.12, 0.002);
}
export function keypad() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.4, 0.2);
  for (let i = 0; i < 7; i++) tone(o, t + i * 0.32, 0.07, 'sine', 900 + ((i * 377) % 700), 900 + ((i * 377) % 700), 0.3);
}
export function defuseTick(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(out(pos, 0.6, 0.2), t, 0.03, 'bandpass', 2000, 3, 0.5);
}
export function planted() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.5, 0.5);
  tone(o, t, 0.15, 'square', 880, 880, 0.15);
  tone(o, t + 0.18, 0.15, 'square', 880, 880, 0.15);
  tone(o, t + 0.36, 0.3, 'square', 660, 660, 0.15);
}
export function roundEnd(won) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.45, 0.6);
  const notes = won ? [523, 659, 784, 1046] : [523, 466, 392, 311];
  notes.forEach((f, i) => tone(o, t + i * 0.13, 0.25, 'triangle', f, f, 0.3, 0.01));
}
export function roundStart() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.4, 0.4);
  tone(o, t, 0.12, 'square', 700, 700, 0.12);
  tone(o, t + 0.15, 0.25, 'square', 1050, 1050, 0.12);
}
export function buy() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(null, 0.35, 0.2);
  tone(o, t, 0.08, 'triangle', 1400, 1400, 0.3);
  tone(o, t + 0.07, 0.15, 'triangle', 2100, 2100, 0.3);
}
export function chatBlip() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(out(null, 0.25, 0), t, 0.06, 'sine', 1200, 1200, 0.3);
}

export function setListener(pos, fwd, up) {
  if (!ctx) return;
  const l = ctx.listener;
  if (l.positionX) {
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}
