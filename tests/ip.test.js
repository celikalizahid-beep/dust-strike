// İstemci IP adresinin bulunması ve ban anahtarına çevrilmesi (server/ip.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIp, ipKey, parseIpKey, isLoopback, isPrivate, parseTrust, clientAddress } from '../server/ip.js';

test('normalizeIp: adresleri tek biçime getirir, geçersizleri reddeder', () => {
  const cases = [
    ['1.2.3.4', '1.2.3.4'],
    [' 5.6.7.8 ', '5.6.7.8'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['::FFFF:192.168.1.5', '192.168.1.5'],
    ['1.2.3.4:5678', '1.2.3.4'],
    ['2A02:0FF0:0000:0000:0000:0000:0000:0001', '2a02:ff0::1'],
    ['2a02:ff0:0:0:1:0:0:1', '2a02:ff0::1:0:0:1'],
    ['::1', '::1'],
    ['fe80::1%eth0', 'fe80::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['[2001:db8::1]:443', '2001:db8::1'],
    ['garbage', null],
    ['', null],
    [null, null],
    [undefined, null],
    ['999.1.1.1', null],
    ['1.2.3', null],
    ['unknown', null],
  ];
  for (const [input, want] of cases) assert.equal(normalizeIp(input), want, `normalizeIp(${JSON.stringify(input)})`);
});

test('ipKey: IPv4 tek adres, IPv6 /64 ağı (aynı evdeki cihazlar aynı anahtar)', () => {
  const cases = [
    ['1.2.3.4', '1.2.3.4'],
    ['2a02:ff0:1:2:aaaa:bbbb:cccc:dddd', '2a02:ff0:1:2::/64'],
    ['2a02:ff0:1:2::9', '2a02:ff0:1:2::/64'],
    ['2001:db8::1', '2001:db8::/64'],
    ['::1', '::1'],
  ];
  for (const [input, want] of cases) assert.equal(ipKey(input), want, `ipKey(${input})`);
  assert.notEqual(ipKey('2a02:ff0:1:2::9'), ipKey('2a02:ff0:1:3::9'), 'farklı /64 ağları farklı anahtar olmalı');
});

test('parseIpKey: elle yazılan adresi ban anahtarına çevirir (yalnızca tek IPv4 ya da IPv6 /64)', () => {
  const cases = [
    ['1.2.3.4', '1.2.3.4'],
    [' 1.2.3.4 ', '1.2.3.4'],
    ['1.2.3.4/32', '1.2.3.4'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['2a02:ff0:1:2:aaaa::1', '2a02:ff0:1:2::/64'],
    ['2A02:FF0:1:2::/64', '2a02:ff0:1:2::/64'],
    ['1.2.3.0/24', null],
    ['2a02:ff0::/32', null],
    ['1.2.3.4/', null],
    ['', null],
    ['abc', null],
    [null, null],
  ];
  for (const [input, want] of cases) assert.equal(parseIpKey(input), want, `parseIpKey(${JSON.stringify(input)})`);
});

test('isLoopback / isPrivate: yerel ve özel ağ adresleri', () => {
  for (const ip of ['127.0.0.1', '127.5.5.5', '::1']) assert.equal(isLoopback(ip), true, ip);
  for (const ip of ['10.1.2.3', '192.168.1.1', '8.8.8.8', '2a02:ff0::1']) assert.equal(isLoopback(ip), false, ip);
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '100.64.0.1', '100.127.255.255', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
    assert.equal(isPrivate(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '100.128.0.1', '100.63.0.1', '193.168.1.1', '2a02:ff0::1']) assert.equal(isPrivate(ip), false, ip);
});

test('parseTrust: TRUST_PROXY ve RENDER ortam değişkenleri', () => {
  assert.deepEqual(parseTrust({}), { mode: 'auto', render: false });
  assert.deepEqual(parseTrust({ RENDER: 'true' }), { mode: 'auto', render: true });
  assert.deepEqual(parseTrust({ TRUST_PROXY: 'auto', RENDER: 'true' }), { mode: 'auto', render: true });
  for (const v of ['0', 'false', 'off']) assert.deepEqual(parseTrust({ TRUST_PROXY: v, RENDER: 'true' }), { mode: 'off' }, v);
  for (const v of ['1', 'true']) assert.deepEqual(parseTrust({ TRUST_PROXY: v }), { mode: 'header', header: 'x-forwarded-for' }, v);
  assert.deepEqual(parseTrust({ TRUST_PROXY: 'X-Real-IP' }), { mode: 'header', header: 'x-real-ip' });
  assert.throws(() => parseTrust({ TRUST_PROXY: 'x real ip!' }), /TRUST_PROXY/);
});

const AUTO = { mode: 'auto', render: false };
const RENDER = { mode: 'auto', render: true };
const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test('clientAddress: doğrudan bağlantıda soket adresi kullanılır', () => {
  assert.deepEqual(clientAddress(req('203.0.113.9'), AUTO), { ip: '203.0.113.9', key: '203.0.113.9', reliable: true, loopback: false, via: 'socket' });
  assert.deepEqual(clientAddress(req('::ffff:192.168.1.20'), AUTO), { ip: '192.168.1.20', key: '192.168.1.20', reliable: true, loopback: false, via: 'socket' });
  assert.deepEqual(clientAddress(req('127.0.0.1'), AUTO), { ip: '127.0.0.1', key: '127.0.0.1', reliable: true, loopback: true, via: 'socket' });
});

test('clientAddress: internetten doğrudan gelen istemci sahte başlıkla IP değiştiremez', () => {
  const a = clientAddress(req('203.0.113.9', { 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '2.2.2.2' }), AUTO);
  assert.deepEqual(a, { ip: '203.0.113.9', key: '203.0.113.9', reliable: true, loopback: false, via: 'socket' });
});

test('clientAddress: Render üzerinde Cloudflare başlığı gerçek adrestir (X-Forwarded-For başına eklenen sahte adres yok sayılır)', () => {
  const a = clientAddress(req('10.0.0.5', { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1, 198.51.100.7, 10.0.0.5' }), RENDER);
  assert.deepEqual(a, { ip: '198.51.100.7', key: '198.51.100.7', reliable: true, loopback: false, via: 'cf-connecting-ip' });
  const b = clientAddress(req('10.0.0.5', { 'true-client-ip': '2a02:ff0:1:2:aaaa:bbbb:cccc:dddd' }), RENDER);
  assert.deepEqual(b, { ip: '2a02:ff0:1:2:aaaa:bbbb:cccc:dddd', key: '2a02:ff0:1:2::/64', reliable: true, loopback: false, via: 'true-client-ip' });
});

test('clientAddress: Render üzerinde Cloudflare başlığı yoksa adres güvenilmez sayılır', () => {
  const a = clientAddress(req('10.0.0.5', { 'x-forwarded-for': '198.51.100.7, 10.0.0.9' }), RENDER);
  assert.equal(a.ip, '198.51.100.7');
  assert.equal(a.reliable, false);
  assert.equal(a.via, 'x-forwarded-for');
});

test('clientAddress: aynı makinedeki tünel / vekil (cloudflared) başlıklarına güvenilir', () => {
  const a = clientAddress(req('127.0.0.1', { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.7' }), AUTO);
  assert.deepEqual(a, { ip: '198.51.100.7', key: '198.51.100.7', reliable: true, loopback: false, via: 'cf-connecting-ip' });
  // Yerel vekil yalnızca X-Forwarded-For ekliyorsa: vekilin eklediği son adres
  const b = clientAddress(req('::1', { 'x-forwarded-for': '6.6.6.6, 198.51.100.8' }), AUTO);
  assert.deepEqual(b, { ip: '198.51.100.8', key: '198.51.100.8', reliable: true, loopback: false, via: 'x-forwarded-for' });
});

test('clientAddress: tanınmayan bir vekilin arkasında (özel ağdan gelen, yönlendirme başlıklı istek) adres güvenilmez', () => {
  const a = clientAddress(req('10.2.3.4', { 'x-forwarded-for': '198.51.100.7' }), AUTO);
  assert.deepEqual(a, { ip: '10.2.3.4', key: '10.2.3.4', reliable: false, loopback: false, via: 'socket' });
});

test('clientAddress: TRUST_PROXY ile seçilen başlık kullanılır', () => {
  const xff = { mode: 'header', header: 'x-forwarded-for' };
  assert.deepEqual(clientAddress(req('10.2.3.4', { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }), xff),
    { ip: '198.51.100.7', key: '198.51.100.7', reliable: true, loopback: false, via: 'x-forwarded-for' });
  const real = { mode: 'header', header: 'x-real-ip' };
  assert.deepEqual(clientAddress(req('10.2.3.4', { 'x-real-ip': '198.51.100.9', 'x-forwarded-for': '6.6.6.6' }), real),
    { ip: '198.51.100.9', key: '198.51.100.9', reliable: true, loopback: false, via: 'x-real-ip' });
});

test('clientAddress: güvenilen başlık boş, bozuk ya da özel ağ adresi ise adres güvenilmez', () => {
  const xff = { mode: 'header', header: 'x-forwarded-for' };
  for (const value of [undefined, '', 'unknown', 'garbage, more garbage']) {
    const a = clientAddress(req('10.2.3.4', value === undefined ? {} : { 'x-forwarded-for': value }), xff);
    assert.deepEqual(a, { ip: '10.2.3.4', key: '10.2.3.4', reliable: false, loopback: false, via: 'socket' }, `başlık: ${value}`);
  }
  const b = clientAddress(req('10.2.3.4', { 'x-forwarded-for': '198.51.100.7, 10.9.9.9' }), xff);
  assert.equal(b.ip, '10.9.9.9');
  assert.equal(b.reliable, false);
});

test('clientAddress: TRUST_PROXY=0 iken başlıklar tamamen yok sayılır', () => {
  const a = clientAddress(req('10.2.3.4', { 'x-forwarded-for': '198.51.100.7', 'cf-connecting-ip': '198.51.100.7' }), { mode: 'off' });
  assert.deepEqual(a, { ip: '10.2.3.4', key: '10.2.3.4', reliable: true, loopback: false, via: 'socket' });
});

test('clientAddress: soket adresi okunamazsa adres güvenilmez', () => {
  const a = clientAddress(req(undefined), AUTO);
  assert.equal(a.reliable, false);
  assert.equal(a.ip, 'bilinmiyor');
});
