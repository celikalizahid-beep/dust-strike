// Admin API (/admin/api/*): şifreli giriş, oyuncu ve ban yönetimi. Sayfası public/admin.html.
// Oyunla bağlantı "game" nesnesi üzerindendir (server.js verir); böylece bu dosya oyun kurallarını bilmez.
import crypto from 'node:crypto';
import { parseIpKey, isLoopback } from './ip.js';
import { IP_RULES } from './store.js';

const SESSION_MS = 12 * 60 * 60 * 1000; // oturum süresi
const MAX_FAILS = 5;                    // bu kadar yanlış şifreden sonra adres kilitlenir
const LOCK_MS = 10 * 60 * 1000;
const MAX_BODY = 4096;
const IP_RULE_NAMES = { ban: 'engelle ve IP\'yi banla', block: 'sadece engelle', off: 'kapalı' };

// Son olaylar (giriş, ban, atma, engellenen bağlantı...): bellekte tutulur, sunucu kapanınca silinir
export class EventLog {
  constructor(max = 300) { this.max = max; this.items = []; }
  add(type, text, ip = '') {
    this.items.push({ t: Date.now(), type, text, ip });
    if (this.items.length > this.max) this.items.shift();
  }
  list() { return [...this.items].reverse(); }
}

class HttpError extends Error {
  constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

// Yalnızca JSON gövde kabul edilir: başka bir sitedeki form bu adrese istek gönderemesin (tarayıcı JSON'u ön kontrolsüz yollamaz)
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { req.resume(); return reject(new HttpError(415, 'İstek JSON olmalı')); }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'İstek çok büyük')); req.destroy(); } else chunks.push(c);
    });
    req.on('error', () => reject(new HttpError(400, 'İstek okunamadı')));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch { reject(new HttpError(400, 'Geçersiz JSON')); }
    });
  });
}

const reasonOf = (v) => (typeof v === 'string' ? v.replace(/[\r\n\t]/g, ' ').trim().slice(0, 200) : '');

// store: AdminStore, events: EventLog, addressOf(req): istemci adresi, game: oyun tarafı işlemleri
export function createAdminApi({ store, events, game, addressOf }) {
  const sessions = new Map(); // oturum anahtarı → bitiş zamanı
  const fails = new Map();    // adres → { n, until }
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  // Karşılaştırma süresi şifrenin ne kadarının doğru olduğunu ele vermesin
  const passwordOk = (given) => crypto.timingSafeEqual(digest(given), digest(store.password));

  function prune(now) {
    for (const [k, exp] of sessions) if (exp < now) sessions.delete(k);
    for (const [k, f] of fails) if (f.until < now) fails.delete(k);
  }

  function tokenOf(req) {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!m) return null;
    const exp = sessions.get(m[1]);
    if (!exp || exp < Date.now()) { sessions.delete(m[1]); return null; }
    return m[1];
  }

  async function login(req, res) {
    const now = Date.now();
    prune(now);
    const addr = addressOf(req);
    const f = fails.get(addr.key);
    if (f && f.n >= MAX_FAILS) {
      throw new HttpError(429, 'Çok fazla yanlış deneme. Bir süre sonra tekrar dene.', { 'Retry-After': String(Math.ceil((f.until - now) / 1000)) });
    }
    const body = await readJson(req);
    if (typeof body.password !== 'string' || !passwordOk(body.password)) {
      const cur = f || { n: 0, until: now + LOCK_MS };
      cur.n++;
      fails.set(addr.key, cur);
      events.add('loginfail', `Admin girişi başarısız (${addr.ip}), deneme ${cur.n}/${MAX_FAILS}`, addr.key);
      throw new HttpError(401, 'Şifre yanlış');
    }
    fails.delete(addr.key);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, now + SESSION_MS);
    events.add('login', `Admin girişi (${addr.ip})`, addr.key);
    sendJson(res, 200, { token, expiresIn: SESSION_MS / 1000 });
  }

  const actions = {
    'GET /state': (req, res) => sendJson(res, 200, {
      now: Date.now(),
      server: game.serverInfo(),
      settings: { ipRule: store.ipRule },
      persistent: store.persistent,
      passwordSource: store.passwordSource,
      players: game.players(),
      lobby: game.lobbyCount(),
      bans: store.bans(),
      allow: store.allowed(),
      log: events.list(),
      warnings: game.warnings(),
    }),

    'POST /kick': async (req, res) => {
      const body = await readJson(req);
      const name = game.kick(body.id, reasonOf(body.reason));
      if (name === null) throw new HttpError(404, 'Oyuncu bulunamadı (çıkmış olabilir)');
      sendJson(res, 200, { ok: true, name });
    },

    // { id } ile oyuncunun IP'si, { ip } ile yazılan adres banlanır
    'POST /ban': async (req, res) => {
      const body = await readJson(req);
      let key, names = [];
      if (body.id !== undefined) {
        const p = game.player(body.id);
        if (!p) throw new HttpError(404, 'Oyuncu bulunamadı (çıkmış olabilir)');
        if (!p.reliable) throw new HttpError(400, 'Bu oyuncunun IP adresi güvenilir biçimde belirlenemiyor; IP ile banlanamaz (sayfadaki uyarıya bak).');
        key = p.ipKey;
        names = [p.name];
      } else {
        key = parseIpKey(body.ip);
        if (!key) throw new HttpError(400, 'Geçersiz IP adresi. Tek bir IPv4 adresi ya da IPv6 adresi yaz.');
      }
      if (isLoopback(key)) throw new HttpError(400, 'Yerel adres (bu bilgisayar) banlanamaz.');
      const ban = game.banIp(key, { reason: reasonOf(body.reason), by: 'admin', names });
      sendJson(res, 200, { ok: true, ban });
    },

    'POST /unban': async (req, res) => {
      const body = await readJson(req);
      const key = parseIpKey(body.ip);
      const result = key ? game.unbanIp(key) : 'none';
      if (result === 'none') throw new HttpError(404, 'Bu adres ban listesinde yok');
      if (result === 'fixed') throw new HttpError(409, 'Bu ban BANNED_IPS ortam değişkeninden geliyor; sunucu ayarlarından kaldırılmalı.');
      sendJson(res, 200, { ok: true });
    },

    // Aynı IP kuralından muaf adresler: { ip, on: true | false }
    'POST /allow': async (req, res) => {
      const body = await readJson(req);
      const key = parseIpKey(body.ip);
      if (!key) throw new HttpError(400, 'Geçersiz IP adresi');
      if (body.on) {
        store.allow(key);
        events.add('allow', `${key} izinli listeye eklendi (aynı IP kuralı uygulanmaz)`, key);
      } else {
        if (!store.disallow(key)) throw new HttpError(404, 'Bu adres izinli listede yok (ALLOWED_IPS ile verildiyse sunucu ayarlarından kaldırılmalı)');
        events.add('allow', `${key} izinli listeden çıkarıldı`, key);
      }
      sendJson(res, 200, { ok: true });
    },

    'POST /settings': async (req, res) => {
      const body = await readJson(req);
      if (!IP_RULES.includes(body.ipRule)) throw new HttpError(400, `ipRule şunlardan biri olmalı: ${IP_RULES.join(', ')}`);
      store.setIpRule(body.ipRule);
      events.add('settings', `Aynı IP kuralı değişti: ${IP_RULE_NAMES[body.ipRule]}`);
      sendJson(res, 200, { ok: true });
    },

    'POST /say': async (req, res) => {
      const body = await readJson(req);
      const text = reasonOf(body.text);
      if (!text) throw new HttpError(400, 'Mesaj boş');
      game.say(text);
      events.add('say', `Duyuru: ${text}`);
      sendJson(res, 200, { ok: true });
    },
  };

  // route: "/admin/api" sonrasındaki yol (ör. "/login")
  return async function handle(req, res, route) {
    try {
      if (route === '/login' && req.method === 'POST') return await login(req, res);
      const token = tokenOf(req);
      if (!token) { req.resume(); throw new HttpError(401, 'Giriş yapılmamış ya da oturum süresi dolmuş'); }
      if (route === '/logout' && req.method === 'POST') { req.resume(); sessions.delete(token); return sendJson(res, 200, { ok: true }); }
      const action = actions[`${req.method} ${route}`];
      if (!action) { req.resume(); throw new HttpError(404, 'Böyle bir işlem yok'); }
      await action(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message }, err.headers);
      console.error('Admin API hatası:', err);
      sendJson(res, 500, { error: 'Sunucu hatası' });
    }
  };
}
