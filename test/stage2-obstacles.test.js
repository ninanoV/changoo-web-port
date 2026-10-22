import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createPlayer, collisionAt } from '../web/game.js';
import { createActor, stepActor, hitActor, createProjectile, stepProjectile, hitProjectile, createWorld, stepWorld } from '../web/objects.js';
import { createSurface, stepSurface, touchSurface, surfaceSprite } from '../web/surfaces.js';
import { STAGE2_OBSTACLES } from '../web/stage2-obstacle-data.js';
import { obstacleSprite } from '../web/stage2-obstacles.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage2-obstacles.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y), camera = { x: 6200, y: 1000 };
const spring = (kind) => [68, 69, 89, 91, 94].includes(kind);
const create = (kind) => spring(kind) ? createSurface(kind, 6500, 1200) : kind >= 93 ? createProjectile({ type: kind, x: 6500, y: 1200, vx: kind === 93 ? -10 : 0, vy: kind === 93 ? -10 : 6 }) : createActor(kind, 6500, 1200);
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}: ${key}`);
}

test('dropper, pickup, springs and both projectiles match their native constructor bodies and assets', () => {
  assert.deepEqual(STAGE2_OBSTACLES, fixture.metadata);
  for (const [key, data] of Object.entries(fixture.metadata)) {
    const actor = create(Number(key));
    compare(actor, data.initial, key);
    assert.deepEqual(Object.values(actor.body), data.body);
    for (const name of data.images) decodeImage(archive.get(name));
  }
});

for (const { kind, initial, trace } of fixture.traces) {
  test(`kind ${kind}: native animation, movement, emission and expiry agree`, () => {
    const actor = Object.assign(create(kind), initial);
    for (const [tick, { expected, spawns }] of trace.entries()) {
      let emitted = [];
      if (spring(kind)) stepSurface(actor, sample);
      else if (kind >= 93) stepProjectile(actor, sample, false, camera);
      else emitted = stepActor(actor, createPlayer(6500, 1200), sample);
      compare(actor, expected, `${kind} tick ${tick}`);
      assert.deepEqual(emitted, spawns);
      const name = spring(kind) ? surfaceSprite(actor) : kind === 42 ? 'life.app' : obstacleSprite(actor);
      if (name) assert.ok(archive.has(name));
    }
  });
}

test('native contacts cover life/100-point bonuses, spring forms and projectile immunity', () => {
  const states = { 0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash' };
  for (const { kind, scenario, before, player, onPlatform, actor: expected, sounds } of fixture.contacts) {
    const actor = create(kind), p = Object.assign(createPlayer(before.x, before.y), before, { state: states[before.state] });
    const played = spring(kind) ? touchSurface(p, actor) : kind >= 93 ? hitProjectile(p, actor) : hitActor(p, actor);
    for (const [key, value] of Object.entries(player)) assert.equal(p[key], key === 'state' ? states[value] : value, `${kind}/${scenario} ${key}`);
    assert.equal(p.onPlatform, onPlatform);
    compare(actor, expected, `${kind}/${scenario}`);
    if (kind === 42) assert.deepEqual(played, sounds.map((name) => name === 'existing-effect' ? 'BONUS.WAV' : name));
  }
});

test('ordinary offscreen shots wait while a falling obstacle is removed with its native sound once', () => {
  const world = createWorld([]), p = createPlayer(6500, 1200);
  world.projectiles.push(createProjectile({ type: 95, x: 9000, y: 1000, vx: 4, vy: 0 }), createProjectile({ type: 98, x: 6500, y: 1381, vx: 0, vy: 6 }));
  assert.deepEqual(stepWorld(world, p, {}, camera, () => 0), ['CHULFUCK.WAV']);
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].x, 9000);
  assert.deepEqual(stepWorld(world, p, {}, camera, () => 0), []);
});
