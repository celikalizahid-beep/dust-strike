// İstemcinin gerçek IP adresi ve ban anahtarı.
// Sunucu bir vekilin (Render, Cloudflare tüneli, nginx) arkasındaysa bağlantı adresi vekilin adresidir; gerçek adres
// HTTP başlıklarından okunur. Bu başlıkları istemci de yazabildiği için yalnızca bilinen bir vekilin eklediğine
// güvenilir. Adres güvenilir biçimde bulunamazsa "reliable: false" döner: böyle bağlantılara aynı IP kuralı
// uygulanmaz (yanlış ayarlı bir vekil yüzünden herkesin aynı IP sayılıp banlanmasındansa kuralın işlememesi yeğdir).
import net from 'node:net';

const FORWARD_HEADERS = ['x-forwarded-for', 'cf-connecting-ip', 'true-client-ip', 'x-real-ip', 'forwarded'];

// IPv6 adresini 8 sayıya açar ("::" ve sondaki gömülü IPv4 dahil). Adres net.isIP ile doğrulanmış olmalı.
function expand6(s) {
  const parse = (part) => {
    if (!part) return [];
    const out = [];
    for (const p of part.split(':')) {
      if (p.includes('.')) {
        const b = p.split('.').map(Number);
        out.push((b[0] << 8) | b[1], (b[2] << 8) | b[3]);
      } else out.push(parseInt(p, 16));
    }
    return out;
  };
  const i = s.indexOf('::');
  if (i < 0) return parse(s);
  const head = parse(s.slice(0, i)), tail = parse(s.slice(i + 2));
  return [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
}

// 8 sayıyı kısa yazıma çevirir: en uzun (en az 2'li) sıfır dizisi "::" olur
function compress6(groups) {
  let best = -1, bestLen = 1;
  for (let i = 0; i < 8; i++) {
    if (groups[i] !== 0) continue;
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const hex = (list) => list.map((g) => g.toString(16)).join(':');
  if (best < 0) return hex(groups);
  return `${hex(groups.slice(0, best))}::${hex(groups.slice(best + bestLen))}`;
}

// Adresi tek biçime getirir (IPv4 eşlemeli IPv6 → IPv4, küçük harf, kısa yazım). Geçersizse null.
export function normalizeIp(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'));
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const version = net.isIP(s);
  if (version === 4) return s;
  if (version !== 6) return null;
  const g = expand6(s);
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  }
  return compress6(g);
}

export function isLoopback(ip) {
  return typeof ip === 'string' && (ip === '::1' || (net.isIPv4(ip) && ip.startsWith('127.')));
}

// Özel ağ adresleri (ev / şirket ağı, operatör NAT'ı, bağlantı-yerel). Yerel döngü (127.x) buraya girmez.
export function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const first = expand6(ip)[0];
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

// Ban ve "aynı IP" karşılaştırması için anahtar. IPv6'da ev / operatör bir cihaza /64 ağ verir ve cihaz bu ağın
// içinde adres değiştirebilir; o yüzden IPv6 adresleri ağ öneki (/64) ile karşılaştırılır.
export function ipKey(ip) {
  if (!net.isIPv6(ip) || isLoopback(ip)) return ip;
  const g = expand6(ip);
  return `${compress6([g[0], g[1], g[2], g[3], 0, 0, 0, 0])}/64`;
}

// Elle yazılan adresi (admin paneli, BANNED_IPS) ban anahtarına çevirir. Yalnızca tek IPv4 adresi ya da IPv6 /64 ağı
// kabul edilir; "1.2.3.0/24" gibi aralıklar desteklenmez. Geçersizse null.
export function parseIpKey(text) {
  if (typeof text !== 'string') return null;
  const [addr, prefix, ...rest] = text.trim().split('/');
  const ip = normalizeIp(addr);
  if (!ip || rest.length) return null;
  if (prefix !== undefined && prefix !== (net.isIPv4(ip) ? '32' : '64')) return null;
  return ipKey(ip);
}

// TRUST_PROXY: boş / auto = kendiliğinden (Render'da ve aynı makinedeki vekilde başlıklara güvenilir),
// 0 = hiç güvenme, 1 = X-Forwarded-For, başka değer = güvenilecek başlığın adı (ör. x-real-ip).
export function parseTrust(env) {
  const v = String(env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (v === '' || v === 'auto') return { mode: 'auto', render: !!env.RENDER };
  if (v === '0' || v === 'false' || v === 'off') return { mode: 'off' };
  if (v === '1' || v === 'true') return { mode: 'header', header: 'x-forwarded-for' };
  if (!/^[a-z0-9-]+$/.test(v)) throw new Error(`TRUST_PROXY geçersiz: "${env.TRUST_PROXY}" (0, 1 ya da bir başlık adı olmalı)`);
  return { mode: 'header', header: v };
}

// Başlıktaki adres. Liste biçimli başlıkta (X-Forwarded-For) which: 'first' ya da 'last' (son = vekilin eklediği).
function headerIp(headers, name, which = 'last') {
  const value = headers[name];
  if (typeof value !== 'string' || !value) return null;
  const parts = value.split(',');
  return normalizeIp(which === 'first' ? parts[0] : parts[parts.length - 1]);
}

// req: { socket: { remoteAddress }, headers }. Dönen: { ip, key, reliable, loopback, via }
export function clientAddress(req, trust) {
  const headers = req.headers || {};
  const sock = normalizeIp(req.socket?.remoteAddress);
  if (!sock) return { ip: 'bilinmiyor', key: 'bilinmiyor', reliable: false, loopback: false, via: 'socket' };
  const out = (ip, reliable, via) => ({ ip, key: ipKey(ip), reliable, loopback: isLoopback(ip), via });
  // Vekilden gelen adres gerçek bir internet adresi olmalı; değilse vekil zinciri beklendiği gibi değildir
  const viaHeader = (ip, name) => out(ip, !isPrivate(ip) && !isLoopback(ip), name);

  if (trust.mode === 'off') return out(sock, true, 'socket');
  if (trust.mode === 'header') {
    const ip = headerIp(headers, trust.header);
    return ip ? viaHeader(ip, trust.header) : out(sock, false, 'socket');
  }
  if (trust.render) {
    // Render'ın önünde Cloudflare vardır: bu başlıkları Cloudflare yazar, istemci değiştiremez.
    for (const name of ['cf-connecting-ip', 'true-client-ip']) {
      const ip = headerIp(headers, name);
      if (ip) return viaHeader(ip, name);
    }
    // X-Forwarded-For'un başına istemci istediğini ekleyebilir: adres gösterilir ama güvenilmez
    const ip = headerIp(headers, 'x-forwarded-for', 'first');
    return ip ? out(ip, false, 'x-forwarded-for') : out(sock, false, 'socket');
  }
  if (isLoopback(sock)) {
    // Aynı makinede çalışan tünel ya da vekil (ör. cloudflared)
    const cf = headerIp(headers, 'cf-connecting-ip');
    if (cf) return viaHeader(cf, 'cf-connecting-ip');
    const xff = headerIp(headers, 'x-forwarded-for');
    if (xff) return viaHeader(xff, 'x-forwarded-for');
    return out(sock, true, 'socket');
  }
  // Doğrudan bağlantı. Özel ağdan gelip yönlendirme başlığı taşıyan istek, tanınmayan bir vekilden geliyor olabilir.
  const forwarded = FORWARD_HEADERS.some((name) => headers[name]);
  return out(sock, !(forwarded && isPrivate(sock)), 'socket');
}
