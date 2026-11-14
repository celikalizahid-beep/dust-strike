// Oda ayarları (kurucu değiştirir), oyuncu atma, dost ateşi, leş sınırı ve bot zorluğu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until, sleep } from './helpers/server.js';
import { newBrain, BOT_SKILLS } from '../server/bots.js';

const create = async (c, extra = {}) => {
  await c.opened;
  c.send({ t: 'create', name: extra.name || 'Kurucu', mode: extra.mode || 'tdm', map: 'arena', team: extra.team || 'auto', bots: extra.bots ?? 0, opts: extra.opts, cid: c.cid });
  const room = await c.next('room');
  await c.next('spawn');
  return room;
};
const joinCode = async (c, code, name = 'Misafir', team = 'auto') => {
  await c.opened;
  c.send({ t: 'join', code, name, team, cid: c.cid });
  await c.next('spawn');
  return c.messages.find((m) => m.t === 'welcome').id;
};
const lastOf = (c, type) => c.messages.filter((m) => m.t === type).at(-1);
const gunOf = (c) => c.messages.filter((m) => m.t === 'you' && m.secondary).at(-1).secondary;
const shoot = (a, id) => a.send({ t: 'shot', w: gunOf(a), o: [0, 1.6, 0], e: [0, 1.6, 1], hits: [{ id, z: 'head' }] });
let n = 0;
const ip = () => `203.0.114.${++n}`;
const cid = () => `oda-ayar-test-${String(++n).padStart(4, '0')}`;

test('bot zorluğu: zor bot kolaydan hızlı tepki verir ve daha isabetlidir', () => {
  assert.deepEqual(BOT_SKILLS, ['easy', 'normal', 'hard']);
  for (let i = 0; i < 20; i++) {
    const e = newBrain('easy'), m = newBrain('normal'), h = newBrain('hard');
    assert.ok(e.skill < m.skill && m.skill < h.skill, 'beceri sırası');
    assert.ok(e.maxHit < m.maxHit && m.maxHit < h.maxHit, 'isabet tavanı sırası');
    assert.ok(e.head < h.head, 'kafadan vuruş olasılığı');
  }
  assert.equal(newBrain('saçma').level, 'normal');
});

test('oda ayarları', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('oda kurulurken ayarlar alınır, geçersiz değerler düzeltilir, kurucu bildirilir', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host, { opts: { time: 300, limit: 30, ff: true, skill: 'hard', rounds: 99, bots: 2 } });
    const hostId = host.messages.find((m) => m.t === 'welcome').id;
    assert.equal(room.host, hostId);
    assert.deepEqual(room.opts, { time: 300, limit: 30, ff: true, skill: 'hard', rounds: 16, bots: 2 });
    const other = srv.connect({ ip: ip(), cid: cid() });
    const room2 = await create(other, { opts: { time: -5, limit: 'x', skill: 'uzman' } });
    assert.equal(room2.opts.limit, 0);
    assert.equal(room2.opts.skill, 'normal');
    assert.equal(room2.opts.ff, false);
    assert.ok(room2.opts.time >= 60);
  });

  await t.test('ayarları yalnızca kurucu değiştirir; herkese bildirilir; bot sayısı uygulanır', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host);
    const guest = srv.connect({ ip: ip(), cid: cid() });
    await joinCode(guest, room.code);
    assert.equal(lastOf(guest, 'room').host, room.host);
    guest.send({ t: 'roomset', opts: { limit: 50 } });
    await sleep(300);
    assert.equal(guest.has('roomopts'), false, 'misafir değiştiremez');
    host.send({ t: 'roomset', opts: { limit: 50, bots: 3, skill: 'easy' } });
    const ro = await guest.next('roomopts');
    assert.equal(ro.opts.limit, 50);
    assert.equal(ro.opts.bots, 3);
    assert.equal(ro.opts.skill, 'easy');
    assert.equal(ro.host, room.host);
    await until(() => (lastOf(host, 'roster')?.ps || []).filter((p) => p.bot).length === 3, 5000, '3 bot');
  });

  await t.test('kurucu oyuncu atar; atılan aynı odaya geri giremez; misafir atamaz', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host);
    const guest = srv.connect({ ip: ip(), cid: cid() });
    const guestId = await joinCode(guest, room.code);
    guest.send({ t: 'roomkick', id: room.host });
    await sleep(300);
    assert.equal(host.has('joinfail'), false, 'misafir kurucuyu atamaz');
    host.send({ t: 'roomkick', id: guestId });
    const fail = await guest.next('joinfail');
    assert.match(fail.text, /çıkar/);
    await until(() => !(lastOf(host, 'roster')?.ps || []).some((p) => p.id === guestId), 3000, 'listeden düşme');
    guest.send({ t: 'join', code: room.code, name: 'Misafir', team: 'auto', cid: guest.cid });
    assert.match((await guest.next('joinfail')).text, /çıkar/);
  });

  await t.test('kurucu çıkınca kuruculuk sıradaki oyuncuya geçer', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host);
    const guest = srv.connect({ ip: ip(), cid: cid() });
    const guestId = await joinCode(guest, room.code);
    host.close();
    await until(() => lastOf(guest, 'roomopts')?.host === guestId, 5000, 'yeni kurucu');
  });

  await t.test('dost ateşi: kapalıyken takım arkadaşı vurulmaz, açılınca vurulur', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host, { team: 'T' });
    const mate = srv.connect({ ip: ip(), cid: cid() });
    const mateId = await joinCode(mate, room.code, 'Dost', 'T');
    await sleep(2200); // doğuş koruması
    for (let i = 0; i < 3; i++) { shoot(host, mateId); await sleep(250); }
    assert.equal(mate.has('hurt'), false, 'dost ateşi kapalı');
    host.send({ t: 'roomset', opts: { ff: true } });
    await mate.next('roomopts');
    await until(async () => { shoot(host, mateId); await sleep(250); return mate.has('hurt'); }, 6000, 'dost ateşi açıkken hasar');
  });

  await t.test('leş sınırına ulaşan maçı bitirir', async () => {
    const host = srv.connect({ ip: ip(), cid: cid() });
    const room = await create(host, { mode: 'ffa', opts: { limit: 2 } });
    const v = srv.connect({ ip: ip(), cid: cid() });
    const vId = await joinCode(v, room.code, 'Hedef');
    await until(() => host.messages.some((m) => m.t === 'state' && m.phase === 'live'), 12000, 'maçın başlaması');
    await until(async () => { shoot(host, vId); await sleep(150); return host.messages.some((m) => m.t === 'rend' && m.final); }, 30000, 'maçın bitmesi');
    assert.equal(host.messages.filter((m) => m.t === 'kill' && m.k === room.host).length >= 2, true);
    assert.equal(lastOf(host, 'rend').winner, room.host);
  });
});
