import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { createActor, stepActor, defeatEnemy, createProjectile, stepProjectile, hitProjectile, resolveProjectileTerrain } from '../web/objects.js';
import { FINAL_BOSS_SHOTS } from '../web/final-boss-data.js';
import { STAGE2_ACTORS } from '../web/stage2-actor-data.js';
import { obstacleSprite } from '../web/stage2-obstacles.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-final-bosses.json', import.meta.url)));
const states = {0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
const compare = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${label}/${key}`);
};

test('both final bosses lose ten HP on their native delayed ticks and finish the last physics update', () => {
  let remaining = 2;
  for (const {kind, initial, strikes} of fixture.damage) {
    const actor = Object.assign(createActor(kind, initial.x, initial.y), initial), p = createPlayer(6500, 1200);
    for (const [strike, {trace, sounds, remainingBosses}] of strikes.entries()) {
      assert.deepEqual(defeatEnemy(p, actor), sounds);
      assert.equal(actor.health, 10 - strike, 'damage setter itself preserves HP');
      for (const [tick, expected] of trace.entries()) {
        stepActor(actor, p, () => 0);
        compare(actor, expected, `${kind}/${strike}/${tick}`);
      }
      assert.equal(trace.length, kind === 41 ? 22 : 12);
      if (actor.removed) remaining--;
      assert.equal(remaining, remainingBosses);
    }
    assert.equal(p.points, 10); assert.equal(actor.removed, true);
  }
});

test('final boss attacks and both HUD rows use the original assets and geometry', () => {
  assert.deepEqual(FINAL_BOSS_SHOTS, fixture.shots);
  const heads = fixture.hud.filter(draw => draw.name.startsWith('bsfc'));
  assert.deepEqual(heads, [{name: STAGE2_ACTORS[41].headImage, x: 10, y: 90}, {name: STAGE2_ACTORS[59].headImage, x: 10, y: 50}]);
  assert.equal(fixture.hud.filter(draw => draw.name === 'rlife.app').length, 20);
  for (const type of [99, 67]) {
    const shot = createProjectile({type, x: 6500, y: 1200, vx: 8, vy: 0});
    compare(shot, FINAL_BOSS_SHOTS[type].initial, `${type}/initial`);
    assert.deepEqual(Object.values(shot.body), FINAL_BOSS_SHOTS[type].body);
    if (type === 99) assert.equal(obstacleSprite(shot), FINAL_BOSS_SHOTS[99].images[0]);
  }
});

test('final boss projectiles match native movement, lifetime and camera boundaries', () => {
  for (const {kind, input, trace} of fixture.movement) {
    const shot = createProjectile({type: kind, ...input});
    for (const [tick, {camera, expected}] of trace.entries()) {
      stepProjectile(shot, () => 0, false, camera);
      compare(shot, expected, `${kind}/${input.vx}/${tick}`);
    }
  }
});

test('shock67 ignores grace invulnerability, preserves velocity and survives contact; bullet99 is consumed', () => {
  for (const {kind, vx, before, player, shot: expectedShot, sounds} of fixture.contacts) {
    const p = Object.assign(createPlayer(before.x, before.y), before, {state: states[before.state]});
    const shot = createProjectile({type: kind, x: 6500, y: 1200, vx, vy: 0});
    assert.deepEqual(hitProjectile(p, shot), sounds.map(name => name === 'existing-effect' ? 'DEM-SHIN.WAV' : name));
    compare(p, {...player, state: states[player.state]}, `${kind}/player`);
    compare(shot, expectedShot, `${kind}/shot`);
  }
});

test('bullet99 expires on every native terrain kind and shock67 has no terrain callback', () => {
  for (const {pixel, initial, expected} of fixture.terrain) {
    const shot = Object.assign(createProjectile({type: 99, ...initial}), initial);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(shot, expected, `terrain ${pixel}`);
  }
  for (let pixel = 1; pixel <= 5; pixel++) {
    const shot = createProjectile({type: 67, x: 320, y: 320}), before = structuredClone(shot);
    resolveProjectileTerrain(shot, () => pixel); assert.deepEqual(shot, before);
  }
});
