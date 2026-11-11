// Uçtan uca testler için: gerçek sunucuyu ayrı bir süreçte başlatır, WebSocket istemcisi ve admin API yardımcıları verir.
// İstemcilerin IP adresi X-Forwarded-For başlığıyla taklit edilir (sunucu TRUST_PROXY=x-forwarded-for ile başlar).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PASSWORD = 'test-şifresi-123';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

export async function startServer(env = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dust-server-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, ADMIN_PASSWORD: PASSWORD, TRUST_PROXY: 'x-forwarded-for', BOTS: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const onData = (d) => { output += d; if (output.includes('çalışıyor')) resolve(); };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { output += d; });
    child.once('exit', (code) => reject(new Error(`sunucu başlamadan kapandı (kod ${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`sunucu 10 sn içinde başlamadı:\n${output}`)), 10000).unref();
  });
  // Bir test hata verip stop() çağrılmadan biterse sunucu süreci test koşucusunu açık tutmasın
  const killOnExit = () => { if (child.exitCode === null) child.kill('SIGKILL'); };
  process.once('exit', killOnExit);
  try { await ready; } catch (err) { killOnExit(); throw err; }
  child.unref(); child.stdout.unref(); child.stderr.unref();
  const url = `http://127.0.0.1:${port}`;
  const clients = new Set();
  return {
    url, port, dataDir,
    output: () => output,
    // ip: istemcinin görünen adresi (verilmezse başlık gönderilmez), cid: tarayıcı kimliği
    connect(opts = {}) { const c = connect(`ws://127.0.0.1:${port}`, opts); clients.add(c); return c; },
    async api(method, route, body, token) {
      const headers = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(url + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let json = null;
      try { json = await res.json(); } catch { /* gövde yok */ }
      return { status: res.status, json, headers: res.headers };
    },
    async login(password = PASSWORD, ip) {
      const res = await fetch(`${url}/admin/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
        body: JSON.stringify({ password }),
      });
      return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
    },
    async token() { return (await this.login()).json.token; },
    async stop() {
      for (const c of clients) c.close();
      if (child.exitCode === null) {
        child.ref();
        const done = new Promise((r) => child.once('exit', r));
        child.kill();
        await done;
      }
      process.removeListener('exit', killOnExit);
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// Gelen mesajları biriktiren WebSocket istemcisi. next(tip): o tipteki sıradaki mesajı bekler.
function connect(wsUrl, { ip, cid, autoPong = true } = {}) {
  const ws = new WebSocket(wsUrl, { headers: ip ? { 'x-forwarded-for': ip } : {}, autoPong });
  const messages = [];
  const waiters = [];
  let closeInfo = null;
  const settle = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      const k = messages.findIndex((m, idx) => idx >= w.from && m.t === w.type);
      if (k >= 0) { waiters.splice(i, 1); clearTimeout(w.timer); w.cursor.at = k + 1; w.resolve(messages[k]); }
      else if (closeInfo) { waiters.splice(i, 1); clearTimeout(w.timer); w.reject(new Error(`"${w.type}" beklenirken bağlantı kapandı (kod ${closeInfo.code}); gelenler: ${messages.map((m) => m.t).join(', ')}`)); }
    }
  };
  ws.on('message', (data) => { messages.push(JSON.parse(data)); settle(); });
  const closed = new Promise((resolve) => ws.on('close', (code, reason) => { closeInfo = { code, reason: String(reason) }; settle(); resolve(closeInfo); }));
  ws.on('error', () => {});
  const opened = new Promise((resolve) => { ws.on('open', resolve); ws.on('close', resolve); });
  const cursors = new Map();
  const client = {
    ws, messages, closed, opened, cid,
    get isClosed() { return !!closeInfo; },
    send(m) { ws.send(JSON.stringify(m)); },
    // Aynı tip için art arda çağrılırsa her seferinde bir sonraki mesajı verir
    next(type, ms = 3000) {
      const cursor = cursors.get(type) || { at: 0 };
      cursors.set(type, cursor);
      return new Promise((resolve, reject) => {
        const w = { type, from: cursor.at, cursor, resolve, reject };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error(`"${type}" mesajı ${ms} ms içinde gelmedi; gelenler: ${messages.map((m) => m.t).join(', ') || '(yok)'}`));
        }, ms);
        waiters.push(w);
        settle();
      });
    },
    has(type) { return messages.some((m) => m.t === type); },
    // Odaya girer: doğana kadar bekler ('spawn'), sunucunun verdiği oyuncu kimliğini döndürür
    async join({ name = 'Oyuncu', mode = 'tdm', map = 'arena', team = 'auto' } = {}) {
      await opened;
      client.send({ t: 'join', name, mode, map, team, cid });
      await client.next('spawn');
      return messages.find((m) => m.t === 'welcome').id;
    },
    tryJoin({ name = 'Oyuncu', mode = 'tdm', map = 'arena', team = 'auto' } = {}) {
      return opened.then(() => client.send({ t: 'join', name, mode, map, team, cid }));
    },
    close() { try { ws.terminate(); } catch { /* zaten kapalı */ } },
  };
  return client;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Koşul sağlanana kadar bekler (sunucunun bir olayı işlemesi için)
export async function until(fn, ms = 3000, what = 'koşul') {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`${what} ${ms} ms içinde sağlanmadı`);
    await sleep(25);
  }
}
