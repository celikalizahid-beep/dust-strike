// Kalıcı yönetim verisi: ban listesi, aynı IP kuralından muaf (izinli) adresler, IP kuralı ve admin şifresi.
// <veri klasörü>/admin.json dosyasında saklanır. Diski kalıcı olmayan sunucularda (ör. Render ücretsiz plan: sunucu
// uyuyup uyanınca dosyalar sıfırlanır) kalıcı ayar ortam değişkenleriyle yapılır:
//   ADMIN_PASSWORD, IP_RULE (ban | block | off), BANNED_IPS ve ALLOWED_IPS (virgülle ayrılmış adresler).
// Panelden yapılan değişikliklerin de kalıcı olması için ücretsiz bir Upstash Redis veritabanı bağlanabilir:
//   UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN verilirse veri orada da saklanır, açılışta oradan okunur.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseIpKey } from './ip.js';

export const IP_RULES = ['ban', 'block', 'off'];
const FILE = 'admin.json';
const REMOTE_KEY = 'dust-strike:admin';
// Karıştırılan harfler (0/o, 1/l/i) yok: şifre konsoldan okunup elle yazılır
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

const parseIpList = (value) => String(value || '').split(',').map(parseIpKey).filter(Boolean);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanBan(b) {
  if (!b || typeof b.ip !== 'string' || !parseIpKey(b.ip)) return null;
  return {
    ip: parseIpKey(b.ip),
    reason: text(b.reason, 200),
    by: text(b.by, 40) || 'admin',
    names: Array.isArray(b.names) ? b.names.filter((n) => typeof n === 'string').slice(0, 8).map((n) => n.slice(0, 32)) : [],
    at: Number.isFinite(b.at) ? b.at : 0,
  };
}

export class AdminStore {
  #file; #log; #bans; #allow; #envBans; #envAllow; #rule; #ruleSaved; #filePassword; #env;
  #fileOk = true; #remote = null; #dirty = false; #writing = null; #loaded = false; #started = false; #everFailed = false;
  // storage: 'file' (disk), 'remote' (uzak depo çalışıyor) ya da 'remote-error' (uzak depo ayarlı ama ulaşılamıyor)
  storage = 'file';
  storageError = '';

  // dir: veri klasörü, env: ortam değişkenleri, log: uyarıların yazılacağı yer (console gibi)
  constructor({ dir, env = {}, log = console }) {
    this.#file = path.join(dir, FILE);
    this.#log = log;
    this.#env = env;
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      this.#remote = { url: String(env.UPSTASH_REDIS_REST_URL).trim().replace(/\/+$/, ''), token: String(env.UPSTASH_REDIS_REST_TOKEN).trim() };
      this.storage = 'remote-error';
      this.storageError = 'Henüz bağlanılmadı';
    }
    this.#envBans = new Map(parseIpList(env.BANNED_IPS).map((ip) => [ip, { ip, reason: 'BANNED_IPS ortam değişkeni', by: 'ayar', names: [], at: 0, fixed: true }]));
    this.#envAllow = new Set(parseIpList(env.ALLOWED_IPS));

    this.#apply(this.#load());
    this.#save(); // açılışta bir kez yazılır: klasör yazılabilir mi baştan belli olsun
  }

  // Ayarlar kalıcı mı: uzak depo ayarlıysa ona ulaşılabiliyor mu, değilse disk yazılabiliyor mu
  get persistent() { return this.#remote ? this.storage === 'remote' : this.#fileOk; }

  // Uzak depo ayarlıysa açılışta bir kez çağrılır: oradaki veri diskteki verinin yerine geçer.
  // Uzak depo boşsa diskteki veri oraya taşınır. Ulaşılamazsa disk/bellekle devam edilir.
  async init() {
    if (!this.#remote) return;
    this.#started = true;
    try {
      await this.#loadRemote();
      this.#save(); // ilk kullanımda mevcut veri uzak depoya yazılır; sonrakilerde aynı veri geri yazılır
      await this.flush();
    } catch (err) {
      this.#remoteFailed(err);
    }
  }

  // Uzak depodaki veriyi okur. Açılışta okunabildiyse oradaki veri esas alınır. Açılışta ulaşılamayıp sonradan
  // ulaşılırsa iki taraf birleştirilir (aradaki sürede panelden eklenenler kaybolmasın diye).
  async #loadRemote() {
    const raw = await this.#command(['GET', REMOTE_KEY]);
    let data = null;
    if (typeof raw === 'string' && raw) {
      try { data = JSON.parse(raw); } catch { throw new Error('uzak depodaki veri okunamadı'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = null;
    }
    if (data && !this.#everFailed) this.#apply(data);
    else if (data) this.#merge(data);
    this.#loaded = true;
    this.storage = 'remote';
    this.storageError = '';
  }

  #merge(data) {
    for (const b of (Array.isArray(data.bans) ? data.bans : []).map(cleanBan).filter(Boolean)) if (!this.#bans.has(b.ip)) this.#bans.set(b.ip, b);
    for (const ip of (Array.isArray(data.allow) ? data.allow : []).map(parseIpKey).filter(Boolean)) this.#allow.add(ip);
    if (!this.#ruleSaved && IP_RULES.includes(data.ipRule)) { this.#rule = data.ipRule; this.#ruleSaved = true; }
  }

  // Bekleyen uzak depo yazımı bitene kadar bekler
  async flush() {
    while (this.#writing) await this.#writing;
  }

  async #command(cmd) {
    const res = await fetch(this.#remote.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#remote.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(8000),
    });
    let body = null;
    try { body = await res.json(); } catch { /* gövde yok */ }
    if (!res.ok || !body || body.error) throw new Error(`HTTP ${res.status}${body?.error ? `: ${body.error}` : ''}`);
    return body.result;
  }

  #remoteFailed(err) {
    if (!this.#loaded) this.#everFailed = true;
    const first = this.storage !== 'remote-error' || this.storageError === 'Henüz bağlanılmadı';
    this.storage = 'remote-error';
    this.storageError = String(err?.message || err).slice(0, 200);
    if (first) this.#log.warn(`Uzak depoya (Upstash) ulaşılamadı: ${this.storageError}. Panelde yapılanlar sunucu kapanınca kaybolabilir.`);
  }

  // Değişikliği uzak depoya yazar; yazım sürerken gelen değişiklikler bitince tek seferde yazılır
  #pushRemote() {
    this.#dirty = true;
    if (this.#writing) return;
    this.#writing = (async () => {
      while (this.#dirty) {
        this.#dirty = false;
        try {
          if (!this.#loaded) await this.#loadRemote(); // açılışta okunamamıştı: önce oradaki veriyi al
          await this.#command(['SET', REMOTE_KEY, JSON.stringify(this.#snapshot())]);
          this.storage = 'remote';
          this.storageError = '';
        } catch (err) {
          this.#remoteFailed(err);
        }
      }
      this.#writing = null;
    })();
  }

  #apply(data) {
    const env = this.#env;
    this.#bans = new Map((Array.isArray(data.bans) ? data.bans : []).map(cleanBan).filter(Boolean).map((b) => [b.ip, b]));
    this.#allow = new Set((Array.isArray(data.allow) ? data.allow : []).map(parseIpKey).filter(Boolean));
    this.#ruleSaved = IP_RULES.includes(data.ipRule);
    this.#rule = this.#ruleSaved ? data.ipRule : IP_RULES.includes(env.IP_RULE) ? env.IP_RULE : 'ban';
    this.#filePassword = typeof data.password === 'string' && data.password ? data.password : null;
    if (env.ADMIN_PASSWORD) {
      this.password = String(env.ADMIN_PASSWORD);
      this.passwordSource = 'env';
    } else {
      if (!this.#filePassword) this.#filePassword = Array.from({ length: 12 }, () => PASSWORD_CHARS[crypto.randomInt(PASSWORD_CHARS.length)]).join('');
      this.password = this.#filePassword;
      this.passwordSource = 'file';
    }
  }

  #load() {
    let raw;
    try { raw = fs.readFileSync(this.#file, 'utf8'); } catch { return {}; }
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('beklenen biçimde değil');
      return data;
    } catch (err) {
      // Bozuk dosyanın üstüne yazılmaz: kenara alınır ki içindeki ban listesi elle kurtarılabilsin
      const backup = `${this.#file}.bozuk-${Date.now()}`;
      try { fs.renameSync(this.#file, backup); } catch { /* salt okunur disk */ }
      this.#log.warn(`Yönetim verisi okunamadı (${err.message}); varsayılanlarla başlanıyor. Eski dosya: ${backup}`);
      return {};
    }
  }

  #snapshot() {
    return {
      version: 1,
      password: this.#filePassword || undefined,
      ipRule: this.#ruleSaved ? this.#rule : undefined,
      bans: [...this.#bans.values()],
      allow: [...this.#allow],
    };
  }

  #save() {
    const data = this.#snapshot();
    if (this.#remote && this.#started) this.#pushRemote();
    try {
      fs.mkdirSync(path.dirname(this.#file), { recursive: true });
      const tmp = `${this.#file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.#file);
      this.#fileOk = true;
    } catch (err) {
      if (this.#fileOk && !this.#remote) this.#log.warn(`Yönetim verisi diske yazılamadı (${this.#file}): ${err.message}. Banlar ve ayarlar sunucu kapanınca kaybolur.`);
      this.#fileOk = false;
    }
  }

  // ---------------- IP kuralı: aynı IP'den ikinci oyuncu gelince ne olur
  get ipRule() { return this.#rule; }
  setIpRule(rule) {
    if (!IP_RULES.includes(rule)) throw new Error(`ipRule geçersiz: ${rule}`);
    this.#rule = rule;
    this.#ruleSaved = true;
    this.#save();
  }

  // ---------------- Banlar (anahtar: IPv4 adresi ya da IPv6 /64 ağı)
  banOf(key) { return this.#envBans.get(key) || this.#bans.get(key) || null; }
  bans() {
    const own = [...this.#bans.values()].filter((b) => !this.#envBans.has(b.ip)).sort((a, b) => b.at - a.at);
    return [...own, ...this.#envBans.values()];
  }
  ban(key, { reason = '', by = 'admin', names = [] } = {}) {
    const rec = cleanBan({ ip: key, reason, by, names, at: Date.now() });
    if (!rec) throw new Error(`Geçersiz IP: ${key}`);
    this.#bans.set(rec.ip, rec);
    this.#save();
    return rec;
  }
  // Ortam değişkeninden gelen ban buradan kaldırılamaz (false döner)
  unban(key) {
    if (!this.#bans.delete(key)) return false;
    this.#save();
    return true;
  }

  // ---------------- İzinli adresler: aynı IP kuralı uygulanmaz (aynı evden oynayan kardeşler gibi)
  isAllowed(key) { return this.#envAllow.has(key) || this.#allow.has(key); }
  allowed() {
    return [
      ...[...this.#allow].filter((ip) => !this.#envAllow.has(ip)).map((ip) => ({ ip, fixed: false })),
      ...[...this.#envAllow].map((ip) => ({ ip, fixed: true })),
    ];
  }
  allow(key) {
    if (!parseIpKey(key)) throw new Error(`Geçersiz IP: ${key}`);
    this.#allow.add(parseIpKey(key));
    this.#save();
  }
  disallow(key) {
    if (!this.#allow.delete(key)) return false;
    this.#save();
    return true;
  }
}
