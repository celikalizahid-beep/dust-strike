// Render ücretsiz planı gibi diski kalıcı olmayan sunucuda: panelde banı kaldırıp IP'ye izin verilince,
// sunucu yeniden başlasa (veri klasörü boş) da bu ayar kalmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { fakeUpstash } from './helpers/upstash.js';

test('banı kaldır + izin ver, sunucu yeniden başlayınca da geçerli kalır', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const env = { UPSTASH_REDIS_REST_URL: up.url, UPSTASH_REDIS_REST_TOKEN: up.token, IP_RULE: 'ban' };
  const SCHOOL = '203.0.113.90';

  const first = await startServer(env);
  try {
    // Okul: aynı IP'den iki öğrenci girer, kural IP'yi banlar
    const a = first.connect({ ip: SCHOOL, cid: 'okul-ogrenci-0001' });
    await a.join({ name: 'Ali' });
    const b = first.connect({ ip: SCHOOL, cid: 'okul-ogrenci-0002' });
    b.tryJoin({ name: 'Ayşe' });
    await b.next('banned');
    const token = await first.token();
    const post = (route, body) => first.api('POST', `/admin/api/${route}`, body, token);
    assert.equal((await post('unban', { ip: SCHOOL })).status, 200);
    assert.equal((await post('allow', { ip: SCHOOL, on: true })).status, 200);
    const st = (await first.api('GET', '/admin/api/state', undefined, token)).json;
    assert.equal(st.storage, 'remote');
  } finally {
    await first.stop(); // veri klasörü de silinir: Render uyuyup uyanmış gibi
  }

  const second = await startServer(env);
  t.after(() => second.stop());
  const token = await second.token();
  const st = (await second.api('GET', '/admin/api/state', undefined, token)).json;
  assert.equal(st.bans.some((b) => b.ip === SCHOOL), false, 'ban geri gelmemeli');
  assert.equal(st.allow.some((a) => a.ip === SCHOOL), true, 'izin kalmalı');
  // Aynı okuldan iki öğrenci artık birlikte girebilir
  const a = second.connect({ ip: SCHOOL, cid: 'okul-ogrenci-0003' });
  await a.join({ name: 'Ali' });
  const b = second.connect({ ip: SCHOOL, cid: 'okul-ogrenci-0004' });
  await b.join({ name: 'Ayşe' });
  assert.equal(b.has('banned') || a.has('banned'), false);
});
