// Vuruş bildirimi, leş serisi ve maç sonu ödülleri: gerçek sunucuya WebSocket ile bağlanarak denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until, sleep } from './helpers/server.js';

// a, b'yi tabancasıyla vurur (hasarı sunucu hesaplar). Atış hızı sınırına takılmamak için aralıklı ateş edilir.
const gunOf = (c) => c.messages.filter((m) => m.t === 'you' && m.secondary).at(-1).secondary;
const shoot = (a, bId, zone = 'head') => a.send({ t: 'shot', w: gunOf(a), o: [0, 1.6, 0], e: [0, 1.6, 1], hits: [{ id: bId, z: zone }] });
async function killOnce(a, v, vId) {
  const before = a.messages.filter((m) => m.t === 'kill' && m.v === vId).length;
  await until(async () => {
    shoot(a, vId);
    await sleep(120);
    return a.messages.filter((m) => m.t === 'kill' && m.v === vId).length > before;
  }, 15000, 'leş');
  return a.messages.filter((m) => m.t === 'kill' && m.v === vId).at(-1);
}

test('vuruş hissi', async (t) => {
  const srv = await startServer({ DM_TIME: '26' });
  t.after(() => srv.stop());
  const a = srv.connect({ ip: '203.0.113.41', cid: 'his-saldiran-00001' });
  const b = srv.connect({ ip: '203.0.113.42', cid: 'his-kurban-000001' });
  const aId = await a.join({ name: 'Avcı', mode: 'ffa', map: 'arena' });
  const bId = await b.join({ name: 'Hedef', mode: 'ffa', map: 'arena' });

  await t.test('vuran oyuncuya verdiği hasar bildirilir', async () => {
    await until(async () => { shoot(a, bId, 'body'); await sleep(120); return a.has('hit'); }, 8000, 'hit mesajı');
    const hit = a.messages.find((m) => m.t === 'hit');
    assert.equal(hit.v, bId);
    assert.ok(hit.d > 0, 'hasar sayısı');
    assert.equal(typeof hit.hs, 'boolean');
    assert.equal(b.has('hit'), false, 'kurbana "hit" gitmez');
  });

  await t.test('art arda leşlerde seri sayılır, ölünce sıfırlanır ve biten seri bildirilir', async () => {
    // Isınma bitip maç başlayınca sayaçlar sıfırlanır: seri maçın içinde ölçülür
    await until(() => a.messages.some((m) => m.t === 'state' && m.phase === 'live'), 12000, 'maçın başlaması');
    let k = await killOnce(a, b, bId);
    const first = k.s;
    assert.ok(first >= 1);
    await b.next('spawn', 8000);
    k = await killOnce(a, b, bId);
    assert.equal(k.s, first + 1);
    await b.next('spawn', 8000);
    k = await killOnce(a, b, bId);
    assert.equal(k.s, first + 2);
    await b.next('spawn', 8000);
    // Kurban, serideki avcıyı öldürür: avcının serisi biter
    const end = await killOnce(b, a, aId);
    assert.equal(end.s, 1);
    assert.equal(end.e, first + 2, 'bitirilen seri');
  });

  await t.test('maç bitince ödüller gönderilir', async () => {
    const rend = await until(() => a.messages.find((m) => m.t === 'rend' && m.final), 45000, 'maç sonu');
    assert.ok(rend.awards, 'ödüller');
    assert.equal(rend.awards.mvp.id, aId);
    assert.ok(rend.awards.mvp.v >= 1);
    assert.ok(rend.awards.streak.v >= 1);
    assert.ok(rend.awards.dmg.v > 0);
    assert.equal(typeof rend.awards.mvp.name, 'string');
  });
});
