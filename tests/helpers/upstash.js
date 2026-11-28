// Upstash Redis REST arayüzünün testler için küçük bir taklidi.
import http from 'node:http';

// Upstash REST taklidi: POST / gövdesi ["GET", k] ya da ["SET", k, v]; Authorization: Bearer <token>
export function fakeUpstash(token = 'gizli-token') {
  const data = new Map();
  const calls = [];
  let down = false;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (down) return send(503, { error: 'kapalı' });
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Unauthorized' });
      const cmd = JSON.parse(body);
      calls.push(cmd[0]);
      if (cmd[0] === 'GET') return send(200, { result: data.has(cmd[1]) ? data.get(cmd[1]) : null });
      if (cmd[0] === 'SET') { data.set(cmd[1], cmd[2]); return send(200, { result: 'OK' }); }
      send(400, { error: 'bilinmeyen komut' });
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${srv.address().port}`, token, data, calls,
    setDown(v) { down = v; },
    close: () => new Promise((r) => srv.close(r)),
  })));
}
