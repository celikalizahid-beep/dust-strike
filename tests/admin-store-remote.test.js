// Uzak kalıcı depo (Upstash Redis REST): diski kalıcı olmayan sunucularda (Render ücretsiz plan) panelde yapılan
// değişiklikler sunucu yeniden başlayınca geri gelmeli. Upstash'ın REST arayüzünü taklit eden küçük bir sunucuyla denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdminStore } from '../server/store.js';
import { fakeUpstash } from './helpers/upstash.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dust-remote-'));
const quiet = { warn() {} };

const envOf = (up, extra = {}) => ({ UPSTASH_REDIS_REST_URL: up.url, UPSTASH_REDIS_REST_TOKEN: up.token, ...extra });
const open = async (env, dir = tmpDir()) => { const s = new AdminStore({ dir, env, log: quiet }); await s.init(); return s; };

test('panelde yapılanlar uzak depoya yazılır ve disk silinse de yeniden açılışta geri gelir', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const a = await open(envOf(up));
  assert.equal(a.storage, 'remote');
  assert.equal(a.persistent, true);
  a.ban('198.51.100.7', { reason: 'deneme' });
  a.ban('198.51.100.8', { reason: 'deneme' });
  assert.equal(a.unban('198.51.100.8'), true);
  a.allow('203.0.113.50');
  a.setIpRule('off');
  await a.flush();

  // Render uyuyup uyandı: veri klasörü boş, ortam değişkenleri aynı
  const b = await open(envOf(up));
  assert.equal(b.banOf('198.51.100.7')?.reason, 'deneme');
  assert.equal(b.banOf('198.51.100.8'), null, 'kaldırılan ban geri gelmez');
  assert.equal(b.isAllowed('203.0.113.50'), true, 'izinli IP kalır');
  assert.equal(b.ipRule, 'off', 'IP kuralı kalır');
});

test('uzak depo boşsa diskteki veri oraya taşınır', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const dir = tmpDir();
  const old = new AdminStore({ dir, env: {}, log: quiet });
  old.ban('198.51.100.20', { reason: 'eski' });
  const a = await open(envOf(up), dir);
  assert.equal(a.banOf('198.51.100.20')?.reason, 'eski');
  await a.flush();
  const b = await open(envOf(up));
  assert.equal(b.banOf('198.51.100.20')?.reason, 'eski');
});

test('ADMIN_PASSWORD yoksa üretilen şifre de uzak depoda kalıcıdır', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const a = await open(envOf(up));
  await a.flush();
  const b = await open(envOf(up));
  assert.equal(b.password, a.password);
  const c = await open(envOf(up, { ADMIN_PASSWORD: 'ortamdaki' }));
  assert.equal(c.password, 'ortamdaki');
});

test('art arda değişiklikler sırayla yazılır, en son hal kalır', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const a = await open(envOf(up));
  for (let i = 1; i <= 20; i++) a.ban(`198.51.100.${i}`, { reason: String(i) });
  for (let i = 1; i <= 10; i++) a.unban(`198.51.100.${i}`);
  await a.flush();
  const b = await open(envOf(up));
  assert.equal(b.bans().length, 10);
  assert.equal(b.banOf('198.51.100.20')?.reason, '20');
});

test('uzak depoya ulaşılamazsa sunucu yine açılır, durum panelde görünür', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  up.setDown(true);
  const a = await open(envOf(up));
  assert.equal(a.storage, 'remote-error');
  assert.equal(a.persistent, false);
  assert.match(a.storageError, /503|kapalı/);
  a.ban('198.51.100.30', { reason: 'çevrimdışı' });
  assert.equal(a.banOf('198.51.100.30')?.reason, 'çevrimdışı');
  // Depo geri gelince sonraki kayıt yazılır ve durum düzelir
  up.setDown(false);
  a.allow('203.0.113.60');
  await a.flush();
  assert.equal(a.storage, 'remote');
  const b = await open(envOf(up));
  assert.equal(b.banOf('198.51.100.30')?.reason, 'çevrimdışı');
});

test('yanlış token: durum hata olarak bildirilir', async (t) => {
  const up = await fakeUpstash();
  t.after(() => up.close());
  const a = await open({ UPSTASH_REDIS_REST_URL: up.url, UPSTASH_REDIS_REST_TOKEN: 'yanlis-token' });
  assert.equal(a.storage, 'remote-error');
  assert.match(a.storageError, /401|Unauthorized/);
});

test('uzak depo ayarlı değilse disk kullanılır', async () => {
  const a = await open({});
  assert.equal(a.storage, 'file');
});
