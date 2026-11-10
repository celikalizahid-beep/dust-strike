// Kalıcı yönetim verisi: ban listesi, izinli IP'ler, IP kuralı ve admin şifresi (server/store.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdminStore } from '../server/store.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dust-store-'));
const quiet = { warn() {} };
const open = (dir, env = {}) => new AdminStore({ dir, env, log: quiet });

test('ban kalıcıdır: sunucu yeniden başlayınca liste dosyadan geri gelir', () => {
  const dir = tmpDir();
  const a = open(dir);
  assert.equal(a.banOf('198.51.100.7'), null);
  a.ban('198.51.100.7', { reason: 'Aynı IP adresinden ikinci giriş', by: 'otomatik', names: ['Ali', 'Veli'] });
  const rec = a.banOf('198.51.100.7');
  assert.equal(rec.ip, '198.51.100.7');
  assert.equal(rec.reason, 'Aynı IP adresinden ikinci giriş');
  assert.equal(rec.by, 'otomatik');
  assert.deepEqual(rec.names, ['Ali', 'Veli']);
  assert.ok(Math.abs(rec.at - Date.now()) < 5000, 'ban zamanı kaydedilmeli');

  const b = open(dir);
  assert.equal(b.banOf('198.51.100.7').reason, 'Aynı IP adresinden ikinci giriş');
  assert.deepEqual(b.bans().map((x) => x.ip), ['198.51.100.7']);
});

test('banı kaldırmak kalıcıdır; olmayan banı kaldırmak false döner', () => {
  const dir = tmpDir();
  const a = open(dir);
  a.ban('198.51.100.7', { reason: 'x', by: 'admin' });
  a.ban('2a02:ff0:1:2::/64', { reason: 'y', by: 'admin' });
  assert.equal(a.unban('198.51.100.7'), true);
  assert.equal(a.unban('198.51.100.7'), false);
  assert.equal(a.banOf('198.51.100.7'), null);
  assert.deepEqual(open(dir).bans().map((x) => x.ip), ['2a02:ff0:1:2::/64']);
});

test('aynı IP ikinci kez banlanınca kayıt güncellenir, liste çoğalmaz', () => {
  const a = open(tmpDir());
  a.ban('198.51.100.7', { reason: 'ilk', by: 'otomatik' });
  a.ban('198.51.100.7', { reason: 'ikinci', by: 'admin' });
  assert.equal(a.bans().length, 1);
  assert.equal(a.banOf('198.51.100.7').reason, 'ikinci');
});

test('BANNED_IPS ortam değişkenindeki adresler banlıdır ve panelden kaldırılamaz', () => {
  const dir = tmpDir();
  const a = open(dir, { BANNED_IPS: ' 203.0.113.5 , 2A02:FF0:1:2:aaaa::1,  bozuk-adres ' });
  assert.equal(a.banOf('203.0.113.5').fixed, true);
  assert.equal(a.banOf('2a02:ff0:1:2::/64').fixed, true, 'IPv6 adresi /64 anahtarına çevrilmeli');
  assert.equal(a.bans().length, 2, 'geçersiz adres atlanmalı');
  assert.equal(a.unban('203.0.113.5'), false);
  assert.ok(a.banOf('203.0.113.5'));
  // Dosyaya yazılmaz: değişken kaldırılınca ban da kalkar
  assert.equal(open(dir, {}).banOf('203.0.113.5'), null);
});

test('IP kuralı: varsayılan "ban", IP_RULE ile değişir, panelden seçilen değer kalıcıdır', () => {
  const dir = tmpDir();
  assert.equal(open(dir).ipRule, 'ban');
  assert.equal(open(tmpDir(), { IP_RULE: 'block' }).ipRule, 'block');
  assert.equal(open(tmpDir(), { IP_RULE: 'saçma' }).ipRule, 'ban', 'geçersiz IP_RULE varsayılana düşer');
  const a = open(dir);
  a.setIpRule('off');
  assert.equal(a.ipRule, 'off');
  assert.equal(open(dir, { IP_RULE: 'block' }).ipRule, 'off', 'panelden yapılan seçim ortam değişkeninden önce gelir');
  assert.throws(() => a.setIpRule('herkesi-banla'), /ipRule/);
  assert.equal(a.ipRule, 'off');
});

test('izinli IP listesi kalıcıdır; ALLOWED_IPS ile de verilebilir', () => {
  const dir = tmpDir();
  const a = open(dir, { ALLOWED_IPS: '203.0.113.9' });
  assert.equal(a.isAllowed('198.51.100.7'), false);
  a.allow('198.51.100.7');
  assert.equal(a.isAllowed('198.51.100.7'), true);
  assert.equal(a.isAllowed('203.0.113.9'), true);
  assert.deepEqual(a.allowed().map((x) => x.ip).sort(), ['198.51.100.7', '203.0.113.9']);
  assert.equal(a.allowed().find((x) => x.ip === '203.0.113.9').fixed, true);
  const b = open(dir);
  assert.equal(b.isAllowed('198.51.100.7'), true);
  assert.equal(b.isAllowed('203.0.113.9'), false);
  assert.equal(b.disallow('198.51.100.7'), true);
  assert.equal(open(dir).isAllowed('198.51.100.7'), false);
});

test('admin şifresi: ADMIN_PASSWORD varsa odur; yoksa üretilir ve sonraki açılışta aynı kalır', () => {
  const dir = tmpDir();
  const env = open(dir, { ADMIN_PASSWORD: 'gizli-123' });
  assert.equal(env.password, 'gizli-123');
  assert.equal(env.passwordSource, 'env');
  const gen = open(dir);
  assert.equal(gen.passwordSource, 'file');
  assert.match(gen.password, /^[a-z0-9]{12}$/, 'üretilen şifre 12 karakter olmalı');
  assert.equal(open(dir).password, gen.password);
  assert.notEqual(open(tmpDir()).password, gen.password, 'her kurulum kendi şifresini üretmeli');
});

test('bozuk veri dosyası: varsayılanlarla başlar, bozuk dosya silinmez (yedeklenir)', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'admin.json'), '{ bu json değil');
  const a = open(dir);
  assert.deepEqual(a.bans(), []);
  a.ban('198.51.100.7', { reason: 'x', by: 'admin' });
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('admin.json.bozuk'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), '{ bu json değil');
  assert.equal(open(dir).banOf('198.51.100.7').reason, 'x');
});

test('yazılamayan klasör: bellekte çalışmaya devam eder ve kalıcı olmadığını bildirir', () => {
  const file = path.join(tmpDir(), 'dosya');
  fs.writeFileSync(file, 'x');
  const a = open(path.join(file, 'alt-klasör'));
  a.ban('198.51.100.7', { reason: 'x', by: 'admin' });
  assert.equal(a.banOf('198.51.100.7').reason, 'x');
  assert.equal(a.persistent, false);
  assert.equal(open(tmpDir()).persistent, true);
});
