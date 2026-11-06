// 1:1 대결 서버: 게임 파일을 보내 주고(serve.py 대신), /ws 로 두 폰을 이어 경기를 진행한다.
// 실행: node server.mjs [포트]   → 같은 와이파이의 폰에서 http://<이 컴퓨터 주소>:포트 로 접속
// 판정은 서버가 한다: 투수 폰이 고른 구종·위치·게이지 → 서버가 공을 만들고, 타자 폰의 스윙 타이밍 → 서버가 결과를 정해
// 두 폰에 똑같이 보낸다. 폰들은 받은 결과를 각자 경기에 반영(applyDecision, 난수 없음)하므로 두 화면의 경기가 같다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getTeam } from './js/data/rosters.js';
import { createRng } from './js/core/rng.js';
import { computePitch, PITCH_TYPES } from './js/core/pitch.js';
import { createMatch, matchup, decideSwing, applyDecision, changePitcher } from './js/core/match.js';
import { defaultLineup, isValidLineup } from './js/core/team.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 8000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// ── 파일 보내기 ──
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || p.includes('/.') || p.startsWith('/assets/raw/')) { res.writeHead(404); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

// ── 웹소켓(RFC 6455, 글자 메시지만) ──
server.on('upgrade', (req, sock) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws' || !req.headers['sec-websocket-key']) return sock.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const client = { sock, room: null, side: null, alive: true };
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return sock.destroy();
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let data = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const k = buf.subarray(off, off + 4); data = Buffer.from(data.map((b, i) => b ^ k[i & 3])); }
      buf = buf.subarray(need);
      if (op === 8) { sock.end(frame(Buffer.alloc(0), 8)); return; }
      if (op === 9) { sock.write(frame(data, 10)); continue; }
      if (op === 10) { client.alive = true; continue; }
      if (op === 1 || op === 0) {
        parts.push(data);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; let msg; try { msg = JSON.parse(text); } catch (e) { continue; } onMessage(client, msg); }
      }
    }
  });
  sock.on('close', () => onClose(client));
  sock.on('error', () => sock.destroy());
});
function frame(payload, op = 1) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
    : Buffer.concat([Buffer.from([0x80 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, payload]);
}
const send = (client, msg) => { if (client && !client.sock.destroyed) client.sock.write(frame(Buffer.from(JSON.stringify(msg)))); };

// ── 방과 경기 ──
const rooms = new Map();
const LEVELS = ['easy', 'normal', 'hard'];
const newCode = () => { for (;;) { const c = String(1000 + crypto.randomInt(9000)); if (!rooms.has(c)) return c; } };
const both = (room, msg) => { send(room.players.home, msg); send(room.players.away, msg); };
const lineupFor = (team, l) => (isValidLineup(team, l) ? { order: [...l.order], starterId: l.starterId } : defaultLineup(team));
// 두 폰이 같은 경기를 보고 있는지 확인용 요약
const check = m => { const g = m.game; return [g.inning, g.half, g.outs, g.balls, g.strikes, g.score.away, g.score.home, g.bases.map(Number).join('')].join('|'); };

function onMessage(c, msg) {
  const room = c.room;
  switch (msg.t) {
    case 'create': {
      const team = getTeam(msg.team);
      if (!team || room) return send(c, { t: 'error', msg: '방을 만들 수 없어요' });
      const code = newCode();
      const r = { code, players: { home: c, away: null }, setup: { home: { team, lineup: lineupFor(team, msg.lineup) } },
        innings: [1, 3, 5, 9].includes(+msg.innings) ? +msg.innings : 3, level: LEVELS.includes(msg.level) ? msg.level : 'normal', m: null };
      rooms.set(code, r); c.room = r; c.side = 'home';
      log(`방 ${code} 만듦: ${team.short}, ${r.innings}이닝, ${r.level}`);
      return send(c, { t: 'created', code, innings: r.innings, level: r.level });
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').trim()), team = getTeam(msg.team);
      if (!r || r.players.away || r.m) return send(c, { t: 'error', msg: '그 코드의 방이 없거나 이미 시작했어요' });
      if (!team) return send(c, { t: 'error', msg: '팀을 골라 주세요' });
      r.players.away = c; c.room = r; c.side = 'away';
      r.setup.away = { team, lineup: lineupFor(team, msg.lineup) };
      return start(r);
    }
    case 'leave': return onClose(c);
  }
  if (!room || !room.m || room.m.game.over) return;
  const m = room.m, mu = matchup(m), n = room.n;
  if (msg.n !== n) return;                                 // 이미 지난 상황에 대한 메시지
  switch (msg.t) {
    case 'ready':
      room.ready[c.side] = n; return tryPitch(room);
    case 'throw': {
      if (c.side !== mu.pitchingSide || room.pitch || room.pendingThrow) return;
      if (!mu.pitcher.pitches.includes(msg.type) || !PITCH_TYPES[msg.type]) return;
      const num = v => (Number.isFinite(+v) ? +v : 0);
      room.pendingThrow = { type: msg.type, target: { x: Math.max(-1.6, Math.min(1.6, num(msg.target && msg.target.x))), y: Math.max(-1.6, Math.min(1.6, num(msg.target && msg.target.y))) },
        gaugePos: Math.max(0, Math.min(1, num(msg.gaugePos))) };
      return tryPitch(room);
    }
    case 'swing': case 'take': {
      if (c.side !== mu.battingSide || !room.pitch) return;
      const diff = msg.t === 'swing' && Number.isFinite(+msg.diff) ? Math.max(-5000, Math.min(5000, +msg.diff)) : null;
      const bat = diff != null && msg.bat && Number.isFinite(+msg.bat.x) && Number.isFinite(+msg.bat.y)
        ? { x: Math.max(-1.6, Math.min(1.6, +msg.bat.x)), y: Math.max(-1.6, Math.min(1.6, +msg.bat.y)), level: room.level } : null;
      const d = decideSwing(m, room.pitch, diff, room.rng, bat);
      room.m = applyDecision(m, room.pitch, d).match;
      room.pitch = null; room.n++;
      both(room, { t: 'result', n: room.n, d, seed: Math.floor(room.rng() * 2 ** 31), chk: check(room.m) });
      if (room.m.game.over) log(`방 ${room.code} 경기 끝: ${room.m.game.score.away}:${room.m.game.score.home}`);
      return;
    }
    case 'change': {
      if (c.side !== mu.pitchingSide || room.pitch || room.pendingThrow) return;
      const m2 = changePitcher(m, c.side, msg.pitcherId);
      if (m2 === m) return;
      room.m = m2; room.n++;
      return both(room, { t: 'change', n: room.n, side: c.side, pitcherId: msg.pitcherId, chk: check(room.m) });
    }
  }
}

function start(r) {
  const seed = crypto.randomInt(2 ** 31);
  r.rng = createRng(seed);
  const H = r.setup.home, A = r.setup.away;
  r.m = createMatch({ userTeam: H.team, cpuTeam: A.team, userLineup: H.lineup, cpuLineup: A.lineup, cpuStarterId: A.lineup.starterId, innings: r.innings, rng: r.rng });
  r.n = 0; r.ready = { home: -1, away: -1 }; r.pitch = null; r.pendingThrow = null;
  const info = { t: 'start', code: r.code, innings: r.innings, level: r.level,
    home: { team: H.team.id, lineup: H.lineup }, away: { team: A.team.id, lineup: A.lineup } };
  send(r.players.home, { ...info, side: 'home' });
  send(r.players.away, { ...info, side: 'away' });
  log(`방 ${r.code} 시작: ${A.team.short}(원정) vs ${H.team.short}(홈)`);
}

// 타자 폰이 준비됐고(앞 결과 화면이 끝남) 투수가 던졌으면 공을 만든다
function tryPitch(r) {
  if (!r.pendingThrow || r.pitch) return;
  const mu = matchup(r.m);
  if (r.ready[mu.battingSide] !== r.n) return;
  const t = r.pendingThrow; r.pendingThrow = null;
  r.pitch = computePitch({ pitcher: mu.pitcher, type: t.type, target: t.target, gaugePos: t.gaugePos, pitchCount: r.m.pitchCount[mu.pitchingSide], rng: r.rng, level: r.level });
  both(r, { t: 'pitch', n: r.n, pitch: r.pitch });
}

function onClose(c) {
  const r = c.room;
  c.room = null;
  try { c.sock.end(); } catch (e) { /* 무시 */ }
  if (!r) return;
  const other = c.side === 'home' ? r.players.away : r.players.home;
  if (other) { send(other, { t: 'left' }); other.room = null; }
  rooms.delete(r.code);
  log(`방 ${r.code} 닫힘`);
}

function log(s) { console.log(`[${new Date().toLocaleTimeString()}] ${s}`); }

server.listen(PORT, '0.0.0.0', () => {
  const port = server.address().port;
  const ips = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  console.log(`야구 게임 서버가 켜졌어요 (포트 ${port})`);
  console.log('같은 와이파이의 폰에서 아래 주소 중 하나로 접속하세요:');
  for (const ip of ips) console.log(`  http://${ip}:${port}`);
  console.log(`이 컴퓨터에서는 http://localhost:${port}`);
});
