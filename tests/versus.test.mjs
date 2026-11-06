// 1:1 대결 서버: 실제 server.mjs를 띄우고 폰 두 대 흉내(웹소켓)로 경기를 끝까지 해 본다.
// 두 폰이 서버가 보낸 판정을 각자 경기에 반영했을 때 서버 경기와 같은지(chk) 공마다 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTeam } from '../js/data/rosters.js';
import { createMatch, matchup, applyDecision, changePitcher } from '../js/core/match.js';
import { availableRelievers } from '../js/core/team.js';
import { createRng } from '../js/core/rng.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOf = m => { const g = m.game; return [g.inning, g.half, g.outs, g.balls, g.strikes, g.score.away, g.score.home, g.bases.map(Number).join('')].join('|'); };

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.mjs', '0'], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', d => { out += d; const m = out.match(/포트 (\d+)/); if (m) resolve({ p, port: +m[1] }); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
  });
}
// 메시지를 차례로 받는 웹소켓 손님
function client(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), box = [], waits = [];
    ws.onmessage = ev => { const m = JSON.parse(ev.data); const w = waits.findIndex(x => x.f(m)); if (w >= 0) waits.splice(w, 1)[0].r(m); else box.push(m); };
    ws.onopen = () => resolve({
      send: m => ws.send(JSON.stringify(m)),
      next: (f = () => true, ms = 4000) => new Promise((r, j) => {
        const i = box.findIndex(f); if (i >= 0) return r(box.splice(i, 1)[0]);
        const w = { f, r: m => { clearTimeout(t); r(m); } };
        const t = setTimeout(() => { waits.splice(waits.indexOf(w), 1); j(new Error('timeout')); }, ms);
        waits.push(w);
      }),
      close: () => ws.close(),
    });
    ws.onerror = reject;
  });
}

test('two phones play a full game and stay in sync with the server', async () => {
  const { p, port } = await startServer();
  try {
    const A = await client(port), B = await client(port);
    A.send({ t: 'create', team: 'samsung', innings: 3, level: 'hard' });
    const created = await A.next(m => m.t === 'created');
    assert.match(created.code, /^\d{4}$/);
    B.send({ t: 'join', code: '0000' === created.code ? '9999' : '0000', team: 'lg' });
    assert.equal((await B.next(m => m.t === 'error')).t, 'error');               // 없는 코드
    B.send({ t: 'join', code: created.code, team: 'lg' });
    const sa = await A.next(m => m.t === 'start'), sb = await B.next(m => m.t === 'start');
    assert.equal(sa.side, 'home'); assert.equal(sb.side, 'away'); assert.equal(sa.level, 'hard');
    // 두 폰이 각자 만드는 경기(같은 정보 → 같은 경기)
    const mk = s => createMatch({ userTeam: getTeam(s.home.team), cpuTeam: getTeam(s.away.team), userLineup: s.home.lineup, cpuLineup: s.away.lineup,
      cpuStarterId: s.away.lineup.starterId, innings: s.innings, rng: () => 0 });
    let ma = mk(sa), mb = mk(sb);
    const phones = { home: A, away: B };
    const rng = createRng(7);
    let n = 0, pitches = 0, changed = false;
    while (!ma.game.over && pitches < 600) {
      const mu = matchup(ma), P = phones[mu.pitchingSide], Bt = phones[mu.battingSide];
      // 3회에 원정팀이 투수를 한 번 바꿔 본다
      if (!changed && ma.game.inning === 2 && mu.pitchingSide === 'away') {
        const id = availableRelievers(ma.teams.away, ma.used.away, ma.pitcher.away)[0].id;
        P.send({ t: 'change', n, pitcherId: id });
        const ca = await A.next(m => m.t === 'change'), cb = await B.next(m => m.t === 'change');
        ma = changePitcher(ma, ca.side, ca.pitcherId); mb = changePitcher(mb, cb.side, cb.pitcherId); n = ca.n;
        assert.equal(ca.chk, checkOf(ma)); assert.equal(cb.chk, checkOf(mb)); assert.equal(ma.pitcher.away, id);
        changed = true; continue;
      }
      const type = mu.pitcher.pitches[Math.floor(rng() * mu.pitcher.pitches.length)];
      P.send({ t: 'throw', n, type, target: { x: rng() * 1.6 - 0.8, y: rng() * 1.6 - 0.8 }, gaugePos: 0.5 + (rng() - 0.5) * 0.1 });
      Bt.send({ t: 'ready', n });                           // 타자 폰이 준비돼야 공이 나온다
      const pa = await A.next(m => m.t === 'pitch'), pb = await B.next(m => m.t === 'pitch');
      assert.deepEqual(pa.pitch, pb.pitch);
      const r = rng();
      if (r < 0.55) Bt.send({ t: 'swing', n, diff: (rng() - 0.5) * 80, bat: { x: pa.pitch.plate.x + (rng() - 0.5) * 0.3, y: pa.pitch.plate.y + (rng() - 0.5) * 0.3 } });
      else Bt.send({ t: 'take', n });
      const ra = await A.next(m => m.t === 'result'), rb = await B.next(m => m.t === 'result');
      assert.deepEqual(ra, rb);
      ma = applyDecision(ma, pa.pitch, ra.d).match; mb = applyDecision(mb, pb.pitch, rb.d).match;
      assert.equal(checkOf(ma), ra.chk); assert.equal(checkOf(mb), ra.chk);
      n = ra.n; pitches++;
    }
    assert.ok(ma.game.over, 'game finished');
    assert.ok(pitches > 20);
    // 한쪽이 나가면 다른 쪽에 알려 준다
    A.send({ t: 'leave' });
    assert.equal((await B.next(m => m.t === 'left')).t, 'left');
    B.close();
  } finally { p.kill(); }
});

test('server ignores moves out of turn', async () => {
  const { p, port } = await startServer();
  try {
    const A = await client(port), B = await client(port);
    A.send({ t: 'create', team: 'kia', innings: 1, level: 'easy' });
    const { code } = await A.next(m => m.t === 'created');
    B.send({ t: 'join', code, team: 'kia' });
    await A.next(m => m.t === 'start'); await B.next(m => m.t === 'start');
    // 1회초: 홈(A)이 던지고 원정(B)이 친다. B가 던지거나 A가 치면 무시된다
    B.send({ t: 'throw', n: 0, type: 'FB', target: { x: 0, y: 0 }, gaugePos: 0.5 });
    A.send({ t: 'ready', n: 0 });
    await assert.rejects(A.next(m => m.t === 'pitch', 800));
    A.send({ t: 'throw', n: 0, type: 'FB', target: { x: 0, y: 0 }, gaugePos: 0.5 });
    await assert.rejects(A.next(m => m.t === 'pitch', 800));     // 타자(B)가 아직 준비 안 됨
    B.send({ t: 'ready', n: 0 });
    await A.next(m => m.t === 'pitch');
    A.send({ t: 'swing', n: 0, diff: 0 });                    // 투수가 스윙: 무시
    await assert.rejects(A.next(m => m.t === 'result', 800));
    B.send({ t: 'take', n: 0 });
    const r = await A.next(m => m.t === 'result');
    assert.equal(r.n, 1);
    A.close(); B.close();
  } finally { p.kill(); }
});
