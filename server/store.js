// Kalıcı yönetim verisi: ban listesi, aynı IP kuralından muaf (izinli) adresler, IP kuralı ve admin şifresi.
// <veri klasörü>/admin.json dosyasında saklanır. Diski kalıcı olmayan sunucularda (ör. Render ücretsiz plan: sunucu
// uyuyup uyanınca dosyalar sıfırlanır) kalıcı ayar ortam değişkenleriyle yapılır:
//   ADMIN_PASSWORD, IP_RULE (ban | block | off), BANNED_IPS ve ALLOWED_IPS (virgülle ayrılmış adresler).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseIpKey } from './ip.js';

export const IP_RULES = ['ban', 'block', 'off'];
const FILE = 'admin.json';
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
  #file; #log; #bans; #allow; #envBans; #envAllow; #rule; #ruleSaved; #filePassword;

  // dir: veri klasörü, env: ortam değişkenleri, log: uyarıların yazılacağı yer (console gibi)
  constructor({ dir, env = {}, log = console }) {
    this.#file = path.join(dir, FILE);
    this.#log = log;
    this.persistent = true;
    this.#envBans = new Map(parseIpList(env.BANNED_IPS).map((ip) => [ip, { ip, reason: 'BANNED_IPS ortam değişkeni', by: 'ayar', names: [], at: 0, fixed: true }]));
    this.#envAllow = new Set(parseIpList(env.ALLOWED_IPS));

    const data = this.#load();
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
    this.#save(); // açılışta bir kez yazılır: klasör yazılabilir mi baştan belli olsun
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

  #save() {
    const data = {
      version: 1,
      password: this.#filePassword || undefined,
      ipRule: this.#ruleSaved ? this.#rule : undefined,
      bans: [...this.#bans.values()],
      allow: [...this.#allow],
    };
    try {
      fs.mkdirSync(path.dirname(this.#file), { recursive: true });
      const tmp = `${this.#file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.#file);
      this.persistent = true;
    } catch (err) {
      if (this.persistent) this.#log.warn(`Yönetim verisi diske yazılamadı (${this.#file}): ${err.message}. Banlar ve ayarlar sunucu kapanınca kaybolur.`);
      this.persistent = false;
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
