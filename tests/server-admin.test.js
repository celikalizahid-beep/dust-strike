// Admin API: giriş, oyuncu listesi, atma, banlama, banı kaldırma, ayarlar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, until, PASSWORD } from './helpers/server.js';

const KICKED = 4001, BANNED = 4003;

test('admin girişi', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('yanlış şifre reddedilir, doğru şifre oturum anahtarı verir', async () => {
    const bad = await srv.login('yanlış', '198.51.100.1');
    assert.equal(bad.status, 401);
    assert.equal(bad.json.token, undefined);
    const ok = await srv.login(PASSWORD, '198.51.100.1');
    assert.equal(ok.status, 200);
    assert.match(ok.json.token, /^[\w-]{40,}$/);
  });

  await t.test('oturum anahtarı olmadan ya da yanlış anahtarla hiçbir admin isteği çalışmaz', async () => {
    for (const [method, route, body] of [
      ['GET', '/admin/api/state'],
      ['POST', '/admin/api/ban', { ip: '203.0.113.99' }],
      ['POST', '/admin/api/unban', { ip: '203.0.113.99' }],
      ['POST', '/admin/api/kick', { id: 1 }],
      ['POST', '/admin/api/settings', { ipRule: 'off' }],
      ['POST', '/admin/api/allow', { ip: '203.0.113.99', on: true }],
      ['POST', '/admin/api/say', { text: 'merhaba' }],
    ]) {
      assert.equal((await srv.api(method, route, body)).status, 401, `${method} ${route} anahtarsız`);
      assert.equal((await srv.api(method, route, body, 'uydurma-anahtar')).status, 401, `${method} ${route} yanlış anahtar`);
    }
    const token = await srv.token();
    const state = (await srv.api('GET', '/admin/api/state', undefined, token)).json;
    assert.deepEqual(state.bans, [], 'yetkisiz istekler hiçbir şeyi değiştirmemeli');
    assert.equal(state.settings.ipRule, 'ban');
  });

  await t.test('çıkış yapınca oturum anahtarı geçersiz olur', async () => {
    const token = await srv.token();
    assert.equal((await srv.api('GET', '/admin/api/state', undefined, token)).status, 200);
    assert.equal((await srv.api('POST', '/admin/api/logout', {}, token)).status, 200);
    assert.equal((await srv.api('GET', '/admin/api/state', undefined, token)).status, 401);
  });

  await t.test('art arda 5 yanlış denemeden sonra o adresin girişi kilitlenir; başka adres etkilenmez', async () => {
    const ip = '198.51.100.2';
    for (let i = 0; i < 5; i++) assert.equal((await srv.login('tahmin' + i, ip)).status, 401, `deneme ${i + 1}`);
    const locked = await srv.login(PASSWORD, ip);
    assert.equal(locked.status, 429, 'kilitliyken doğru şifre de kabul edilmemeli');
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
    assert.equal((await srv.login(PASSWORD, '198.51.100.3')).status, 200);
  });

  await t.test('giriş isteği JSON değilse reddedilir (başka siteden form gönderimi)', async () => {
    const res = await fetch(`${srv.url}/admin/api/login`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-forwarded-for': '198.51.100.4' }, body: JSON.stringify({ password: PASSWORD }) });
    assert.equal(res.status, 415);
  });
});

test('admin işlemleri', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const token = await srv.token();
  const post = (route, body) => srv.api('POST', `/admin/api/${route}`, body, token);
  const state = async () => (await srv.api('GET', '/admin/api/state', undefined, token)).json;

  await t.test('durum: oyuncular adı, IP\'si, odası ve takımıyla listelenir', async () => {
    const c = srv.connect({ ip: '203.0.113.60', cid: 'listelenen-oyuncu1' });
    const id = await c.join({ name: 'Zahid', mode: 'tdm', map: 'arena', team: 'CT' });
    const p = (await state()).players.find((x) => x.id === id);
    assert.equal(p.name, 'Zahid');
    assert.equal(p.ip, '203.0.113.60');
    assert.equal(p.mode, 'tdm');
    assert.equal(p.map, 'arena');
    assert.equal(p.team, 'CT');
    assert.equal(p.reliable, true);
    c.close();
  });

  await t.test('elle banlanan IP bağlanamaz; ban kaldırılınca yeniden bağlanır', async () => {
    const ip = '203.0.113.61';
    const res = await post('ban', { ip, reason: 'hile' });
    assert.equal(res.status, 200);
    const blocked = srv.connect({ ip, cid: 'banli-cihaz-000001' });
    const msg = await blocked.next('banned');
    assert.equal(msg.reason, 'hile');
    assert.equal((await blocked.closed).code, BANNED);
    const ban = (await state()).bans.find((b) => b.ip === ip);
    assert.equal(ban.reason, 'hile');
    assert.equal(ban.by, 'admin');

    assert.equal((await post('unban', { ip })).status, 200);
    assert.equal((await state()).bans.some((b) => b.ip === ip), false);
    const back = srv.connect({ ip, cid: 'banli-cihaz-000001' });
    await back.join({ name: 'Affedilen' });
    assert.equal(back.isClosed, false);
    back.close();
  });

  await t.test('oyuncu kimliğiyle banlanınca bağlantısı kesilir ve IP\'si listeye girer', async () => {
    const ip = '203.0.113.62';
    const c = srv.connect({ ip, cid: 'banlanacak-oyuncu1' });
    const id = await c.join({ name: 'Hileci' });
    assert.equal((await post('ban', { id, reason: 'duvar hilesi' })).status, 200);
    assert.equal((await c.next('banned')).reason, 'duvar hilesi');
    assert.equal((await c.closed).code, BANNED);
    const ban = (await state()).bans.find((b) => b.ip === ip);
    assert.deepEqual(ban.names, ['Hileci']);
  });

  await t.test('atılan oyuncunun bağlantısı kesilir ama banlanmaz', async () => {
    const ip = '203.0.113.63';
    const c = srv.connect({ ip, cid: 'atilacak-oyuncu-01' });
    const id = await c.join({ name: 'Küfürbaz' });
    assert.equal((await post('kick', { id, reason: 'küfür' })).status, 200);
    assert.equal((await c.next('kicked')).reason, 'küfür');
    assert.equal((await c.closed).code, KICKED);
    const again = srv.connect({ ip, cid: 'atilacak-oyuncu-01' });
    await again.join({ name: 'Küfürbaz' });
    assert.equal(again.isClosed, false);
    again.close();
  });

  await t.test('olmayan oyuncu, geçersiz ya da yerel IP için hata döner ve hiçbir şey banlanmaz', async () => {
    const before = (await state()).bans.length;
    assert.equal((await post('kick', { id: 999999 })).status, 404);
    assert.equal((await post('ban', { id: 999999 })).status, 404);
    assert.equal((await post('ban', { ip: 'adres-değil' })).status, 400);
    assert.equal((await post('ban', { ip: '127.0.0.1' })).status, 400);
    assert.equal((await post('ban', { ip: '203.0.113.0/24' })).status, 400);
    assert.equal((await post('ban', {})).status, 400);
    assert.equal((await post('unban', { ip: '203.0.113.200' })).status, 404);
    assert.equal((await state()).bans.length, before);
  });

  await t.test('adresi güvenilir bilinmeyen oyuncu IP ile banlanamaz (vekilin adresi herkesi banlardı)', async () => {
    const c = srv.connect({ cid: 'basliksiz-oyuncu-01' });
    const id = await c.join({ name: 'Vekilli' });
    const res = await post('ban', { id });
    assert.equal(res.status, 400);
    assert.equal(c.isClosed, false);
    c.close();
  });

  await t.test('IP kuralı panelden değişir ve hemen uygulanır', async () => {
    assert.equal((await post('settings', { ipRule: 'yok-böyle-kural' })).status, 400);
    assert.equal((await state()).settings.ipRule, 'ban');
    assert.equal((await post('settings', { ipRule: 'off' })).status, 200);
    assert.equal((await state()).settings.ipRule, 'off');
    const ip = '203.0.113.64';
    const a = srv.connect({ ip, cid: 'kural-kapali-00001' });
    const b = srv.connect({ ip, cid: 'kural-kapali-00002' });
    await a.join({ name: 'A' });
    await b.join({ name: 'B' });
    assert.equal(a.isClosed, false);
    assert.equal(b.isClosed, false);
    a.close(); b.close();
    assert.equal((await post('settings', { ipRule: 'ban' })).status, 200);
  });

  await t.test('duyuru odadaki oyunculara sistem mesajı olarak gider', async () => {
    const c = srv.connect({ ip: '203.0.113.65', cid: 'duyuru-dinleyen-01' });
    await c.join({ name: 'Dinleyen' });
    assert.equal((await post('say', { text: 'Sunucu 5 dakika sonra yeniden başlayacak' })).status, 200);
    await until(() => c.messages.some((m) => m.t === 'chat' && m.system && m.text.includes('Sunucu 5 dakika sonra yeniden başlayacak')), 2000, 'duyurunun gelmesi');
    assert.equal((await post('say', { text: '   ' })).status, 400);
    c.close();
  });

  await t.test('olay kaydı: ban ve banı kaldırma görünür', async () => {
    const ip = '203.0.113.66';
    await post('ban', { ip, reason: 'deneme' });
    await post('unban', { ip });
    const log = (await state()).log;
    assert.ok(log.some((e) => e.type === 'ban' && e.text.includes(ip)), 'ban kaydı yok');
    assert.ok(log.some((e) => e.type === 'unban' && e.text.includes(ip)), 'ban kaldırma kaydı yok');
  });

  await t.test('banlı IP admin sayfasına ve API\'ye erişebilir (yönetici kendini kilitleyemez)', async () => {
    const ip = '203.0.113.67';
    await post('ban', { ip, reason: 'kendi evim' });
    const page = await fetch(`${srv.url}/admin`, { headers: { 'x-forwarded-for': ip } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const login = await srv.login(PASSWORD, ip);
    assert.equal(login.status, 200);
    await post('unban', { ip });
  });
});

test('ban listesi sunucu yeniden başlayınca korunur', async (t) => {
  // İkinci sunucu aynı veri klasörüyle açılır (stop() kendi klasörünü sildiği için kopyası kullanılır)
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dust-copy-'));
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
  const first = await startServer();
  try {
    const token = await first.token();
    assert.equal((await first.api('POST', '/admin/api/ban', { ip: '203.0.113.70', reason: 'kalıcı' }, token)).status, 200);
    fs.cpSync(first.dataDir, copy, { recursive: true });
  } finally {
    await first.stop();
  }
  const second = await startServer({ DATA_DIR: copy });
  t.after(() => second.stop());
  const c = second.connect({ ip: '203.0.113.70', cid: 'yeniden-baslama-01' });
  assert.equal((await c.next('banned')).reason, 'kalıcı');
});

test('ADMIN_PASSWORD verilmezse şifre üretilir ve açılışta konsola yazılır', async (t) => {
  const srv = await startServer({ ADMIN_PASSWORD: '' });
  t.after(() => srv.stop());
  // Açılış satırları ayrı ayrı yazılır: şifre satırı gelene kadar bekle
  const m = await until(() => /Şifre:\s+([a-z0-9]{12})\b/.exec(srv.output()), 3000, 'konsolda şifre satırı');
  assert.equal((await srv.login(m[1], '198.51.100.9')).status, 200);
  assert.equal((await srv.login(PASSWORD, '198.51.100.10')).status, 401);
});
