import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerpPose, seqPose, BAT_POSES, PIT_POSES, pitcherPoseAt, batterPoseAt } from '../js/ui/art/rig.js';
import { uniformFor } from '../js/ui/art/uniforms.js';
import { getTeam } from '../js/data/rosters.js';

test('lerpPose midpoint', () => {
  const m = lerpPose({ a: [0, 0], n: 0 }, { a: [10, -20], n: 4 }, 0.5);
  assert.deepEqual(m, { a: [5, -10], n: 2 });
});
test('seqPose clamps ends', () => {
  const A = { a: [0, 0] }, B = { a: [10, 10] };
  assert.deepEqual(seqPose([[0, A], [1, B]], -1), A);
  assert.deepEqual(seqPose([[0, A], [1, B]], 2), B);
});
test('pitcher holds ball before release, not after', () => {
  assert.equal(pitcherPoseAt(990, 1000, 800).holdBall, true);
  assert.equal(pitcherPoseAt(1010, 1000, 800).holdBall, false);
  assert.equal(pitcherPoseAt(0, null, 800).holdBall, true);
});
test('pitcher reaches release pose at release time', () => {
  assert.deepEqual(pitcherPoseAt(1000, 1000, 800).pose.lH, PIT_POSES.RELEASE.lH);
});
test('batter is in CONTACT pose ~70ms after swing', () => {
  assert.deepEqual(batterPoseAt(1070, { swingAt: 1000 }).hands, BAT_POSES.CONTACT.hands);
});
test('batter stands in stance with no pitch', () => {
  assert.deepEqual(batterPoseAt(5, {}).hands, BAT_POSES.STANCE.hands);
});
test('all poses share the same joint keys', () => {
  for (const set of [BAT_POSES, PIT_POSES]) {
    const keys = Object.values(set).map(p => Object.keys(p).sort().join());
    assert.equal(new Set(keys).size, 1);
  }
});
test('home uniform is white, away is grey, both carry team color', () => {
  const sam = getTeam('samsung'), lg = getTeam('lg');
  const h = uniformFor(sam, 'home'), a = uniformFor(lg, 'away');
  assert.equal(h.jersey.toLowerCase(), '#f4f6f9');
  assert.notEqual(a.jersey.toLowerCase(), '#f4f6f9');
  assert.equal(h.trim, sam.colors.main); assert.equal(a.trim, lg.colors.main);
});
