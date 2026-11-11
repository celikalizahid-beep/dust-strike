// Oyuncu isabet kutuları: kafa, gövde ve bacak (eksene hizalı). İstemci atışları bu kutulara göre hesaplar;
// görünen model (public/js/rig.js) bu ölçülerle örtüşecek biçimde kurulmuştur (tests/rig.test.js).
export const CROUCH_DROP = 0.5; // tam eğilince üst gövdenin alçalma miktarı (m)

// x, y, z: oyuncunun ayak noktası; crouch: 0 ayakta … 1 eğilmiş
export function playerHitboxes(x, y, z, crouch = 0) {
  const off = crouch * CROUCH_DROP;
  const box = (zone, hw, y0, y1) => ({ zone, min: [x - hw, y + y0, z - hw], max: [x + hw, y + y1, z + hw] });
  return [
    box('head', 0.16, 1.47 - off, 1.78 - off),
    box('body', 0.27, 0.85 - off, 1.47 - off),
    box('legs', 0.22, 0, 0.85 - off),
  ];
}
