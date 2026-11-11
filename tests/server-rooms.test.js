// Özel odalar, botlar ve sesli sohbet sinyalleşmesi: gerçek sunucuya WebSocket ile bağlanarak denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until, sleep } from './helpers/server.js';

const create = async (c, opts = {}) => {
  await c.opened;
  c.send({ t: 'create', name: opts.name || 'Kurucu', mode: opts.mode || 'tdm', map: opts.map || 'arena', team: 'auto', bots: opts.bots ?? 0, cid: c.cid });
  const room = await c.next('room');
  await c.next('spawn');
  return room;
};
const joinCode = async (c, code, name = 'Misafir') => {
  await c.opened;
  c.send({ t: 'join', code, name, team: 'auto', cid: c.cid });
};
const lastRoster = (c) => c.messages.filter((m) => m.t === 'roster').at(-1)?.ps || [];

test('özel oda', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('kurulan oda 6 haneli kod verir, genel listede görünmez, kodla girilir', async () => {
    const host = srv.connect({ ip: '203.0.113.1', cid: 'oda-kurucu-000001' });
    const room = await create(host);
    assert.match(room.code, /^[A-Z0-9]{6}$/);
    assert.equal(room.mode, 'tdm');
    assert.equal(room.map, 'arena');
    const lobby = srv.connect({ ip: '203.0.113.2', cid: 'oda-misafir-00002' });
    const rooms = (await lobby.next('rooms')).rooms;
    assert.equal(Object.values(rooms).some((r) => r.total > 0), false, 'özel odadaki oyuncu genel odalarda sayılmamalı');
    assert.equal(Object.keys(rooms).some((k) => k.includes(room.code)), false);

    await joinCode(lobby, room.code.toLowerCase());
    const joined = await lobby.next('room');
    assert.equal(joined.code, room.code, 'kod küçük harfle yazılsa da kabul edilmeli');
    await lobby.next('spawn');
    await until(() => lastRoster(host).length === 2, 3000, 'iki oyunculu liste');
    host.close(); lobby.close();
  });

  await t.test('yanlış kodla girilemez; boşalan oda kapanır', async () => {
    const a = srv.connect({ ip: '203.0.113.3', cid: 'yanlis-kod-0000001' });
    await joinCode(a, 'OLMAYN');
    assert.match((await a.next('joinfail')).text, /oda/i);

    const host = srv.connect({ ip: '203.0.113.4', cid: 'kapanan-oda-000001' });
    const room = await create(host, { bots: 2 });
    host.close();
    await sleep(400);
    await joinCode(a, room.code);
    await a.next('joinfail');
    a.close();
  });

  await t.test('sesli sohbet: açanlar birbirini öğrenir, sinyaller yalnızca aynı odadaki hedefe iletilir', async () => {
    const a = srv.connect({ ip: '203.0.113.5', cid: 'ses-a-00000000001' });
    const room = await create(a);
    const b = srv.connect({ ip: '203.0.113.6', cid: 'ses-b-00000000002' });
    await joinCode(b, room.code); await b.next('spawn');
    const outsider = srv.connect({ ip: '203.0.113.7', cid: 'ses-c-00000000003' });
    await outsider.join({ name: 'Dışarıdan' });
    const idA = a.messages.find((m) => m.t === 'welcome').id, idB = b.messages.find((m) => m.t === 'welcome').id;
    const idOut = outsider.messages.find((m) => m.t === 'welcome').id;

    a.send({ t: 'voice', on: true });
    assert.deepEqual((await a.next('voicepeers')).ids, []);
    b.send({ t: 'voice', on: true });
    assert.deepEqual((await b.next('voicepeers')).ids, [idA]);
    b.send({ t: 'rtc', to: idA, d: { type: 'offer', sdp: 'deneme' } });
    const got = await a.next('rtc');
    assert.equal(got.from, idB);
    assert.deepEqual(got.d, { type: 'offer', sdp: 'deneme' });

    // Oda dışındaki oyuncuya ve oda dışından sinyal iletilmez
    b.send({ t: 'rtc', to: idOut, d: { type: 'offer', sdp: 'x' } });
    outsider.send({ t: 'rtc', to: idA, d: { type: 'offer', sdp: 'y' } });
    await sleep(300);
    assert.equal(outsider.has('rtc'), false);
    assert.equal(a.messages.filter((m) => m.t === 'rtc').length, 1);

    b.send({ t: 'voice', on: false });
    assert.equal((await a.next('voiceleave')).id, idB);
    a.close(); b.close(); outsider.close();
  });
});

test('botlar', async (t) => {
  await t.test('özel odada istenen sayıda bot oynar: hareket eder, takımlara dağılır', async () => {
    const srv = await startServer();
    t.after(() => srv.stop());
    const host = srv.connect({ ip: '203.0.113.20', cid: 'bot-odasi-0000001' });
    await create(host, { bots: 3, mode: 'tdm', map: 'arena' });
    await until(() => lastRoster(host).filter((p) => p.bot).length === 3, 4000, '3 botun listeye girmesi');
    const roster = lastRoster(host);
    assert.equal(roster.length, 4);
    assert.ok(roster.some((p) => p.team === 'T') && roster.some((p) => p.team === 'CT'), 'iki takımda da oyuncu olmalı');
    const botId = roster.find((p) => p.bot).id;
    const posOf = () => host.messages.filter((m) => m.t === 'snap').at(-1)?.ps.find((e) => e[0] === botId);
    const first = await until(posOf, 3000, 'botun konumu');
    await sleep(2500);
    const later = posOf();
    assert.ok(Math.hypot(later[1] - first[1], later[3] - first[3]) > 1, `bot yerinden oynamadı: ${first.slice(1, 4)} → ${later.slice(1, 4)}`);
  });

  await t.test('genel odada BOTS kadar oyuncuya tamamlanır; son insan çıkınca botlar da çıkar', async () => {
    const srv = await startServer({ BOTS: '4' });
    t.after(() => srv.stop());
    const a = srv.connect({ ip: '203.0.113.21', cid: 'genel-bot-0000001' });
    await a.join({ name: 'İnsan', mode: 'ffa', map: 'arena' });
    await until(() => lastRoster(a).length === 4, 4000, 'odanın 4 oyuncuya tamamlanması');
    assert.equal(lastRoster(a).filter((p) => p.bot).length, 3);
    a.close();
    const watcher = srv.connect({ ip: '203.0.113.22', cid: 'genel-bot-0000002' });
    await until(() => watcher.messages.filter((m) => m.t === 'rooms').at(-1)?.rooms['ffa:arena'].total === 0, 5000, 'odanın boşalması');
  });

  await t.test('botlar insan oyuncuya ateş eder (hasar sunucudan gelir)', async () => {
    const srv = await startServer();
    t.after(() => srv.stop());
    const host = srv.connect({ ip: '203.0.113.23', cid: 'bot-hedefi-000001' });
    await create(host, { bots: 4, mode: 'ffa', map: 'arena' });
    await until(() => host.has('hurt') || host.messages.some((m) => m.t === 'shot'), 25000, 'botlardan ateş');
  });
});
