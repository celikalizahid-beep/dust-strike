// Aynı IP kuralı ve banlar: gerçek sunucuya WebSocket ile bağlanarak denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until, sleep } from './helpers/server.js';

const BANNED = 4003, REPLACED = 4002;

test('varsayılan kural (ban)', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const token = await srv.token();
  const state = async () => (await srv.api('GET', '/admin/api/state', undefined, token)).json;

  await t.test('aynı IP\'den ikinci oyuncu giremez, IP banlanır ve içerideki oyuncu da düşer', async () => {
    const ip = '203.0.113.10';
    const first = srv.connect({ ip, cid: 'tarayici-bir-0001' });
    await first.join({ name: 'Birinci' });
    const second = srv.connect({ ip, cid: 'tarayici-iki-0002' });
    await second.next('welcome');
    await second.tryJoin({ name: 'İkinci' });

    const msg = await second.next('banned');
    assert.match(msg.text, /yasak/i);
    assert.equal((await second.closed).code, BANNED);
    assert.equal(second.has('spawn'), false, 'ikinci oyuncu oyuna girmemeli');
    await first.next('banned');
    assert.equal((await first.closed).code, BANNED);

    // Ban kalıcı: aynı IP'den yeni bağlantı lobiye bile giremez
    const third = srv.connect({ ip, cid: 'tarayici-uc-0003' });
    await third.next('banned');
    assert.equal((await third.closed).code, BANNED);
    assert.equal(third.has('welcome'), false);

    const ban = (await state()).bans.find((b) => b.ip === ip);
    assert.ok(ban, 'ban admin panelinde görünmeli');
    assert.equal(ban.by, 'otomatik');
    assert.deepEqual([...ban.names].sort(), ['Birinci', 'İkinci']);
  });

  await t.test('başka IP\'ler etkilenmez', async () => {
    const a = srv.connect({ ip: '203.0.113.11', cid: 'cihaz-a-00000001' });
    const b = srv.connect({ ip: '203.0.113.12', cid: 'cihaz-b-00000002' });
    await a.join({ name: 'A' });
    await b.join({ name: 'B' });
    assert.equal(a.isClosed, false);
    assert.equal(b.isClosed, false);
  });

  await t.test('aynı tarayıcı yeniden bağlanırsa (aynı kimlik) eski bağlantı düşer, kimse banlanmaz', async () => {
    const ip = '203.0.113.20';
    const old = srv.connect({ ip, cid: 'ayni-tarayici-0001' });
    await old.join({ name: 'Yenileyen' });
    const fresh = srv.connect({ ip, cid: 'ayni-tarayici-0001' });
    await fresh.join({ name: 'Yenileyen' });
    await old.next('replaced');
    assert.equal((await old.closed).code, REPLACED);
    assert.equal(fresh.isClosed, false);
    assert.equal((await state()).bans.some((b) => b.ip === ip), false);
  });

  await t.test('lobide bekleyen bağlantı oyuncu sayılmaz', async () => {
    const ip = '203.0.113.21';
    const idle = srv.connect({ ip, cid: 'lobide-bekleyen-01' });
    await idle.next('welcome');
    const player = srv.connect({ ip, cid: 'oyuna-giren-000002' });
    await player.join({ name: 'Giren' });
    assert.equal(idle.isClosed, false);
    assert.equal(player.isClosed, false);
  });

  await t.test('oyundan çıkan oyuncunun IP\'sinden başkası girebilir', async () => {
    const ip = '203.0.113.22';
    const first = srv.connect({ ip, cid: 'once-oynayan-00001' });
    const id = await first.join({ name: 'Önce' });
    first.close();
    await until(async () => !(await state()).players.some((p) => p.id === id), 3000, 'oyuncunun listeden düşmesi');
    const second = srv.connect({ ip, cid: 'sonra-oynayan-0002' });
    await second.join({ name: 'Sonra' });
    assert.equal(second.isClosed, false);
  });

  await t.test('izinli IP\'den birden fazla oyuncu girebilir', async () => {
    const ip = '203.0.113.30';
    const res = await srv.api('POST', '/admin/api/allow', { ip, on: true }, token);
    assert.equal(res.status, 200);
    const a = srv.connect({ ip, cid: 'kardes-bir-000001' });
    const b = srv.connect({ ip, cid: 'kardes-iki-000002' });
    await a.join({ name: 'Abla' });
    await b.join({ name: 'Kardeş' });
    assert.equal(a.isClosed, false);
    assert.equal(b.isClosed, false);
    assert.deepEqual((await state()).allow.map((x) => x.ip), [ip]);
  });

  await t.test('adres güvenilir biçimde bilinmiyorsa (vekil başlığı yok) kural uygulanmaz', async () => {
    const a = srv.connect({ cid: 'basliksiz-bir-0001' });
    const b = srv.connect({ cid: 'basliksiz-iki-0002' });
    await a.join({ name: 'X' });
    await b.join({ name: 'Y' });
    assert.equal(a.isClosed, false);
    assert.equal(b.isClosed, false);
    const players = (await state()).players.filter((p) => ['X', 'Y'].includes(p.name));
    assert.deepEqual(players.map((p) => p.reliable), [false, false]);
  });

  await t.test('IPv6: aynı /64 ağındaki iki adres aynı ev sayılır', async () => {
    const first = srv.connect({ ip: '2a02:ff0:1:2:aaaa::1', cid: 'v6-cihaz-bir-0001' });
    await first.join({ name: 'V6a' });
    const second = srv.connect({ ip: '2a02:ff0:1:2:bbbb::2', cid: 'v6-cihaz-iki-0002' });
    await second.tryJoin({ name: 'V6b' });
    await second.next('banned');
    await first.next('banned');
    assert.ok((await state()).bans.some((b) => b.ip === '2a02:ff0:1:2::/64'));
  });
});

test('kural "block": ikinci oyuncu yalnızca engellenir, kimse banlanmaz', async (t) => {
  const srv = await startServer({ IP_RULE: 'block' });
  t.after(() => srv.stop());
  const ip = '203.0.113.40';
  const first = srv.connect({ ip, cid: 'blok-bir-00000001' });
  await first.join({ name: 'İlk' });
  const second = srv.connect({ ip, cid: 'blok-iki-00000002' });
  await second.tryJoin({ name: 'Sonraki' });
  const fail = await second.next('joinfail');
  assert.match(fail.text, /IP/);
  await sleep(150);
  assert.equal(second.has('spawn'), false);
  assert.equal(second.isClosed, false, 'engellenen bağlantı lobide kalır');
  assert.equal(first.isClosed, false, 'içerideki oyuncu etkilenmez');
  const token = await srv.token();
  assert.deepEqual((await srv.api('GET', '/admin/api/state', undefined, token)).json.bans, []);
});

test('kural "off": aynı IP\'den istenen kadar oyuncu girer', async (t) => {
  const srv = await startServer({ IP_RULE: 'off' });
  t.after(() => srv.stop());
  const ip = '203.0.113.41';
  const a = srv.connect({ ip, cid: 'kapali-bir-0000001' });
  const b = srv.connect({ ip, cid: 'kapali-iki-0000002' });
  await a.join({ name: 'A' });
  await b.join({ name: 'B' });
  assert.equal(a.isClosed, false);
  assert.equal(b.isClosed, false);
});

test('yerel bağlantılar (127.0.0.1) kuraldan muaftır: aynı bilgisayardan test ve bot bağlanabilir', async (t) => {
  const srv = await startServer({ TRUST_PROXY: '0' });
  t.after(() => srv.stop());
  const a = srv.connect({ cid: 'yerel-bir-00000001' });
  const b = srv.connect({ cid: 'yerel-iki-00000002' });
  await a.join({ name: 'A' });
  await b.join({ name: 'B' });
  assert.equal(a.isClosed, false);
  assert.equal(b.isClosed, false);
});

test('yanıt vermeyen (kopmuş) bağlantı sunucudan düşürülür', async (t) => {
  const srv = await startServer({ HEARTBEAT_MS: '150' });
  t.after(() => srv.stop());
  const token = await srv.token();
  const dead = srv.connect({ ip: '203.0.113.50', cid: 'kopmus-baglanti-01', autoPong: false });
  const id = await dead.join({ name: 'Hayalet' });
  const alive = srv.connect({ ip: '203.0.113.51', cid: 'canli-baglanti-002' });
  await alive.join({ name: 'Canlı' });
  await until(async () => !(await srv.api('GET', '/admin/api/state', undefined, token)).json.players.some((p) => p.id === id), 3000, 'kopmuş oyuncunun düşmesi');
  await sleep(400);
  assert.equal(alive.isClosed, false, 'yanıt veren bağlantı düşürülmemeli');
});
