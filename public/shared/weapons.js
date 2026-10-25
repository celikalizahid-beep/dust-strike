// Silah ve ekipman verileri (CS 1.6 değerlerinden esinlenildi). Mesafeler metre, süreler saniye.
// spread: radyan cinsinden sapma; recoil: her atışta görüşün yukarı tepmesi.

export const WEAPONS = {
  knife: { name: 'Bıçak', slot: 3, price: 0, dmg: 25, dmg2: 65, rate: 0.45, rate2: 1.0, range: 2.0, range2: 1.6, speed: 6.35, reward: 1500, melee: true, draw: 0.4 },

  glock: { name: 'Glock-18', cls: 'pistol', slot: 2, team: 'T', price: 200, dmg: 25, rate: 0.15, mag: 20, reserve: 120, spread: 0.01, moveSpread: 0.035, jumpSpread: 0.12, recoil: 0.012, pen: 0.47, falloff: 0.75, reload: 2.2, speed: 6.35, reward: 300, draw: 0.6 },
  usp: { name: 'USP', cls: 'pistol', slot: 2, team: 'CT', price: 200, dmg: 34, rate: 0.17, mag: 12, reserve: 100, spread: 0.008, moveSpread: 0.03, jumpSpread: 0.12, recoil: 0.015, pen: 0.5, falloff: 0.79, reload: 2.7, speed: 6.35, reward: 300, draw: 0.6 },
  deagle: { name: 'Desert Eagle', cls: 'pistol', slot: 2, price: 650, dmg: 54, rate: 0.28, mag: 7, reserve: 35, spread: 0.008, moveSpread: 0.06, jumpSpread: 0.2, recoil: 0.045, pen: 0.75, falloff: 0.81, reload: 2.2, speed: 6.35, reward: 300, draw: 0.7 },

  mp5: { name: 'MP5', cls: 'smg', slot: 1, price: 1500, dmg: 26, rate: 0.08, mag: 30, reserve: 120, spread: 0.011, moveSpread: 0.025, jumpSpread: 0.1, recoil: 0.009, pen: 0.5, falloff: 0.84, reload: 2.6, speed: 6.35, reward: 600, auto: true, draw: 0.7 },
  p90: { name: 'P90', cls: 'smg', slot: 1, price: 2350, dmg: 21, rate: 0.066, mag: 50, reserve: 100, spread: 0.012, moveSpread: 0.02, jumpSpread: 0.1, recoil: 0.008, pen: 0.69, falloff: 0.86, reload: 3.4, speed: 6.1, reward: 300, auto: true, draw: 0.7 },

  galil: { name: 'Galil', cls: 'rifle', slot: 1, team: 'T', price: 2000, dmg: 30, rate: 0.09, mag: 35, reserve: 90, spread: 0.007, moveSpread: 0.065, jumpSpread: 0.25, recoil: 0.017, pen: 0.75, falloff: 0.98, reload: 2.6, speed: 5.75, reward: 300, auto: true, draw: 0.9 },
  famas: { name: 'FAMAS', cls: 'rifle', slot: 1, team: 'CT', price: 2250, dmg: 30, rate: 0.09, mag: 25, reserve: 90, spread: 0.006, moveSpread: 0.065, jumpSpread: 0.25, recoil: 0.016, pen: 0.7, falloff: 0.96, reload: 3.3, speed: 5.7, reward: 300, auto: true, draw: 0.9 },
  ak47: { name: 'AK-47', cls: 'rifle', slot: 1, team: 'T', price: 2500, dmg: 36, rate: 0.1, mag: 30, reserve: 90, spread: 0.006, moveSpread: 0.07, jumpSpread: 0.25, recoil: 0.02, pen: 0.775, falloff: 0.98, reload: 2.5, speed: 5.6, reward: 300, auto: true, draw: 0.9 },
  m4a1: { name: 'M4A1', cls: 'rifle', slot: 1, team: 'CT', price: 3100, dmg: 33, rate: 0.09, mag: 30, reserve: 90, spread: 0.005, moveSpread: 0.06, jumpSpread: 0.25, recoil: 0.016, pen: 0.7, falloff: 0.97, reload: 3.1, speed: 5.8, reward: 300, auto: true, draw: 0.9 },
  scout: { name: 'Scout', cls: 'sniper', slot: 1, price: 2750, dmg: 75, rate: 1.25, mag: 10, reserve: 90, spread: 0.03, scopedSpread: 0.0006, moveSpread: 0.05, jumpSpread: 0.08, recoil: 0.03, pen: 0.85, falloff: 0.98, reload: 2.0, speed: 6.35, reward: 300, scope: true, zoom: [28, 12], draw: 1.0 },
  awp: { name: 'AWP', cls: 'sniper', slot: 1, price: 4750, dmg: 115, rate: 1.45, mag: 10, reserve: 30, spread: 0.08, scopedSpread: 0.0005, moveSpread: 0.15, jumpSpread: 0.3, recoil: 0.06, pen: 0.97, falloff: 0.99, reload: 3.6, speed: 5.3, reward: 100, scope: true, zoom: [28, 9], draw: 1.1 },

  he: { name: 'HE Bombası', slot: 4, price: 300, nade: 'he', max: 1, speed: 6.35, reward: 300, draw: 0.5 },
  flash: { name: 'Flaş Bombası', slot: 4, price: 200, nade: 'flash', max: 2, speed: 6.35, draw: 0.5 },
  smoke: { name: 'Sis Bombası', slot: 4, price: 300, nade: 'smoke', max: 1, speed: 6.35, draw: 0.5 },

  bomb: { name: 'C4', slot: 5, price: 0, speed: 6.35, draw: 0.5 },
};

export const ITEMS = {
  vest: { name: 'Kevlar Yelek', price: 650 },
  vesthelm: { name: 'Kevlar + Kask', price: 1000 },
  kit: { name: 'İmha Kiti', price: 200, team: 'CT' },
};

export const DEFAULT_PISTOL = { T: 'glock', CT: 'usp' };

export const BUY_MENU = [
  { name: 'Tabancalar', items: ['glock', 'usp', 'deagle'] },
  { name: 'Hafif Makineli', items: ['mp5', 'p90'] },
  { name: 'Tüfekler', items: ['galil', 'famas', 'ak47', 'm4a1', 'scout', 'awp'] },
  { name: 'Ekipman', items: ['vest', 'vesthelm', 'he', 'flash', 'smoke', 'kit'] },
  { name: 'Eklentiler', items: ['att_sil', 'att_dot', 'att_mag', 'att_grip'] },
];

// Silah eklentileri: hangi silah sınıfına takılabildikleri ve etkileri
export const ATTACHMENTS = {
  sil: { name: 'Susturucu', short: 'S', price: 400, cls: ['pistol', 'smg', 'rifle'], desc: 'Sessiz atış: namlu alevi ve mermi izi görünmez' },
  dot: { name: 'Kırmızı Nokta', short: 'D', price: 350, cls: ['smg', 'rifle'], desc: 'Sağ tık / NİŞAN: 1.6x yakınlaştırma, daha isabetli' },
  mag: { name: 'Uzun Şarjör', short: 'M', price: 300, cls: ['pistol', 'smg', 'rifle', 'sniper'], desc: '%50 daha fazla mermi' },
  grip: { name: 'Tutamaç', short: 'G', price: 300, cls: ['smg', 'rifle'], desc: '%30 daha az tepme' },
};
export const canAttach = (wname, att) => !!WEAPONS[wname] && !!ATTACHMENTS[att] && ATTACHMENTS[att].cls.includes(WEAPONS[wname].cls);
export function magSize(wname, atts) {
  const w = WEAPONS[wname];
  if (!w || !w.mag) return 0;
  return atts && atts.includes('mag') ? Math.round(w.mag * 1.5) : w.mag;
}
export const attCode = (atts) => (atts || []).map((a) => ATTACHMENTS[a]?.short || '').join('');
export const attFromCode = (code) => Object.keys(ATTACHMENTS).filter((k) => (code || '').includes(ATTACHMENTS[k].short));

export const ZONE_MULT = { head: 4, body: 1, legs: 0.75 };

export function calcDamage(wname, zone, dist, armor, helmet, alt) {
  const w = WEAPONS[wname];
  if (!w) return { hp: 0, armor: 0 };
  let dmg;
  if (w.melee) dmg = alt ? w.dmg2 : w.dmg;
  else dmg = w.dmg * Math.pow(w.falloff, dist / 12.7) * (ZONE_MULT[zone] || 1);
  let armorLoss = 0;
  const covered = zone === 'body' || (zone === 'head' && helmet);
  if (armor > 0 && covered) {
    const pen = w.melee ? 0.85 : w.pen;
    let reduced = dmg * pen;
    armorLoss = (dmg - reduced) * 0.5;
    if (armorLoss > armor) { reduced = dmg - armor * 2; armorLoss = armor; }
    dmg = reduced;
  }
  return { hp: Math.max(1, Math.round(dmg)), armor: Math.round(armorLoss) };
}

export function blastDamage(raw, armor) {
  if (armor > 0) {
    const loss = Math.min(armor, raw * 0.5);
    return { hp: Math.max(1, Math.round(raw - loss)), armor: Math.round(loss) };
  }
  return { hp: Math.max(1, Math.round(raw)), armor: 0 };
}
