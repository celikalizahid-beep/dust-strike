// Klasik moddaki ilk doğuş noktaları ortadan görünmemeli ve iki takımın doğuşları birbirini görmemeli.
// Çalıştırma: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, MAPS, MAP_IDS } from '../public/shared/map.js';
import { clearLine, cellPoints, spawnPoints, anyLine, zoneCells, cellOf, walkableCells } from './helpers/map-geometry.js';

const CLASSIC = MAP_IDS.filter((id) => MAPS[id].modes.includes('classic'));
const fmt = (list) => list.slice(0, 12).map((v) => v.join(',')).join('  ') + (list.length > 12 ? ` … (+${list.length - 12})` : '');

test('görüş yardımcısı: duvarın arkası görünmez, açık koridor görünür', () => {
  // Elle kurulmuş küçük ızgara: ortada tek duvar hücresi
  const map = { w: 5, h: 3, grid: ['.....', '..#..', '.....'].map((row) => [...row]) };
  assert.equal(clearLine(map, 0.5, 1.5, 4.5, 1.5), false, 'duvarın içinden geçen doğru kapalı olmalı');
  assert.equal(clearLine(map, 0.5, 0.5, 4.5, 0.5), true, 'duvarın yanından geçen doğru açık olmalı');
  assert.equal(clearLine(map, 0.5, 0.5, 4.5, 2.5), false, 'çapraz doğru duvar hücresini kesiyor');
  assert.equal(clearLine(map, 4.5, 0.5, 0.5, 0.5), true, 'ters yönde de aynı sonuç');
});

for (const id of CLASSIC) {
  const map = buildMap(id);

  test(`${id}: orta bölge tanımlı ve yürünebilir`, () => {
    assert.ok(Array.isArray(map.mid) && map.mid.length > 0, 'haritada "mid" (orta bölge) tanımı yok');
    const cells = zoneCells(map, map.mid);
    assert.ok(cells.length >= 40, `orta bölge çok küçük: ${cells.length} hücre`);
    // Orta bölge doğuş noktalarını içeremez (yoksa test anlamsızlaşır)
    const spawnCells = new Set([...map.spawns.T, ...map.spawns.CT].map((s) => cellOf(map, s[0], s[2]).join(',')));
    assert.deepEqual(cells.filter((c) => spawnCells.has(c.join(','))), [], 'orta bölge doğuş noktası içeriyor');
  });

  test(`${id}: hiçbir doğuş noktası ortadan görünmüyor`, () => {
    const cells = zoneCells(map, map.mid || []);
    const eyes = cells.map(([c, r]) => ({ cell: [c, r], pts: cellPoints(c, r) }));
    for (const team of ['T', 'CT']) {
      const seen = [];
      for (const s of map.spawns[team]) {
        const body = spawnPoints(map, s);
        const from = eyes.filter((e) => anyLine(map, e.pts, body)).map((e) => e.cell);
        if (from.length) seen.push([...cellOf(map, s[0], s[2]), `<- ${from.length} hücreden`]);
      }
      assert.equal(seen.length, 0, `${team} doğuş noktaları ortadan görünüyor (sütun,satır): ${fmt(seen)}`);
    }
  });

  test(`${id}: T ve CT doğuş noktaları birbirini görmüyor`, () => {
    const pairs = [];
    for (const a of map.spawns.T) {
      const pa = spawnPoints(map, a);
      for (const b of map.spawns.CT) if (anyLine(map, pa, spawnPoints(map, b))) pairs.push([...cellOf(map, a[0], a[2]), '<->', ...cellOf(map, b[0], b[2])]);
    }
    assert.equal(pairs.length, 0, `birbirini gören doğuş çiftleri: ${fmt(pairs)}`);
  });

  test(`${id}: her takımda tam kadro (10 kişi) için ayrı doğuş noktası var`, () => {
    for (const team of ['T', 'CT']) assert.ok(map.spawns[team].length >= 10, `${team}: ${map.spawns[team].length} doğuş noktası`);
  });

  test(`${id}: doğuş noktaları satın alma alanının içinde`, () => {
    for (const team of ['T', 'CT']) {
      const out = map.spawns[team].filter((s) => !map.inBuyZone(team, s[0], s[2])).map((s) => cellOf(map, s[0], s[2]));
      assert.deepEqual(out, [], `${team}: satın alma alanı dışında doğuş noktası`);
    }
  });

  test(`${id}: doğuşlardan orta, bomba bölgeleri ve karşı doğuş yürüyerek ulaşılabilir`, () => {
    const reach = walkableCells(map, map.spawns.T[0]);
    const has = ([c, r]) => reach.has(`${c},${r}`);
    for (const team of ['T', 'CT']) {
      const lost = map.spawns[team].map((s) => cellOf(map, s[0], s[2])).filter((c) => !has(c));
      assert.deepEqual(lost, [], `${team} doğuş noktalarına ulaşılamıyor`);
    }
    const midLost = zoneCells(map, map.mid || []).filter((c) => map.grid[c[1]][c[0]] === '.' && !has(c));
    assert.deepEqual(midLost, [], 'orta bölgenin bazı hücrelerine ulaşılamıyor');
    for (const [name, s] of Object.entries(map.sites)) {
      const c = cellOf(map, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
      // Bölge merkezinde sandık olabilir: merkezin çevresindeki hücrelerden biri yeterli
      const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => [c[0] + dc, c[1] + dr]);
      assert.ok(near.some(has), `${name} bölgesine ulaşılamıyor`);
    }
  });
}
